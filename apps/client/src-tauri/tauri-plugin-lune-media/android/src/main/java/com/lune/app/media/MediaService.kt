package com.lune.app.media

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.media.AudioAttributesCompat
import androidx.media.AudioFocusRequestCompat
import androidx.media.AudioManagerCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * 前台服务:持有 MediaSessionCompat 与常驻通知,保证应用切后台/锁屏后
 * 进程不被冻结,WebView 内的 WebSocket 同步与音频得以继续。
 *
 * 音频本体仍在 WebView(AudioEngine)中播放,本服务只负责:
 * 进程保活、锁屏/通知栏元数据展示、媒体按键与通知动作转发。
 */
class MediaService : Service() {

    internal data class NowPlaying(
        val title: String,
        val artist: String,
        val coverUrl: String?,
        val durationMs: Long,
        val positionMs: Long,
        val playing: Boolean,
        val muted: Boolean,
        val canNext: Boolean,
    )

    companion object {
        private const val CHANNEL_ID = "lune_media_playback"
        private const val NOTIFICATION_ID = 4210
        private const val ACTION_START = "com.lune.app.media.action.START"
        private const val ACTION_FAVORITE = "com.lune.app.media.action.FAVORITE"
        private const val ACTION_NEXT = "com.lune.app.media.action.NEXT"
        private const val ACTION_MUTE = "com.lune.app.media.action.MUTE"
        private const val ACTION_RESUME = "com.lune.app.media.action.RESUME"
        private const val ACTION_LEAVE = "com.lune.app.media.action.LEAVE"

        /** 由 MediaPlugin 注入,把通知动作回传给 WebView 前端 */
        @Volatile
        internal var actionDispatcher: ((String) -> Unit)? = null

        /** 由 MediaPlugin 注入，把系统音频中断回传给 WebView 前端。 */
        @Volatile
        internal var audioDispatcher: ((String) -> Unit)? = null

        @Volatile
        private var latest: NowPlaying? = null

        internal fun start(context: Context) {
            val intent = Intent(context, MediaService::class.java).setAction(ACTION_START)
            ContextCompat.startForegroundService(context, intent)
        }

        internal fun update(context: Context, state: NowPlaying) {
            latest = state
            // 服务已在运行时,startService 仅触发一次 onStartCommand 刷新通知
            ContextCompat.startForegroundService(context, Intent(context, MediaService::class.java))
        }

        internal fun stop(context: Context) {
            latest = null
            context.stopService(Intent(context, MediaService::class.java))
        }
    }

