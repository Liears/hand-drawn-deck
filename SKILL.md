---
name: hand-drawn-deck
description: 制作手绘（Excalidraw 风格）中文技术 HTML deck/汇报页——单文件、零 CDN、可滚动。当用户要"手绘风 HTML""Excalidraw 风格汇报/deck""羊皮纸手绘分享页"或要求把某份报告做成手绘 deck 时使用。含字体子集管线、四级卡片体系、fit 缩放、滚入动画与数字诚实性纪律。
---

# Hand-drawn Deck（Excalidraw 风中文技术汇报页）

产出：**单文件、零依赖、可滚动**的手绘风 HTML 分享页（deck = 若干 .slide 纵向堆叠，非翻页）。

## 工作流（必须按序，不可一口气写完）

1. **先给结构草案**：每页（标题 + 核心点一句话 + 版式），用户确认后再填内容。禁止跳过确认直接写全文。
2. 每页只讲一件事，装不下就拆页。字号一律走 `--fs-*` token。
3. **每加新中文必须重跑子集刷新脚本**（见下）。脚本自带**字形覆盖自检**：跑完自动断言 HTML 里每个字符都在子集 cmap 内；字体本身缺的字形会点名列出（浏览器必然回落），须人工决策换写法/接受/换字体，不许静默带病交付。
4. 交付前跑**程序化探针**（见"验证"段），再列出需浏览器抽查的点。

## 风格规范（不可违）

- 墨线 `--ink:#2b2418`；羊皮纸底 `--paper:#f4ecd8`，**不做旧**（仅两层极淡 radial 纸纹）。
- **卡片四级分级**，禁用裸 `--paper` 填卡片，硬度随层级递增不倒挂：
  1. `.card` 主框：2px ink 边 + hachure 斜线纹理（`repeating-linear-gradient(45deg,transparent 0 7px,rgba(43,36,24,.09) 7px 8.5px)` 叠 paper-2）+ 偏移实色阴影 `4px 4px 0`
  2. `.subcard` 子卡：1.5px ink、paper-2、`3px 3px 0` 阴影
  3. `.inset`：1.4px 半透明边、paper-3、无阴影
  4. `.anno` 注解：border-left 5px 强调色条 + 柔色底
- **A vs B 对比**：主推项 hachure 纹理卡，对照项 paper-2 素色卡。
- 圆角不规整：`8px 12px 9px 11px/11px 8px 12px 9px`（子卡另设一组）；阴影一律实色偏移，**不用模糊**。
- 字体三件（全自托管，见字体管线）：拉丁 **Excalifont**、中文 **Xiaolai**（禁 LongCang/Ma Shan Zheng）、代码 **JetBrains Mono**。
- **字号 floor 20px**（唯一例外：代码窗 mono 19px）。scale：stat 80 / readout 64 / title 56 / body 28 / h3 26 / mono-md 22 / label 20 / micro 20。
- 大字（>100px 无、80px 有）line-height ≥1.1；短标签 `nowrap`、专有名词用 `&nbsp;` 焊死（如 `GLM-5.3-Flash`、`2/4 → 3/4`）、正文 `word-break:keep-all`。
- **可滚动单页非翻页**：设计宽 1920px + `fit()` 按视口宽缩放（上限 1.3×，`stage.style.height = deck.getBoundingClientRect().height`）；`.slide` 普通流堆叠（禁 absolute/opacity:0 藏页）；滚入动画用 IntersectionObserver（threshold 0.12，进入即 unobserve）；`prefers-reduced-motion` 兜底直接显示。
- 代码用 VSCode Dark+ 手写窗（避免高亮库）：底 `#1e1e1e` + mac 三圆点；token 只标 cm `#6a9955` / kw `#569cd6` / st `#ce9178` / fn `#dcdcaa` / cls `#4ec9b0` / num `#b5cea8`；`< > { }` 转义；每窗 ≤22 行。
- **数字诚实性**：同一数字全 deck 一致（改一处 grep 全同步）；理论/实测不跨口径相减；每个 readout 旁标口径（n、trial 数、来源）；数据来自真实日志不得编造。诚实结论优先于好看结论。**过时可见**：deck 是活文档——被审计/待复核/已部分推翻的数字必须带状态标注（如"审计复核中"），禁止让读者把污染数字当定论。
- **类名即风格契约**：改内容/加页**禁止发明新 CSS 类**，用既有类（card/subcard/inset/anno/t-label/t-readout/t-stat/badge/codewin）+ grid/flex 拼装。新组件（如汇总总账表）也这么拼——0 新 CSS，风格一致性自动保持，且免去样式对撞调试。
- **叙事纪律**（用户明确反馈过的红线）：不造时间线——除非内容本身真是时序；不用比喻链条（"机制→尺子"式造词比喻禁止）；平铺直叙说事实与结论。结构跟着内容走，不为观感虚构结构。
- 对比图（如 A/B 双条）：线型+色相双重区分（基线=斜纹/虚感 + 异色，主项=实色）。

## 字体管线（首次在某项目用时搭一次）

