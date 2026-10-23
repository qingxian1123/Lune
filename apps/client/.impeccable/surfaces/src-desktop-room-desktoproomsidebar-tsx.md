---
version: 1
slug: "src-desktop-room-desktoproomsidebar-tsx"
primary_target: "src/desktop/room/DesktopRoomSidebar.tsx"
related_targets: ["src/desktop/room/WorkspaceNavigation.tsx","src/desktop/room/full-workspace.css","src/features/settings/sections/WorkspaceSettingsSection.tsx","src/features/settings/sections/workspace-settings.css","src/pages/Room.tsx"]
---

# 桌面功能区样式

Scope: 桌面房间功能区与设置中的布局偏好。Mode: Operate。

用户已确认按现有功能组织；保留当前简约功能区，新增接近全屏、悬浮于播放页之上的完整工作区。使用既有音乐源、房间、队列和本机音乐库，不增加产品能力。

- **THESIS:** 同一个音乐库，两种使用尺度：简约布局让封面与歌词保持可见，完整布局让搜索、浏览与整理获得充分空间。
- **OWN-WORLD:** 继承 Lune 的主题变量、字体、线性图标、细边界和浮层圆角。深色、白昼与磨砂共用结构；强调色只用于选中导航和真实操作。
- **STORY:** 用户在「设置 → 功能区样式」选择布局并自动保存到本机。完整工作区直接到达搜索、歌单、热榜、我的音乐、队列、成员；返回播放页或切换简约模式保留已有内容。
- **FIRST VIEWPORT:** 播放区四周保留 16px，浮层覆盖中央舞台，底部原有播放条持续可见。左侧 208px 导航按音乐/房间分组，中央标题、来源选择与内容列表，右上角为简约切换和返回播放页。歌单使用封面网格；窄窗口逐级收窄导航，540px 以下转横向导航。
- **FORM:** 用户指定的现有界面扩展，使用左导航与主内容结构；不启动新视觉世界或概念抽选。复用同一个已挂载的 SearchPanel，不复制请求或播放逻辑。
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

验证约束：用户要求以静态分析代替运行；执行 TypeScript 类型检查、CSS 解析与独立代码审查，不启动应用、不安装依赖、不生成运行截图。实际视口、主题与交互的视觉验收需由用户本地完成。无新增位图资源；全局 DESIGN.md 保持既有体系。