    private lateinit var session: MediaSessionCompat
    private lateinit var audioManager: AudioManager
    private lateinit var focusRequest: AudioFocusRequestCompat
    private val coverExecutor = Executors.newSingleThreadExecutor()
    private var coverBitmap: Bitmap? = null
    private var coverLoadedFor: String? = null
    private var noisyReceiverRegistered = false

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> audioDispatcher?.invoke("focus_gain")
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK ->
                audioDispatcher?.invoke("focus_loss")
        }
    }

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                audioDispatcher?.invoke("becoming_noisy")
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
        val audioAttributes = AudioAttributesCompat.Builder()
            .setUsage(AudioAttributesCompat.USAGE_MEDIA)
            .setContentType(AudioAttributesCompat.CONTENT_TYPE_MUSIC)
            .build()
        focusRequest = AudioFocusRequestCompat.Builder(AudioManagerCompat.AUDIOFOCUS_GAIN)
            .setAudioAttributes(audioAttributes)
            .setOnAudioFocusChangeListener(focusListener)
            .build()
        ContextCompat.registerReceiver(
            this,
            noisyReceiver,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        noisyReceiverRegistered = true
        session = MediaSessionCompat(this, "LuneMediaSession")
        session.setCallback(object : MediaSessionCompat.Callback() {
            override fun onSkipToNext() {
                actionDispatcher?.invoke("next")
            }

            override fun onPause() {
                actionDispatcher?.invoke("mute")
            }

            override fun onPlay() {
                requestAudioFocus()
                actionDispatcher?.invoke("resume")
            }
        })
        session.isActive = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> requestAudioFocus()
            ACTION_FAVORITE -> actionDispatcher?.invoke("favorite")
            ACTION_NEXT -> actionDispatcher?.invoke("next")
            ACTION_MUTE -> actionDispatcher?.invoke("mute")
            ACTION_RESUME -> {
                requestAudioFocus()
                actionDispatcher?.invoke("resume")
            }
            ACTION_LEAVE -> actionDispatcher?.invoke("leave")
        }
        refresh()
        return START_STICKY
    }

    override fun onDestroy() {
        AudioManagerCompat.abandonAudioFocusRequest(audioManager, focusRequest)
        if (noisyReceiverRegistered) {
            unregisterReceiver(noisyReceiver)
            noisyReceiverRegistered = false
        }
        session.isActive = false
        session.release()
        coverExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun refresh() {
        val state = latest
        if (state?.coverUrl != coverLoadedFor) coverBitmap = null
        updateSession(state)
        val notification = buildNotification(state)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        maybeLoadCover(state)
    }

    private fun updateSession(state: NowPlaying?) {
        val metadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state?.title ?: "Lune · 一起听")
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state?.artist ?: "")
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, state?.durationMs ?: 0)
            .apply { coverBitmap?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
            .build()
        session.setMetadata(metadata)

        var actions = 0L
        if (state?.canNext == true) actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT
        if (state?.muted == true) {
            actions = actions or PlaybackStateCompat.ACTION_PLAY
        } else if (state?.playing == true) {
            actions = actions or PlaybackStateCompat.ACTION_PAUSE
        }
        val playbackState = PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(
                when {
                    state == null -> PlaybackStateCompat.STATE_STOPPED
                    state.muted -> PlaybackStateCompat.STATE_PAUSED
                    state.playing -> PlaybackStateCompat.STATE_PLAYING
                    else -> PlaybackStateCompat.STATE_PAUSED
                },
                state?.positionMs ?: 0,
                if (state?.playing == true && state.muted != true) 1.0f else 0.0f,
            )
            .build()
        session.setPlaybackState(playbackState)
    }

    private fun buildNotification(state: NowPlaying?): android.app.Notification {
        val style = androidx.media.app.NotificationCompat.MediaStyle()
            .setMediaSession(session.sessionToken)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_lune_notification)
            .setContentTitle(state?.title ?: "Lune · 一起听")
            .setContentText(
                when {
                    state == null -> "播放已被系统中断 · 点按返回房间"
                    state.muted -> "已在本机静音 · 房间仍在播放"
                    else -> state.artist
                },
            )
            .setLargeIcon(coverBitmap)
            .setOngoing(state?.playing == true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(launchAppIntent())

        var compactCount = 0
        builder.addAction(
            android.R.drawable.star_off,
            "送出爱心",
            serviceActionIntent(ACTION_FAVORITE, 1),
        )
        compactCount++
        if (state?.muted == true) {
            builder.addAction(
                android.R.drawable.ic_lock_silent_mode_off,
                "恢复声音",
                serviceActionIntent(ACTION_RESUME, 4),
            )
        } else {
            builder.addAction(
                android.R.drawable.ic_lock_silent_mode,
                "本机静音",
                serviceActionIntent(ACTION_MUTE, 4),
            )
        }
        compactCount++
        if (state?.canNext == true) {
            builder.addAction(
                android.R.drawable.ic_media_next,
                "下一首",
                serviceActionIntent(ACTION_NEXT, 2),
            )
            compactCount++
        }
        builder.addAction(
            android.R.drawable.ic_menu_close_clear_cancel,
            "离开房间",
            serviceActionIntent(ACTION_LEAVE, 3),
        )
        compactCount++

        style.setShowActionsInCompactView(*IntArray(minOf(compactCount, 3)) { it })
        builder.setStyle(style)
        return builder.build()
    }

    private fun requestAudioFocus() {
        val result = AudioManagerCompat.requestAudioFocus(audioManager, focusRequest)
        if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            audioDispatcher?.invoke("focus_gain")
        } else if (result == AudioManager.AUDIOFOCUS_REQUEST_FAILED) {
            audioDispatcher?.invoke("focus_loss")
        }
    }

    private fun launchAppIntent(): PendingIntent? {
        val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            this,
            0,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun serviceActionIntent(action: String, requestCode: Int): PendingIntent {
        val intent = Intent(this, MediaService::class.java).setAction(action)
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun maybeLoadCover(state: NowPlaying?) {
        val url = state?.coverUrl
        if (url.isNullOrBlank()) {
            coverLoadedFor = null
            coverBitmap = null
            return
        }
        if (url == coverLoadedFor || coverExecutor.isShutdown) return
        coverLoadedFor = url
        coverExecutor.execute {
            val bitmap = fetchBitmap(url)
            if (bitmap != null && coverLoadedFor == url) {
                coverBitmap = bitmap
                // 封面就绪后刷新一次通知
                updateSession(latest)
                val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIFICATION_ID, buildNotification(latest))
            }
        }
    }

    private fun fetchBitmap(url: String): Bitmap? {
        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.instanceFollowRedirects = true
            connection.inputStream.use { BitmapFactory.decodeStream(it) }
        } catch (_: Exception) {
            null
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "正在播放",
                NotificationManager.IMPORTANCE_LOW,
            )
            channel.description = "Lune 共听房间的播放状态"
            channel.setShowBadge(false)
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}
