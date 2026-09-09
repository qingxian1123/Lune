# Linux 桌面客户端（准备阶段）

Linux 端复用现有 Tauri 2 + React 客户端、房间同步逻辑和服务端接口。已添加独立平台识别和 `.deb` / `.AppImage` 打包配置，尚未完成 Linux 原生构建与实机验收，不应视为已经发布的平台。

首轮包含两个适配目标，架构暂定 x86_64：

| 目标 | 暂定交付格式 | 重点验收 |
| --- | --- | --- |
| Arch Linux + Hyprland 版 | AppImage | Wayland、平铺/浮动、缩放、音频播放 |
| Ubuntu 版 | `.deb` | 安装依赖、应用菜单、GNOME 窗口行为、音频播放 |

两版复用同一套客户端代码。Hyprland 版的底层发行版已确定为 Arch Linux；验收时记录具体 Hyprland 版本和显卡驱动。建议在 Ubuntu 22.04 x86_64 上制作发布包，再将 AppImage 放到 Arch + Hyprland 实测；在较新的系统上构建会提高 glibc 等运行库的最低要求。ARM64 需要单独构建和验证。

## 开发环境

以下命令在 Linux 仓库根目录执行。准备 Node.js 22 LTS、pnpm 10、Rust stable（通过 rustup 安装，并包含默认本机 target）。构建工具安装参考 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)。

Ubuntu 22.04 的系统依赖：

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential curl wget file pkg-config \
  libwebkit2gtk-4.1-dev libssl-dev libxdo-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-libav \
  fonts-noto-cjk libfuse2

pnpm install --frozen-lockfile
pnpm tauri dev
```

需要图形桌面会话。服务端可以运行在其他机器；首次启动填写已有 Lune 服务地址。若本机同时运行服务端，另开终端执行 `pnpm dev:server`，并按主 README 初始化 Provider。

### Arch Linux + Hyprland 本地开发

在已有 Hyprland 桌面的 Arch 系统上，安装开发和音频依赖（Node.js、pnpm、Rust 同上）：

```bash
sudo pacman -Syu --needed \
  base-devel curl wget file pkgconf openssl \
  webkit2gtk-4.1 appmenu-gtk-module libappindicator-gtk3 \
  librsvg xdotool patchelf \
  gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav \
  noto-fonts-cjk fuse2

pnpm install --frozen-lockfile
GDK_BACKEND=wayland pnpm tauri dev
```

命令中的 `-Syu` 会同步升级系统。依赖名称参考 [Tauri Arch 前置依赖](https://v2.tauri.app/start/prerequisites/) 和 [Arch WebKitGTK 包说明](https://archlinux.org/packages/extra/x86_64/webkit2gtk-4.1/)。使用已有正常工作的音频会话，无需为了客户端更换系统音频服务。

只验证 Arch 本机编译时，可跳过安装包生成：

```bash
pnpm tauri build --no-bundle
GDK_BACKEND=wayland ./apps/client/src-tauri/target/release/lune
```

产物为 `apps/client/src-tauri/target/release/lune`，依赖当前 Arch 的系统运行库。下一步按下方 Hyprland 清单验证，再测试发布用 AppImage。AppImage 的媒体框架打包优先在 Ubuntu 构建机完成，Tauri 当前仅在 Ubuntu 上完整支持该打包选项；Arch 本机编译成功不替代 AppImage 验收。

## 打包与安装

在上述 Ubuntu 构建机上分别构建两个目标：

```bash
# Ubuntu 版
pnpm tauri build --bundles deb

