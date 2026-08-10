---
name: Lune
description: 静夜里与亲近朋友共享音乐的共听空间
colors:
  night-black: "rgb(11 11 12)"
  night-black-soft: "rgb(15 15 16)"
  night-surface: "rgb(21 21 22)"
  night-surface-high: "rgb(27 27 28)"
  moonlight-white: "rgb(240 239 235)"
  muted-stone: "rgb(142 141 136)"
  lavender-moonlight: "rgb(184 176 216)"
  lavender-soft: "rgb(118 112 139)"
  lavender-highlight: "#c7c0de"
  success-soft: "#91b8a0"
  error-soft: "#d9a3a8"
  favorite-pink: "#e8a0b4"
  danger-deep: "rgb(146 58 72)"
  danger-text: "#f4dfe3"
  selection-wash: "rgb(255 255 255 / 0.07)"
typography:
  display:
    fontFamily: "Space Grotesk Variable, Space Grotesk, sans-serif"
    fontSize: "clamp(4.5rem, 5.2vw, 5.5rem)"
    fontWeight: 320
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  mobile-display:
    fontFamily: "Space Grotesk Variable, Space Grotesk, sans-serif"
    fontSize: "clamp(2.2rem, 10.5vw, 2.7rem)"
    fontWeight: 320
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  heading:
    fontFamily: "Space Grotesk Variable, Space Grotesk, sans-serif"
    fontSize: "22px"
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Space Grotesk Variable, Space Grotesk, sans-serif"
    fontSize: "16px"
    fontWeight: 620
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, Noto Sans CJK SC, Noto Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Space Grotesk Variable, Space Grotesk, sans-serif"
    fontSize: "13px"
    fontWeight: 560
    letterSpacing: "0.02em"
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, Noto Sans CJK SC, Noto Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.08em"
  editorial-kicker:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.08em"
  brand:
    fontFamily: "Space Grotesk Variable, Space Grotesk, sans-serif"
    fontSize: "16px"
    fontWeight: 720
    letterSpacing: "0.34em"
rounded:
  xs: "4px"
  sm: "8px"
  control: "10px"
  field: "12px"
  dock: "15px"
  card: "18px"
  mobile-card: "20px"
  sheet-top: "26px 26px 0 0"
  pill: "999px"
  circle: "50%"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.lavender-moonlight}"
    textColor: "{colors.night-black}"
    typography: "{typography.control}"
    rounded: "{rounded.field}"
    padding: "0 18px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "transparent"
    textColor: "{colors.lavender-moonlight}"
    typography: "{typography.control}"
    rounded: "{rounded.field}"
    padding: "0 18px"
    height: "48px"
  segmented-active:
    backgroundColor: "{colors.selection-wash}"
    textColor: "{colors.moonlight-white}"
    rounded: "{rounded.control}"
    height: "40px"
  input-default:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.moonlight-white}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "0 14px"
    height: "46px"
  card-access-desktop:
    backgroundColor: "{colors.night-black-soft}"
    textColor: "{colors.moonlight-white}"
    rounded: "{rounded.card}"
    width: "400px"
  card-access-mobile:
    backgroundColor: "{colors.night-black-soft}"
    textColor: "{colors.moonlight-white}"
    rounded: "{rounded.mobile-card}"
  room-code-chip:
    backgroundColor: "{colors.night-surface}"
    textColor: "{colors.moonlight-white}"
    rounded: "9px"
    padding: "0 10px"
    height: "30px"
  mobile-next:
    backgroundColor: "{colors.lavender-moonlight}"
    textColor: "{colors.night-black}"
    rounded: "30px"
    padding: "0 34px"
    height: "60px"
  bottom-sheet:
    backgroundColor: "{colors.night-black-soft}"
    textColor: "{colors.moonlight-white}"
    rounded: "{rounded.sheet-top}"
---

# Design System: Lune

## Overview

**Creative North Star: "午夜月室"**

Lune 像一间只在深夜亮起的共听房：静夜黑构成几乎无干扰的空间，薰衣月光只在关键操作、同步状态与情绪焦点处出现，柔光象牙承载清晰而不刺眼的内容。气质私密、安静、梦幻、浪漫且柔和，界面应让朋友感觉正在共享一段夜晚，而不是操作一套音乐后台。

视觉结构精致轻盈、近乎无边界。层次首先来自极小的深色明度差和低透明度细边框；阴影只保留给必须从当前层级脱离的入口卡片、移动底部面板和确认对话框。Windows 采用编辑式舞台与工具区并置，Android 将同一语言转化为触控优先的单列舞台、底部导航与底部面板。

**Key Characteristics:**

- 静夜黑上的低对比深色分层
- 稀少而明确的薰衣月光焦点
- Space Grotesk 的现代编辑感与中文系统字体的清晰度
- 月相、微粒、氛围光和歌词遮罩形成的克制梦境
- Windows 紧凑操作密度与 Android 触控尺度的同源适配

## Colors

