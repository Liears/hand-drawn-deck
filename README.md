# hand-drawn-deck

手绘（Excalidraw 风格）中文技术 HTML deck 技能——单文件、零 CDN、可滚动的汇报页生成规范与工具链。

给 Claude Code / 其他 agent 用：装到 `~/.claude/skills/hand-drawn-deck/` 即可触发。

## 安装

```bash
git clone https://github.com/Liears/hand-drawn-deck.git ~/.claude/skills/hand-drawn-deck
```

首次使用需装字体工具：`pip3 install fonttools brotli`（中国大陆：`-i https://mirrors.aliyun.com/pypi/simple/`）。

## 里面有什么

| 文件 | 内容 |
|---|---|
| `SKILL.md` | 完整规范：工作流（结构草案先行）、四级卡片体系、字号 token、fit 缩放、滚入动画、代码窗、数字诚实性、自检清单、坑清单 |
| `scripts/refresh_cjk_subset.py` | CJK 子集刷新：扫描 HTML 实际用字 → Xiaolai 子集化（全量 22MB → <100KB）→ 生成 fonts.css + `?v=` 双处自动同步 |

## 设计要点

- 墨线 `#2b2418` / 羊皮纸 `#f4ecd8`，hachure 斜线主框 + 不规整圆角 + 实色偏移阴影
- 字体三件自托管：Excalifont（拉丁，官方 npm 子集）/ Xiaolai（中文，子集化）/ JetBrains Mono（代码）
- 字号 floor 20px；设计宽 1920 + `fit()` 视口缩放（上限 1.3×）；滚动式非翻页
- 数字诚实性纪律：同一数字全 deck 一致、口径必标、诚实结论优先于好看结论

## 来源

2026-09-09 在 DeepAnalyze 编码能力汇报 deck 的实作中定型（踩坑记录见 SKILL.md「已知坑」）。