# Hyprland 版候选包，需要在目标 Hyprland 环境验收
pnpm tauri build --bundles appimage
```

也可以一次生成两种格式：

```bash
pnpm tauri build --bundles deb,appimage
```

Tauri 在 Linux 上自动合并 `apps/client/src-tauri/tauri.linux.conf.json`。命令包含前端类型检查、Vite 构建、Rust 编译和打包。默认产物：

- `apps/client/dist/`：前端静态资源。
- `apps/client/src-tauri/target/release/lune`：本机可执行文件。
- `apps/client/src-tauri/target/release/bundle/deb/*.deb`：Debian 安装包。
- `apps/client/src-tauri/target/release/bundle/appimage/*.AppImage`：便携包。

安装当前版本的 Debian 包，或运行 AppImage：

```bash
sudo apt install ./apps/client/src-tauri/target/release/bundle/deb/*.deb

chmod +x apps/client/src-tauri/target/release/bundle/appimage/*.AppImage
```

然后在应用菜单启动 Lune，或直接运行生成的 AppImage 文件。不要使用 sudo 启动客户端。若 AppImage 提示缺少 FUSE，可对该文件使用 `--appimage-extract-and-run` 参数启动。

Windows 上只构建前端不能生成 Linux 安装包。请使用 Linux 主机、带图形支持的 WSL2，或 Linux CI；WSL 开发建议将仓库放在 Linux 文件系统中，重新安装 Linux 依赖，不要复用 Windows 的 `node_modules`。

## 平台行为

- Linux 使用系统原生窗口标题栏，以及现有桌面房间布局。Windows 保留自定义标题栏。
- 音频经 WebKitGTK / GStreamer 播放。Debian 包声明额外的音频插件依赖；AppImage 开启 `bundleMediaFramework`，构建机也需要安装上述 GStreamer 插件。详见 [Tauri AppImage 多媒体说明](https://v2.tauri.app/distribute/appimage/)。
- 当前自定义媒体插件只有 Android 原生实现。Linux 的 MPRIS、系统媒体键、托盘和关闭后继续播放尚未实现；浏览器 Media Session 的可用性需要实测。

## Arch Linux + Hyprland 版验收

在当前 Hyprland 图形会话中运行生成的 AppImage。先使用默认启动方式，再用 `GDK_BACKEND=wayland` 前缀启动该文件，检查原生 Wayland 是否正常；通过 `hyprctl clients` 查看实际窗口信息。不要仅凭 AppImage 成功打包就标记 Hyprland 适配完成。

- 平铺与浮动切换、全屏、不同工作区切换、焦点恢复。
- 100%、150%、200% 缩放，多显示器之间移动，中文字体。
- 搜索输入、剪贴板复制、设置弹窗、长列表滚动。
- 使用实际音频设备验证连续播放、暂停恢复、切歌及房间同步。

若出现白屏、黑屏或调整窗口尺寸时崩溃，记录显卡、驱动、WebKitGTK 和 Hyprland 版本。可按 [Tauri Linux 图形故障说明](https://v2.tauri.app/develop/debug/linux-graphics/) 使用 `WEBKIT_DISABLE_DMABUF_RENDERER=1` 前缀诊断；该选项不默认写入程序。安装并启用了 XWayland 的系统也可用 `GDK_BACKEND=x11` 对照排查，但 XWayland 通过不代表原生 Wayland 通过。

## Ubuntu 版验收

在干净的 Ubuntu 桌面环境中通过 `apt install` 安装生成的 `.deb`，确认 GStreamer 依赖可自动安装、应用菜单可启动、升级后服务器配置保留。分别记录 Ubuntu 版本及使用的 Wayland / X11 会话。

## 下一步：原生验收

首先在目标 Linux 系统完成构建，再用生成的安装包验证：

- 首次设置服务器地址、重启后配置恢复、中文显示。
- 创建/加入房间，与 Windows 或 Android 同步播放、切歌、拖动进度。
- 实际音乐源返回的 MP3、AAC、FLAC 等格式解码，以及暂停恢复、音量调节。
- 复制房间码、搜索、队列调整、设置弹窗和退出房间。
- Ubuntu GNOME 的窗口关闭、最小化、最大化，以及 Arch Hyprland 的平铺、浮动与缩放。
- 在未安装开发依赖的干净系统中分别验证 `.deb` 和 AppImage；确认终端无缺库或解码错误。

记录测试发行版、桌面环境、架构和失败日志后，再决定是否扩展 RPM / ARM64 或实现 MPRIS。
