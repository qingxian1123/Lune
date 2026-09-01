# Android 后台播放冲突 · 设计方案

状态：P0 核心链路已落地。后台播放使用前台服务 + MediaSessionCompat 保活，
音频与同步仍在 WebView 内；Android 系统中断只静音本机输出，不改变房间时间线。

## 一、总体原则

1. **房间进度是唯一真相**。任何本机中断(来电、抢焦点、断网)都只影响本机,
   绝不向房间广播 seek/next;恢复时本机向服务端快照对齐。
2. **用「本机静音」替代「暂停」**。Lune 无暂停模型,所有需要"停下来"的系统场景
   (焦点丢失、拔耳机)一律处理为:音频继续静音播放、同步照常。
   好处:恢复零成本(取消静音即已对齐),不破坏产品模型。
3. **中断必须可感知**。静音态在界面与通知上有明确展示与一键恢复。

## 二、冲突清单与对策

| # | 冲突 | 现象 | 对策 | 优先级 |
| --- | --- | --- | --- | --- |
| C1 | 音频焦点缺失 | 其他 App 播放时与 Lune **混音** | 插件申请 AudioFocus;失焦→本机静音,回焦→恢复 | ✅ |
| C2 | 来电/临时失焦 | 通话期间系统压制音频,挂断后进度落后 | 临时失焦同 C1 静音;回焦后强制按服务端快照 resync | ✅ |
| C3 | 拔耳机/蓝牙断开 | 突然外放,尴尬 | 监听 `ACTION_AUDIO_BECOMING_NOISY` → 本机静音 + 页面/通知提示 | ✅ |
| C4 | 断线重连身份失效 | 后台弱网导致 WebSocket 短断 | 服务端保留 30s 身份宽限 + 客户端每次重连重发 join | ✅ |
| C5 | Doze/厂商省电杀进程 | 前台服务被杀,音乐无声消失 | 服务 `START_STICKY` 自愈;重启后通知栏留「回到房间」入口 | ✅ 基础自愈 |
| C6 | WebView 节流漂移 | 锁屏久后 JS 定时器降频,回前台瞬间进度跳变 | `visibilitychange` 回前台立即按最新房间状态校正 | ✅ |
| C7 | 无暂停 vs 系统媒体语义 | 系统媒体表面需要可理解的停止声音入口 | 通知与播放页增加「本机静音/恢复声音」 | ✅ |

## 三、技术方案

### 3.1 插件增强(tauri-plugin-lune-media,Kotlin)

新增焦点与拔线处理,统一以 `audio` 事件回传前端:

```kotlin
// MediaService 内
private lateinit var focusRequest: AudioFocusRequestCompat

private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
        AudioManager.AUDIOFOCUS_LOSS,
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK ->
            MediaPlugin.emitAudio("focus_loss")      // 前端 → 本机静音
        AudioManager.AUDIOFOCUS_GAIN ->
            MediaPlugin.emitAudio("focus_gain")      // 前端 → 恢复 + resync
    }
}

private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, i: Intent?) {
        if (i?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            MediaPlugin.emitAudio("becoming_noisy")  // 前端 → 本机静音
    }
}
// onCreate: requestAudioFocus(GAIN) + registerReceiver(noisyReceiver)
// onDestroy: abandonAudioFocusRequest + unregisterReceiver
```

事件协议(前端 `mediaSession.ts` 扩展):

```ts
export type AudioInterrupt = 'focus_loss' | 'focus_gain' | 'becoming_noisy';
export function onAudioInterrupt(handler: (e: AudioInterrupt) => void): Promise<() => void>;
```

### 3.2 前端:本机静音态 + 恢复对齐

`MobileRoom` 新增 `localMuted` 状态:

- `focus_loss` / `becoming_noisy` → `engine.setVolume(0)` + 界面/通知进入静音态
  (音轨**继续播放**,同步不中断);
- `focus_gain` → 恢复音量;
- 手动恢复(点通知「恢复」或界面提示条)→ 恢复音量 + 重新 requestFocus;
- 恢复时统一做一次静默校正:取 `useSync` 最近一次 `playback_state`
  按 `calcTargetPosition` 直接 `engine.seek`(复用现有 `shouldCorrect` 阈值)。

### 3.3 断线重连身份修复

- `handleDisconnect` 只解绑当前 socket，并为 `roomCode + memberId` 启动 30 秒延迟清理；
- 宽限期内原 memberId 重新 `join` 时取消清理计时器，直接返回最新房间快照；
- 清理计时器触发前再次检查该成员是否已有活动连接，避免旧 socket 晚到的 close 误删新连接；
- 客户端在每次 WebSocket 进入 OPEN 时重发 join，不再使用一次性 `joined` 标志；
- 宽限期内成员列表保持稳定，不额外扩展共享协议；超时后才发送既有 `member_left`。

### 3.4 进程被杀的自愈与引导

- `onStartCommand` 返回 `START_STICKY`;服务重启时若前端已死,通知降级为
  「Lune 已被系统暂停,点击回到房间」(contentIntent 拉起 App);
- 暂不主动申请忽略电池优化。该权限会扩大后台运行范围，也会增加上架审核与用户信任成本；
  只有真机矩阵证明特定厂商仍会频繁杀服务时，再提供设置页内的按需引导；
- 不做进程级持久化恢复(重开 App 凭房间码重进,成本已足够低)。

### 3.5 回前台即时校正

```ts
useEffect(() => {
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    resyncFromLatestPlayback(); // 3.2 的静默校正
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}, []);
```

## 四、交互设计

- **静音态提示条**(播放页顶部,复用重连横幅样式):
  「已为你静音(来电/其他应用正在播放)· 点击恢复」;
- **通知动作**:「喜欢 / 静音或恢复 / 下一首 / 离开」；压缩视图优先显示前三项；
- 回前台且发生过校正时,轻提示「已追上房间进度」;
- 宽限期内成员列表不闪烁；超过 30 秒后按正常离房状态移除。

## 五、实施计划

| 阶段 | 内容 | 改动面 | 预估 |
| --- | --- | --- | --- |
| 已完成 | C1/C2/C3 焦点与拔线、本机临时静音、通知与页面恢复入口 | 插件 Kotlin / mediaSession.ts / MobileRoom / AudioEngine | ✅ |
| 已完成 | C4 30s 重连宽限与客户端重发 join | server gateway / useRoomController | ✅ |
| 已完成 | C5 START_STICKY 降级通知 + C6 回前台即时校正 | 插件 / useSync / MobileRoom | ✅ |
| 后续按需 | 厂商电池优化设置引导、成员列表“重连中”状态 | Android 设置引导 / shared 协议 / MemberList | 待真机数据 |

验收用例矩阵(真机):来电 30s 挂断、抖音抢焦点再退出、拔蓝牙耳机、
锁屏 30 分钟回前台看进度差、飞行模式 20s 恢复看身份保留、系统「后台限制」开启后锁屏 10 分钟。

## 六、明确不做

- 本机暂停键(破坏无暂停产品模型,静音已覆盖诉求);
- 原生 ExoPlayer 接管音频(重构成本高,当前架构已满足核心后台场景);
- 断网期间本地离线续播(共听产品无意义)。
