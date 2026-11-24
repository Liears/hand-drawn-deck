# hand-drawn-deck

手绘（Excalidraw 风）中文技术汇报页技能：把报告、审计、实验结果做成**单文件、零 CDN、可滚动**的手绘风网页。

## 安装

ZCode，以及其它认 `.agents/skills` 目录的 agent：

```bash
git clone https://github.com/Liears/hand-drawn-deck.git ~/.agents/skills/hand-drawn-deck
```

Claude Code：

```bash
git clone https://github.com/Liears/hand-drawn-deck.git ~/.claude/skills/hand-drawn-deck
```

依赖：

- Python 3 加 `fonttools`、`brotli`：`pip3 install fonttools brotli`（中国大陆加 `-i https://mirrors.aliyun.com/pypi/simple/`）。
- Node 加 playwright：验证脚本用，在任意一个目录里 `npm init -y && npm i playwright && npx playwright install chromium`，之后在这个目录里跑脚本。

## 里面有什么

| 文件 | 内容 |
|---|---|
| `SKILL.md` | 工作流（结构草案先行 → 拼装 → 字体子集 → 三级验证 → 收尾 → 交付）、更新已有 deck 的流程、内容纪律、视觉规范、已知坑速查、自检清单 |
| `assets/template.html` | 起手模板：十一个页型各占一页，是"类名契约"的参考实现。字体文件不进仓库，所以在本目录直接打开它看到的不是手写体（页顶会有红色提示）；拷到 deck 目录并跑一次字体子集脚本之后才是 |
| `assets/template-preview.png` | 模板渲染好的样子：十一页拼成一张长图，小赖体 + Excalifont 已加载 |
| `scripts/refresh_cjk_subset.py` | 字体子集刷新：扫描 HTML 实际用到的非 ASCII 字符 → Xiaolai 子集化（22MB → 约 75KB）→ 生成 fonts.css 并同步 `?v=`，自带字形覆盖自检 |
| `scripts/verify-deck.mjs` | 字符级探针：逐字符确认由自托管字体渲染，另查溢出、字号下限、页码连续、藏页、资源加载、占位符残留、重复 id、页内链接、三种宽度下的横向滚动、中英文间距、超长句；退出码可用 |
| `scripts/shot-deck.mjs` | 布局级目检：逐页截图（自动点亮滚入动画），配合读图工具查"文字撕列"这类探针查不出的问题 |
| `scripts/_browser.mjs` | 上面两个脚本共用：按平台定位 playwright 与 chromium，接受 URL 或本地路径 |
| `references/pitfalls.md` | 故障手册：按症状索引的踩坑记录 |

## 设计要点

- 墨线 `#2b2418`、羊皮纸 `#f4ecd8`，斜线纹理主框、不规整圆角、实色偏移阴影，卡片分四级
- 字体三件自托管：Excalifont（拉丁，官方 npm 子集）、Xiaolai（中文，子集化）、JetBrains Mono（代码）
- 字号下限 20px；设计宽 1920 加 `fit()` 视口缩放（上限 1.3×）；滚动式，不翻页
- 三级验证：截图目检（布局）、字符级探针、可选的读者测试（无上下文的 agent 只读成品回答几个问题）
- 配色：墨线加羊皮纸底，强调色是批注蓝，语义色（绿 / 琥珀 / 红）单独一套
- 文本纪律：中英文之间留空格、单句不超过 40 字、段落不超过 7 行、删掉空话和硬凑的三点
- 示意图：线性链路用 `.flow`，实线是主流程、虚线是次要或异步，只画有依据的关系
- 数字诚实性：同一数字全 deck 一致、口径必标、诚实结论优先于好看结论
- 图表数据驱动：条宽、段宽、折线坐标由数字算出来，不手填；不做断轴、3D、渐变

## 来源

2026-09-09 在 DeepAnalyze 编码能力汇报 deck 的实作中定型。踩坑记录见 `SKILL.md` 的"已知坑速查"和 `references/pitfalls.md`。

图表部分的思路参考了 [Lieflat Charts](https://github.com/larashero3-dotcom/lieflat-charts)（PolyForm Noncommercial 许可）：数值与视觉成正比、断轴的替代方案、颜色不能是唯一线索、同一页元素指向同一口径等。只借鉴了思路，没有使用它的代码和文字。

其它借鉴（均为思路层面）：
- [impeccable](https://github.com/pbakaus/impeccable)（Apache-2.0）：Read 模式定位、收尾的删 / 磨 / 清、浏览器自带表面、先目检后看探针
- Anthropic 官方 skills（Apache-2.0）：`frontend-design`（设计克制、AI 味清单、文案原则）、`internal-comms`（最重要先讲、粒度随读者）、`doc-coauthoring`（读者测试）
- [superpowers](https://github.com/obra/superpowers)（MIT）：只问会改变结构的问题、"用户给的 / 我补的"分栏、数字口径表、没有新证据不声称完成
- [zh-tech-writing](https://github.com/leter/zh-tech-writing)（MIT）、[中文文案排版指北](https://github.com/sparanoid/chinese-copywriting-guidelines)（MIT）、[document-style-guide](https://github.com/ruanyf/document-style-guide)（公共领域）：AI 腔清单、句长与段落上限、中英文混排规则
- [dataviz-skills](https://github.com/holtzy/dataviz-skills)（MIT）：图表错误清单（双 Y 轴、挑数据、排序、图例、取整、波动范围）
- ZCode 的 Excalidraw 插件与 [excalidraw-skill](https://github.com/robonuggets/excalidraw-skill)（MIT）：示意图只画有依据的关系、线型表达含义、箭头带标签
