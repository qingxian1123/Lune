# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

核心用户是彼此亲近的朋友。他们希望在分处不同地点或共同相处时，通过一起选歌、听歌和分享音乐放松下来。

## Product Purpose

Lune 是一个自托管的多人共听客户端。用户连接自己选择的 Lune 服务，创建房间或通过六位房间码加入房间，在 Windows 与 Android 设备上共享播放队列、进度和听歌体验。

产品成功意味着亲近的朋友能够低门槛地进入同一个音乐房间，自然地分享歌曲，并在不被复杂权限或控制流程打断的情况下放松共处。

## Positioning

Lune 的核心价值不是单人播放器功能，而是让亲近的朋友把音乐变成共同经历：房间内所有成员平等参与选歌与播放控制，并由自托管服务和可插拔音源承载这段共听体验。

## Operating Context

- 客户端首次使用时连接用户自行部署或自行选择的 Lune 服务；服务器地址只保存在当前设备。
- 用户输入昵称后创建房间，或使用朋友分享的六位房间码加入房间。
- 房间成员共同搜索音乐、维护播放队列、查看歌词，并保持播放进度同步。
- Windows 使用稳定的桌面布局；Android 使用移动端布局，并支持后台、通知栏和锁屏场景。

## Capabilities and Constraints

- 功能界面与用户文案使用中文；Windows 与 Android 首页保留手选英文品牌标语。
- 采用无暂停模型；核心房间体验不提供暂停操作。
- 所有成员平等控制播放、切歌、进度和队列；房主身份仅用于成员标识与房主转移语义。
- Windows 与 Android 保持基本同等的核心功能，可以针对各平台的使用场景和原生能力做特定优化。
- Android 端在后台与锁屏时继续参与房间同步，并通过原生媒体服务提供系统级入口。
- 客户端不内置公共服务器、预置账号或固定音源登录态；音源账号由服务端使用者配置。
- 音乐源通过 Provider 插件接入；当前仓库包含网易云与酷狗实现。
- 房间同步依赖服务端与 WebSocket 连接；当前房间、成员、队列和播放状态为服务端内存状态，服务重启后会清空。

## Brand Commitments

- 产品名称为 **Lune**，中文副标题为“一起听”。
- 功能表达保持中文，首页品牌表达保留 “Follow your inner moonlight / don't hide the madness / tonight, together”，并围绕朋友之间自然、平等的音乐分享与放松体验。

## Evidence on Hand

- 产品范围、自托管模式、技术边界与部署约束：`../../README.md`
- Windows 与 Android 的平台分流：`src/lib/platform.ts`
- 创建和加入房间流程：`src/pages/Home.tsx`、`src/mobile/MobileHome.tsx`
- 桌面与移动房间体验：`src/pages/Room.tsx`、`src/mobile/MobileRoom.tsx`
- Android 功能与后台播放说明：`../../docs/android.md`、`../../docs/android-background-audio.md`
- 全员同权的服务端规则：`../../server/src/sync/sync.gateway.ts`
- Provider 音源与同步协议：`../shared/src/index.ts`
- 当前没有可用于产品声明的用户评价、公开客户案例、媒体报道或量化效果数据；未来工作不得虚构这些证据。

## Product Principles

1. **共同经历优先。** 每项核心能力都应帮助朋友更自然地一起听、一起选、一起分享。
2. **平等参与。** 房间成员拥有一致的核心控制权，不用围绕单一主持者等待或请求操作。
3. **放松而不中断。** 无暂停模型和同步机制应减少协调成本，让音乐持续成为轻松共处的背景与连接。
4. **跨端一致，因地制宜。** Windows 与 Android 保持核心功能对等，同时尊重桌面、触屏、后台和锁屏的不同使用方式。
5. **用户掌控服务。** 自托管、设备本地服务器配置和可插拔音源共同保证部署与音源选择由用户掌握。
