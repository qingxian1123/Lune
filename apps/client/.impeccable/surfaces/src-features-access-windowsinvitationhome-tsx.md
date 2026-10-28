---
version: 1
slug: "src-features-access-windowsinvitationhome-tsx"
primary_target: "src/features/access/WindowsInvitationHome.tsx"
related_targets: ["src/features/access/windows-invitation.css","src/pages/Home.tsx"]
---

# Windows Home Access Card

- **Scope & Mode:** Windows 桌面首页 (`src/pages/Home.tsx` / `src/features/access/WindowsInvitationHome.tsx`) · `Operate`
- **Task & Constraints:** 彻底摒弃旧版竖向浅紫纸卡+三角信封折角+点击展开的简陋形态，重新设计为居中的现代扁平极简「横向双联黑胶封套 × 齿孔邀请券」卡片；视口仅保留该居中卡片。

## Direction contract

- **THESIS:** 静夜画布上的横向双联「黑胶唱盘封套 × 齿孔共听邀请券」——左联承载几何黑胶唱盘与唱臂仪式感，右联通过票券齿孔分割直接呈现零点击入房表单，以现代音频工业的纯平几何语言取代旧版贺卡式信封。
- **OWN-WORLD:** 融入 Lune 原生深色微差体系（`--lune-bg` 静夜黑画布、`--lune-bg-soft` 左联黑胶封套、`--lune-surface` 右联邀请券、`--lune-surface-2` 扁平输入槽、`--lune-brand` 薰衣月光盘心与主操作按钮），并无缝适配白昼与磨砂主题。
- **STORY:** 用户打开客户端即见中央横向双联卡：左侧黑胶唱盘缓缓旋转、唱臂落位，右侧邀请券无需任何展开点击即可输入昵称与可选六位房间码；输入房间码时，右侧状态徽章与左侧黑胶盘心同步切换显示该房间码。
- **FIRST VIEWPORT:** 视口中央仅有一张 `701px` 宽的横向双联卡片：左联 `310px` 为品牌字标、204px 纯平几何黑胶与唱臂、邀请标语；中轴为带上下半圆缺口的 `1px` 虚线齿孔；右联为标题、动态模式徽章、设置按钮、昵称/房间码输入与主按钮。
- **FORM:** Redesigned horizontal vinyl-sleeve & perforated invitation pass (1/1, `seed: none (unavailable)`).
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