色彩是一套接近单色的夜间体系：静夜黑负责空间，柔光象牙负责阅读，薰衣月光负责注意力；状态色保持柔和、低饱和，不与主色争夺情绪中心。

### Primary

- **薰衣月光：** 用于主按钮、同步在线点、活动计数、选择与播放进度，是整个界面唯一持续出现的品牌焦点。
- **月光高光：** 用于首页标题的情绪重音和比主色更明亮的短句，不用于大面积表面。
- **月光余辉：** 用于更弱的氛围光、封面占位与低强度强调。

### Secondary

- **柔绿回声：** 仅表示服务器就绪或成功状态。
- **雾粉警示：** 用于非破坏性错误、连接失败和表单反馈。
- **心动粉：** 只用于“喜欢”状态，让私人情感动作与系统错误保持分离。

### Neutral

- **静夜黑：** 应用根背景与视觉静场。
- **柔夜黑：** 顶栏、底栏、卡片和移动面板的第一层表面。
- **夜色表面：** 输入、分段控制、列表占位与次级控件。
- **高夜表面：** 聚焦输入、悬停控件和需要微弱抬升的内部层。
- **柔光象牙：** 主要文本与高优先级图标。
- **静默石灰：** 辅助文字、标签、时间和未激活状态。

### Named Rules

**The One Moonlight Rule.** 薰衣月光只服务于当前行动、同步状态和情绪焦点；同一局部不要出现第二种竞争性强调色。

**The Dark Is Not Black Rule.** 用相邻的夜色表面建立结构，不用纯黑卡片堆在纯黑背景上，也不用高对比分割线切碎空间。

## Typography

**Display Font:** Space Grotesk Variable（Space Grotesk、sans-serif 回退）  
**Body Font:** 平台原生中文无衬线字体栈（Segoe UI Variable Text、Noto Sans CJK SC、Microsoft YaHei、system-ui 回退）  
**Editorial Accent Font:** Georgia（Times New Roman、serif 回退）

**Character:** Space Grotesk 提供轻盈、现代、略带唱片编辑感的标题与控制文字；中文正文依赖稳定的系统字体栈保持低亮度界面中的可读性。Georgia 只以小号斜体提示语出现，像唱片内页上的低声注释。

### Hierarchy

- **Display：** 首页英文主标题，细字重与紧凑字距构成最大情绪层，重音行提高字重并切换到月光高光。
- **Mobile Display：** 保留同样的轻重对比，但缩短行长并适配窄屏单列。
- **Title：** 面板标题、曲目标题和关键状态，采用中高字重与轻微负字距。
- **Body：** 中文说明、输入与房间内容；默认保持舒展行高，不依赖高对比来获得清晰度。
- **Control：** 主按钮、主要操作与紧凑控制，字重明确但不过度粗重。
- **Label：** 字段名、时间、状态与元信息，使用较宽字距形成冷静节奏。
- **Editorial Kicker：** 极少量英文或编号提示；不得用于连续正文。

### Named Rules

**The Whispered Serif Rule.** 衬线字体只作为低声的编辑注脚；标题、按钮、表单与长文始终使用无衬线体系。

**The Two-Weight Headline Rule.** 大标题通过细字重与半粗重形成情绪转折，不叠加描边、发光或彩色渐变。

## Layout

Windows 首页使用两列编辑式构图：左侧大标题负责氛围，右侧访问卡负责创建或加入房间；宽屏内容由 `clamp()` 控制外边距和列间距。房间页是固定视口操作台，由顶部状态栏、中央舞台/工具侧栏和底部播放条组成，避免页面级滚动破坏持续播放体验。

Android 与窄视口使用单列结构并尊重安全区域。首页把标题置于上半区、访问卡压在可达的下半区；房间页将搜索、队列、成员与音量收进底部面板，把播放舞台和最重要的“下一首”操作留在主界面。移动列表行和表单提升高度与间距，触控反馈以按压缩放代替桌面悬停。

响应边界由实现共同决定：桌面布局在 1200px 与 900px 逐级压缩，760px 以下进入窄屏规则；Tauri Android 始终锁定移动布局，Tauri 桌面始终锁定桌面布局，浏览器预览在 767px 处切换。Android 布局必须持续处理状态栏、导航栏、刘海与输入法安全区，并维持系统返回行为。

### Named Rules

**The Shared World, Native Posture Rule.** 两端共享颜色、字体和情绪，但不共享僵硬的页面构图；Windows 服务于并行扫描，Android 服务于单手触控和系统级返回。

## Elevation & Depth

体系选择近乎纯平的深色分层。静夜黑、柔夜黑、夜色表面与高夜表面承担绝大多数层级，低透明度白色细边框提供边界。当前实现保留少量柔和环境阴影：访问卡建立入口焦点，移动底部面板与确认对话框脱离当前层级，移动主操作获得短暂的月光余辉；新增普通卡片、列表和导航不得继续扩充阴影词汇。

### Shadow Vocabulary