```bash
pip3 install fonttools brotli -i https://mirrors.aliyun.com/pypi/simple/
mkdir -p <deck目录>/{fonts,scripts} && cp ~/.claude/skills/hand-drawn-deck/scripts/refresh_cjk_subset.py <deck目录>/scripts/
cd <deck目录>/fonts
# Excalifont（官方 npm 包的 latin 子集，总 ~27KB）：
mkdir /tmp/excali-pkg && cd /tmp/excali-pkg && npm pack @excalidraw/excalidraw@0.18.0
tar xzf excalidraw-*.tgz
cp package/dist/prod/fonts/Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2 <deck>/fonts/Excalifont-latin.woff2
cp package/dist/prod/fonts/Excalifont/Excalifont-Regular-3f2c5db56cc93c5a6873b1361d730c16.woff2 <deck>/fonts/Excalifont-latin-ext.woff2
# Xiaolai 全量 TTF（22MB，子集后 <100KB）：
curl -sL -o <deck>/fonts/Xiaolai.ttf "https://gh-proxy.com/https://github.com/Auriand20031203/xiaolai-font/raw/main/Xiaolai-Regular.ttf"
# JetBrains Mono：
curl -sL -o <deck>/fonts/JetBrainsMono-Regular.ttf "https://gh-proxy.com/https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/ttf/JetBrainsMono-Regular.ttf"
# 每次改完 HTML 中文：
cd <deck目录> && python3 scripts/refresh_cjk_subset.py
```

脚本自动：扫 HTML 收集用到的 CJK → 子集化 Xiaolai（含全角标点/常用符号白名单）→ 生成 `fonts/fonts.css`（@font-face + 内容哈希 `?v=`）→ **自动同步 index.html 里 `<link>` 的 `?v=`**（两处一致由脚本保证）。

## 程序化验证（交付前必跑；截图不可依赖）

**思想**：你无法保证"能看见截图"——截图可能被环境转存/拦截，目检不可复现。程序化断言（0 缺字、0 溢出、页面在）是可复现的主路径，浏览器抽查是补充。

```js
// verify-deck.mjs —— node verify-deck.mjs http://<host>/<deck>/index.html
import { chromium } from 'playwright';   // 从含 playwright 的项目跑，或写绝对 import 路径
// 浏览器版本错配兜底：repo 的 playwright 需要的版本缓存里没有时，扫现存二进制
const exe = '/root/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome';
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const p = await b.newPage({ viewport: { width: 1680, height: 945 } });
await p.goto(process.argv[2]);
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  // 探针字符 = 本轮新加文案里挑的、此前子集大概率没有的字
  const probe = '<新文案中的字，如：总账归因复核>';
  const missing = [...new Set([...probe].filter(c => !document.fonts.check('20px Xiaolai', c)))];
  const overflow = [...document.querySelectorAll('.slide *')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).length;
  const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family);
  return { missing, overflow, fonts };
});
console.log(JSON.stringify(r));  // 验收：missing=[] && overflow===0 && 含 Xiaolai
await b.close();
```

## 已知坑（血泪）

- `fontTools.subset --unicodes` 接受**十六进制码点列表**，传字面字符报 `invalid literal for int()`。
- google/fonts 仓库里 Xiaolai 路径 404；jsdelivr 对该仓 raw 返回错误页（下载到的 77 字节文件先 `file` 验证）。
- gh-proxy 下载的文件小于 1KB 时大概率是错误页，要检查内容再继续。
- 系统字体黑体混排 = 子集缺字，重跑脚本即可（脚本现已带覆盖自检，缺字会点名）；改字体/css 后 `?v=` 必须两处同步（脚本已自动化）。
- playwright 浏览器版本错配：repo 依赖要的 build（如 chromium_headless_shell-1217）缓存里没有时 launch 直接报错——扫 `/root/.cache/ms-playwright/` 下现存二进制，`executablePath` 指过去（本机是 chromium-1243 arm64）。
- 截图可能被执行环境转存成外链而非内联可视——**不要**把验收押在"我能看见图"上，用程序化探针断言。
- vitest/子集等任何 python 工具在这台机器装包用阿里云 pip 源。
- `docker run --platform linux/amd64` 需先注册 qemu binfmt（这台 aarch64 机器上做过，约 29x 减速，与 deck 无关但常一起问）。

## 自检清单（交付前）

- [ ] 卡片四级无倒挂、无裸 paper 背景的卡片
- [ ] 无字号 <20px（代码窗 19px 除外）
- [ ] 大字有空隙、专有名词没被劈开（窄窗口下检查）
- [ ] 每页一个核心点；绝对定位/装饰没盖内容
- [ ] 数字对齐、全 deck 一致、每处标口径；待复核/被推翻的数字带状态标注
- [ ] 新中文跑过子集刷新（脚本自检 0 缺字）、`?v=` 两处一致
- [ ] 程序化探针通过：missing=[]、overflow=0、字体家族齐全
- [ ] 无新发明 CSS 类（内容全用既有类拼装）；无虚构时间线/比喻
- [ ] `prefers-reduced-motion` 兜底存在
- [ ] 向用户列出浏览器抽查点（程序化探针覆盖不了的：观感、配色、层次）
