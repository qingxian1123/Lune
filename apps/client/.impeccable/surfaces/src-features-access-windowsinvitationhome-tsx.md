---
version: 1
slug: "src-features-access-windowsinvitationhome-tsx"
primary_target: "src/features/access/WindowsInvitationHome.tsx"
related_targets: ["src/features/access/AbstractVinyl.tsx","src/features/access/windows-invitation.css","src/pages/Home.tsx"]
---

# Windows Home Access Card

- **Scope & Mode:** Windows 桌面首页 (`src/pages/Home.tsx` / `src/features/access/WindowsInvitationHome.tsx`) · `Operate`
- **Task & Constraints:** 在既有横向双联首页内局部延伸唱片图形：保留 625px 双联卡、品牌、标语、表单、暖白按钮与入房功能，唱片仅使用黑、灰、暖白，不引入紫色。用户指定回到最早偏心弧带截图的参考造型进行局部优化，保留完整外轮廓，移除交叉细沟槽与渐隐效果。浅色混凝土建筑光井方向已被用户否定并撤回；本次不替换全局视觉世界、不改其他平台或系统 tokens。

## Direction contract

- **THESIS:** 静夜双联邀请卡内的抽象唱片构成：四条偏心椭圆遮罩弧带以暖白、中灰、深灰平面色块交替呈现，完整外轮廓、暗盘心与小轴孔维持识别；图形保持平面与静止。
- **OWN-WORLD:** 延续既有深色表面，唱片局部限定黑、灰、暖白，不引入紫色。卡片和表单保持现有行为；不新增系统 token、字体或全局视觉规则。无建筑透视、实体光井、投影或发光；这些约束仅属于此次首页唱片方向。
- **STORY:** 打开首页即可输入昵称与可选六位房间码，留空创建、填写则加入；首次连接显示服务器地址，服务器错误会展开该输入，设置入口继续可用。唱片仅作装饰，无旋转、唱臂或房间码联动；主按钮依现有模式显示创建、加入与等待状态。
- **FIRST VIEWPORT:** 默认卡片宽度上限为 `625px`，列宽为 `272px / 1px / 352px`；左联保留 LUNE 字标、宽度上限 `236px` 的抽象唱片与 `Follow your inner moonlight`，右联保留「进入房间」、设置及表单。浏览器卡片中轴保留虚线与上下缺口；`680px` 以下转为上下双联。Windows 原生紧凑窗口沿用铺满窗口的 `44fr / 1px / 56fr` 双联覆盖规则，隐藏缺口，不因本次图形调整改变布局。
- **FORM:** User-pinned：用户指定沿最早偏心弧带参考造型局部优化，无需随机种子或再次探索视觉世界。`AbstractVinyl.tsx` 以四条偏心椭圆遮罩弧带形成暖白、中灰、深灰平面色块，保留完整外轮廓、暗盘心和小轴孔；移除所有交叉细沟槽，无渐隐、光晕、渐变或动画，不引入紫色。这是代码 SVG，无新增 raster 资产。
- **FINISH:** 以 `AbstractVinyl.tsx`、`WindowsInvitationHome.tsx` 与 `windows-invitation.css` 的真实实现为准，局部合并本 brief 与 `DESIGN.md` 的 Windows 首页描述；验证静止图形、既有表单与功能边界。既有 `.impeccable/design.json` 与 `DESIGN.md` 的历史不同步仅报告，不在本次修复。
