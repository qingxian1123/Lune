# Lune Android 端(Tauri 2)

Android 端与桌面端共用 `apps/client` 全部业务代码(同步协议、AudioEngine、状态管理),
仅界面层按平台分流:`src/lib/platform.ts` 判定后加载 `src/mobile/` 下的移动端页面。
在桌面浏览器把窗口缩到 768px 以下即可直接预览移动端界面,无需真机。

## 一、环境准备(Windows)

1. **Android Studio**:安装后在 SDK Manager 勾选
   - Android SDK Platform(API 24+,建议最新稳定版)
   - Android SDK Build-Tools / Platform-Tools / Command-line Tools
   - NDK (Side by side)
2. **JDK 17**(Android Studio 自带的 jbr 即可)
3. **Rust Android 目标**:

   ```powershell
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

4. 环境变量(按实际安装路径调整):

   ```powershell
   JAVA_HOME  = <Android Studio>\jbr
   ANDROID_HOME = %LOCALAPPDATA%\Android\Sdk
   NDK_HOME   = %ANDROID_HOME%\ndk\<版本号>
   ```

## 二、初始化 Android 工程(一次性)

```powershell
cd apps/client
pnpm tauri android init
```

生成 `src-tauri/gen/android` Gradle 工程(应提交进 git)。初始化后确认:

1. **明文 HTTP**(服务端目前走 `http://`):由 `gen/android/app/build.gradle.kts`
   的 `usesCleartextTraffic` 占位符控制,debug 与 release 均已设为 `true`;
   服务端迁移 HTTPS 后应把 release 改回 `false`。
2. **应用名**:`gen/android/app/src/main/res/values/strings.xml` 中
   `app_name` 改为 `Lune · 一起听`(init 默认取 productName,确认即可)。
3. **应用图标**(已配置):与 Windows 桌面版同源。`icons/android/` 下由
   `tauri icon` 生成的整套 mipmap(各密度 launcher/round/自适应前景 +
   `mipmap-anydpi-v26/ic_launcher.xml` + 背景色)已复制进
   `gen/android/app/src/main/res/`。若将来更换图标,重跑
   `pnpm tauri icon 新图标.png` 后需把 `icons/android/` 重新覆盖到 gen 工程同一位置。

## 三、发布签名(一次性)

Android 要求所有 APK 必须签名才能安装。自研分发用**自签 keystore**即可,
无需向任何机构申请证书:

1. 生成 keystore(建议放在仓库外,妥善备份——丢失后无法对老用户覆盖升级):

   ```powershell
   & "$env:JAVA_HOME\bin\keytool.exe" -genkey -v `
     -keystore "$env:USERPROFILE\.android-keys\lune-release.keystore" `
     -alias lune -keyalg RSA -keysize 2048 -validity 10000
   ```

   按提示设置口令(storePassword/keyPassword)与信息(姓名等可随意填)。

2. 复制 `gen/android/keystore.properties.example` 为同目录
   `keystore.properties`,填入 keystore 路径(正斜杠)与口令。
   该文件已被 .gitignore 忽略,不会进仓库。

3. 重新构建即产出已签名 APK,可直接安装:

   ```powershell
   pnpm tauri android build --apk
   ```

签名逻辑已写进 `gen/android/app/build.gradle.kts`(release 读取
keystore.properties);未配置时 release 回落为未签名产物。

## 四、日常开发与构建

```powershell
# 真机/模拟器热更开发(TAURI_DEV_HOST 由 CLI 自动注入,vite.config.ts 已适配)
pnpm tauri android dev

# 产出 APK / AAB
pnpm tauri android build --apk      # APK:gen/android/app/build/outputs/apk/universal/release/
pnpm tauri android build            # AAB(上架用):.../outputs/bundle/universalRelease/

# 只出 arm64(体积更小,真机足够)
pnpm tauri android build --apk --target aarch64
```

调试期也可用 debug 包免配置直装(自动 debug 签名,体积大、未混淆):

```powershell
pnpm tauri android build --apk --debug
```

## 五、已完成的移植内容

| 模块 | 状态 |
| --- | --- |
| 创建/加入房间(昵称、六位房间码、错误提示) | ✅ `mobile/MobileHome.tsx` |
| 同步播放(服务端时钟 + RTT 校正、无暂停模型) | ✅ 复用 `useSync` / `AudioEngine` |
| 播放页(氛围光、进度、全员同权控制) | ✅ `mobile/MobileRoom.tsx` |
| 歌词全屏(逐行高亮、翻译、点行跳转) | ✅ 复用 `LyricScroller` |
| 搜索(多音乐源、单曲/歌单、歌单整单加入) | ✅ 复用 `SearchPanel`(底部面板) |
| 队列(增删、左滑删除、拖拽排序,全员同权) | ✅ `mobile/MobileQueue.tsx` |
| 成员列表 / 房间码复制 / 收藏 / 本机音量 | ✅ |

## 六、后台/锁屏播放(已实现)

由 Tauri 移动插件 `src-tauri/tauri-plugin-lune-media` 提供:

- **前台服务 + MediaSessionCompat**(Kotlin,`android/` 子工程):
  入房即启动,保持进程活跃,WebView 内的 WebSocket 同步与 AudioEngine
  在锁屏/切后台时持续运行;离开房间自动停止并移除通知。
- **通知栏/锁屏媒体卡**:封面(异步拉取)、曲目/歌手、播放状态,
  动作「喜欢 / 下一首 / 离开房间」,经插件 `action` 事件回传前端
  (`src/lib/mediaSession.ts` → `MobileRoom`);耳机「下一首」按键同样生效。
- **权限**:清单声明 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 等;
  Android 13+ 首次入房时弹系统通知权限请求,拒绝也不影响播放,只是无媒体卡。
- **接线自动完成**:插件作为 Cargo 依赖注册后,`pnpm tauri android build`
  会重新生成 `gen/android/tauri.settings.gradle` 把 `android/` 子工程并入,
  无需手动改 gen 工程;桌面端注册为空壳,前端调用自动降级 no-op。

验证方式:真机入房播放 → 锁屏/切后台,音乐应持续;下拉通知栏应看到
媒体卡,「下一首」与「喜欢」即点即生效。

## 七、后续可选项

- 音频焦点细化(来电/其他 App 抢占时的淡出恢复)
- 通知内嵌进度条拖动(需把 seek 动作接入 MediaSession 回调)
- HTTPS 化后移除明文传输开关