- **入口环境影：** 仅用于创建/加入房间的入口卡，使其从静夜背景中轻微浮出。
- **浮层环境影：** 仅用于底部面板和必须中断当前流程的确认对话框。
- **月光动作影：** 仅用于 Android 的主要“下一首”动作，表达触控优先级而非装饰。
- **焦点环：** 输入和键盘焦点以薄描边与低强度月光外环呈现，不制造悬浮感。

### Named Rules

**The Near-Flat Rule.** 默认表面保持平整；先用色阶与细边框解决层级，只有跨越交互层的组件才允许使用环境阴影。

## Shapes

形状语言柔和但克制。输入、按钮和分段控制集中在中等圆角；入口卡略大，移动底部面板只圆顶部两角；状态胶囊和圆形图标按钮只用于短信息或单一动作。专辑封面维持接近方形的轻圆角，让音乐内容保留视觉重量。

细边框通常使用低透明度柔光象牙，边界存在但不喧闹。月相、状态点、头像和圆形按钮是少量纯圆元素；不要把所有容器都胶囊化。

### Named Rules

**The Soft Geometry Rule.** 交互控件使用柔和圆角，内容容器保持可读的矩形骨架；胶囊只属于状态、紧凑筛选和单一高优先级动作。

## Components

### Buttons

- **Shape:** 主按钮使用柔和中圆角；Android 的“下一首”使用更大的胶囊轮廓来匹配拇指操作。
- **Primary:** 薰衣月光底配静夜黑文字，48px 高；桌面悬停反转为透明底与月光文字，移动端以轻微缩放提供按压反馈。
- **Focus:** 保留清晰的月光细描边与外偏移，不能只依赖颜色变化。
- **Secondary / Ghost:** 以夜色表面、低透明细边框或纯透明背景存在；只有状态变化时提高文字与边框亮度。
- **Disabled:** 降低整体透明度并移除动作反馈，不改成另一种强调色。

### Chips

- **Style:** 房间码、成员状态和音乐源筛选使用紧凑圆角或胶囊，内部以标签、主值和状态形成层级。
- **State:** 激活态使用极淡的月光或柔光象牙洗色；数量与在线状态可以使用薰衣月光，但不得整块填满。

### Cards / Containers

- **Corner Style:** Windows 入口卡使用 18px，Android 入口卡使用 20px，移动底部面板使用顶部 26px 圆角。
- **Background:** 以柔夜黑为主，内部控件使用夜色表面形成轻微分层。
- **Shadow Strategy:** 遵循 Near-Flat Rule；普通列表、侧栏与导航只使用色阶和细边框。
- **Border:** 低透明度柔光象牙细边框，通常维持约 10% 的可见度。
- **Internal Padding:** 紧凑桌面区域通常在 12–24px 范围，移动卡片与面板侧边保持约 20–26px 的呼吸空间。

### Inputs / Fields

- **Style:** 夜色表面、柔光象牙文字、低透明细边框和 12px 圆角；标签使用小号宽字距。
- **Focus:** 边框转为薰衣月光，内部表面轻微提亮，并出现低强度焦点环。
- **Error / Disabled:** 错误使用雾粉警示文字；等待和禁用状态降低透明度，不改变布局。

### Navigation

Windows 使用顶部状态栏、右侧三段工具切换和底部播放条；活动标签以极淡洗色标识，不使用厚重下划线。Android 使用三个目的地的底部 Dock 与底部面板，保持当前目的地清晰，同时让播放舞台持续占据视觉中心。

### Playback Stage

播放舞台是体系的签名组件。专辑封面、月光氛围、同步状态、歌词遮罩和持续可见的进度共同形成“共听正在发生”的证据；内容缺失时以月相与简短引导维持同一情绪世界，而不是退化为通用空状态。

### Bottom Sheets and Dialogs

Android 的搜索、队列、成员和音量使用可下滑关闭的底部面板；系统返回应逐层退出面板、歌词视图与房间。确认对话框只用于离开房间等不可忽略的决策，短暂反馈应使用非阻塞状态提示。

## Do's and Don'ts

### Do:

- **Do** 用静夜黑、柔夜黑和夜色表面的微小色阶组织结构。
- **Do** 让薰衣月光保持稀少，只标记当前行动、同步状态和情绪重音。
- **Do** 在 Windows 保留并行扫描效率，在 Android 使用安全区、触控热区、底部面板与系统返回。
- **Do** 为按键焦点、错误、加载、断线和减少动态效果提供完整状态。
- **Do** 让专辑封面、歌词、成员状态和播放进度成为房间中的主要信息层。

### Don't:

- **Don't** 使用高饱和赛博霓虹、主流音乐应用式彩色渐变或可爱卡通化表达。
- **Don't** 为普通卡片、列表行和导航增加新的投影；优先使用色阶与细边框。
- **Don't** 把所有容器做成胶囊，也不要用厚重边框切碎夜间空间。
- **Don't** 用衬线字体承担按钮、输入、长正文或高频操作。
- **Don't** 为 Android 直接缩放桌面布局；必须保留触控尺度、安全区、底部面板和系统返回语义。
