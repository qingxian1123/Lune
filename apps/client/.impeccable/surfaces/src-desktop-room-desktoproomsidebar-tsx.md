---
version: 1
slug: "src-desktop-room-desktoproomsidebar-tsx"
primary_target: "src/desktop/room/DesktopRoomSidebar.tsx"
related_targets: ["src/desktop/room/WorkspaceNavigation.tsx","src/desktop/room/DesktopRoomHeader.tsx","src/desktop/room/full-workspace.css","src/components/WorkspaceMusicBrowser.tsx","src/components/SearchPanel.tsx","src/components/TransportBar.tsx","src/components/HotChartPanel.tsx","src/features/library/ListeningLibrary.tsx","src/features/settings/sections/WorkspaceSettingsSection.tsx","src/features/settings/sections/workspace-settings.css","src/pages/Room.tsx"]
---

# 桌面功能区样式

Scope: 桌面房间功能区与设置中的布局偏好。Mode: Operate。

原生顶栏最终恢复基准：2026-10-18 `82654cd`（包含于当日最后提交 `5d8661e`）。保留连续背景画布、透明顶栏、4% 底线与原有无边框窗口配置；不额外叠加顶栏模糊、10% 边线或回退背景覆盖。Windows 构建显式合并平台配置。

后续边界修正：用户明确顶栏应为空白玻璃磨砂，不显示品牌、邀请码、人数、同步播放或房间退出叉号；完整与简约模式保持一致。桌面浏览器的空白占位栏复用既有磨砂材质，Windows 原生窗口按钮与拖拽行为保留。

状态：第一版已实现并完成静态检查，实际视口与交互的本地验收待完成。保留当前简约功能区，完整工作区使用覆盖中央舞台的连续平整界面。使用既有音乐源、房间、队列和本机音乐库，不增加产品能力。

- **THESIS:** 同一个音乐库，两种使用尺度：简约布局让封面与歌词保持可见，完整布局让搜索、浏览与整理获得充分空间。完整功能区以封面、歌曲和真实操作为内容主线，去除常驻邀请码、在线人数、搜索统计和导航数字徽标。
- **OWN-WORLD:** 继承 Lune 的主题变量、字体、线性图标、控件圆角与细边界；完整主表面贴边、无外圆角和外阴影。深色、白昼与磨砂共用结构；强调色用于选中导航、真实操作和必要反馈。此次只建立已批准的布局变体，不改简约功能区、首页或 Android 的视觉世界，不新增通用设计 token。
- **STORY:** 用户在「设置 → 功能区样式 → 完整工作区」选择布局并自动保存到本机。左导航直接到达搜索音乐、发现歌单、共听热榜、我的音乐、播放队列与房间成员；「正在播放」收起完整功能区，设置始终在侧栏底部，右上角无重复返回或简约切换。成员页保留复制邀请码和经确认离开。切换布局时共享搜索关键词、音源、结果、已选歌单与我的音乐视图/查询/展示上限等状态，父级保存各视图的滚动缓存；详情面包屑返回原歌单列表与位置。
- **FIRST VIEWPORT:** 连续主表面覆盖中央舞台，外边缘不留 16px 空隙；底部保留安静播放条，中间显示进度，视口宽度不超过 760px 时进度移至上沿。左栏默认 208px，房间工作区容器宽度不超过 960px 时为 180px，不超过 760px 时为 64px 图标栏。歌曲与歌单各有单行搜索/来源选择，540px 以下允许换行。歌单默认四列，1180px、960px、380px 及以下依次为三、二、一列；独立正方形封面下方放两行标题。详情以面包屑、分列封面/标题和唯一突出的「全部加入队列」连接统一歌曲表格，专辑与时长列随窄窗逐级收起。
- **FORM:** 用户指定的现有界面扩展，批准参考为 `docs/design/workspace-v2/playlist-browse-clean.png` 与 `playlist-detail-clean.png` 的整体结构，额外移除常驻邀请码，不要求像素一致。复用同一个已挂载的 SearchPanel、请求与播放逻辑；封面、文案、动作使用明确的语义槽。普通连接与正在播放不重复显示；加载、空态、失败重试、断线禁用、本机静音、缓冲与播放异常反馈继续存在，收藏与房间爱心保持独立语义，无暂停能力。
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance。第一版已完成静态审查与设计文档同步；共享状态及滚动缓存修复已在静态范围内复核，无其他未解决的静态发现。实际滚动偏移、布局高度、焦点和视觉效果仍须本地验收，本次未宣称视觉验收通过。

用户确认：“邀请码状态也拿掉整体的效果就可以了开始推进第一版”。批准精简稿的整体结构及常驻邀请码移除，不把示例封面、作者、数量或生成图标差异视为产品规范；实现使用真实 Provider 数据和既有线性图标。

验证约束：用户要求以静态分析代替运行。本次 `tsc --noEmit`、现有输入焦点规范检查及全部 CSS 解析检查通过；独立静态代码审查完成，原共享状态/滚动缓存问题已修复并复核。未启动应用、未安装依赖、未产生运行截图。用户本地仍需验收各桌面宽度、三种主题、键盘焦点、歌单往返、布局切换后的状态和滚动恢复，以及播放/异常反馈。无新增可消费位图资产；生成图片仅为设计提案，来源记录保留在同目录 `.png.json`。DESIGN.md 补充完整功能区变体；变体未新增或修改通用 token，sidecar 的既有规范 token 保持不变。
