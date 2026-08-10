# Android 后台播放冲突 · 设计方案

现状:后台播放已可用(前台服务 + MediaSessionCompat 保活,音频与同步仍在 WebView 内)。
但"能播"只是底线——与系统、其他 App、网络环境共处时存在七类冲突,本方案逐一给出
产品策略与技术落点。

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
| C1 | 音频焦点缺失 | 其他 App 播放时与 Lune **混音**(WebView 音频不参与焦点仲裁) | 插件申请 AudioFocus;失焦→本机静音,回焦→恢复 | P0 |
| C2 | 来电/临时失焦 | 通话期间系统压制音频,挂断后进度落后 | 临时失焦同 C1 静音;回焦后强制按服务端快照 resync | P0 |
| C3 | 拔耳机/蓝牙断开 | 突然外放,尴尬 | 监听 `ACTION_AUDIO_BECOMING_NOISY` → 本机静音 + 通知提示 | P0 |
| C4 | 断线重连身份失效 | 服务端断连即移出成员,重连 join 报「成员已不在房间」,后台弱网必现 | 服务端**离线宽限期**(30s 内重连复活成员) + 客户端重连后重发 join | **P0(现存缺陷)** |
| C5 | Doze/厂商省电杀进程 | 前台服务被杀,音乐无声消失 | 服务 `START_STICKY` 自愈 + 首次入房引导电池白名单;被杀后通知栏留「回到房间」入口 | P1 |
| C6 | WebView 节流漂移 | 锁屏久后 JS 定时器降频,回前台瞬间进度跳变 | `visibilitychange` 回前台立即按最新 `playback_state` 校正(静默 seek,不等下一次广播) | P1 |
| C7 | 无暂停 vs 系统媒体语义 | 用户在通知上找不到暂停键,不符直觉 | 通知与播放页增加「静音/恢复」动作(本机级),语义上替代暂停 | P2 |

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

### 3.3 断线重连身份修复(服务端,现存缺陷)

现状:`handleDisconnect` 立即 `rooms.leave`,后台网络抖动 = 被踢出房间。

- `Room.members` 增加 `offline: boolean` + `offlineSince`;断连仅标记离线,
  广播 `member_offline`(前端成员列表灰显);
- 30 秒宽限内同 memberId 重新 `join` → 复活(清除离线标记,广播 `member_online`);
  超时才真正 `leave`(含房主转移);
- 客户端 `useWebSocket` 重连成功后**重发 join**(去掉一次性 `joined` 标志,
  按 readyState OPEN 边沿触发);
- 协议新增 `member_offline` / `member_online` 两条服务端消息(向后兼容:旧客户端忽略未知类型)。

### 3.4 进程被杀的自愈与引导

- `onStartCommand` 返回 `START_STICKY`;服务重启时若前端已死,通知降级为
  「Lune 已被系统暂停,点击回到房间」(contentIntent 拉起 App);
- 首次入房后(P1)弹一次性引导卡:跳转 `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
  申请白名单,文案说明"锁屏听歌需要";拒绝不再纠缠;
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
- **通知动作**第四枚:「静音/恢复」(P2,与喜欢/下一首/离开并列,压缩视图仍取前三);
- 回前台且发生过校正时,轻提示「已追上房间进度」;
- 成员列表离线灰显(C4):昵称后缀「重连中…」,30s 超时消失。

## 五、实施计划

| 阶段 | 内容 | 改动面 | 预估 |
| --- | --- | --- | --- |
| P0 | C1/C2/C3 焦点与拔线(插件事件 + 本机静音)+ C4 宽限期与重发 join | 插件 Kotlin / mediaSession.ts / MobileRoom / server gateway+room.model / shared 协议 | 1.5~2 天 |
| P1 | C5 START_STICKY + 白名单引导 + C6 回前台校正 | 插件 / MobileRoom | 0.5~1 天 |
| P2 | C7 通知「静音/恢复」动作 + 成员离线灰显 UI | 插件 / MemberList / MobileRoom | 0.5 天 |

验收用例矩阵(真机):来电 30s 挂断、抖音抢焦点再退出、拔蓝牙耳机、
锁屏 30 分钟回前台看进度差、飞行模式 20s 恢复看身份保留、系统「后台限制」开启后锁屏 10 分钟。

## 六、明确不做

- 本机暂停键(破坏无暂停产品模型,静音已覆盖诉求);
- 原生 ExoPlayer 接管音频(重构成本高,现架构在 P0~P1 落地后已满足场景);
- 断网期间本地离线续播(共听产品无意义)。
