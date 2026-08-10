package com.lune.app.media

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class UpdateArgs {
    var title: String = ""
    var artist: String = ""
    var coverUrl: String? = null
    var durationMs: Long = 0
    var positionMs: Long = 0
    var playing: Boolean = false
    var canNext: Boolean = false
}

/**
 * Lune 媒体会话插件。
 *
 * - start:申请通知权限(API 33+)并启动前台服务
 * - update:刷新通知栏/锁屏的曲目元数据与播放状态
 * - stop:停止前台服务(离开房间时调用)
 * - 通知栏动作经 [MediaService.actionDispatcher] 以 `action` 事件回传前端
 */
@TauriPlugin
class MediaPlugin(private val activity: Activity) : Plugin(activity) {

    private val notificationPermissionRequestCode = 8471

    override fun load(webView: WebView) {
        super.load(webView)
        MediaService.actionDispatcher = { action ->
            val payload = JSObject()
            payload.put("action", action)
            trigger("action", payload)
        }
    }

    @Command
    fun start(invoke: Invoke) {
        ensureNotificationPermission()
        MediaService.start(activity.applicationContext)
        invoke.resolve()
    }

    @Command
    fun update(invoke: Invoke) {
        val args = invoke.parseArgs(UpdateArgs::class.java)
        MediaService.update(
            activity.applicationContext,
            MediaService.NowPlaying(
                title = args.title,
                artist = args.artist,
                coverUrl = args.coverUrl,
                durationMs = args.durationMs,
                positionMs = args.positionMs,
                playing = args.playing,
                canNext = args.canNext,
            ),
        )
        invoke.resolve()
    }

    @Command
    fun stop(invoke: Invoke) {
        MediaService.stop(activity.applicationContext)
        invoke.resolve()
    }

    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                notificationPermissionRequestCode,
            )
        }
    }
}
