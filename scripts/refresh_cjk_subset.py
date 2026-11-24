#!/usr/bin/env python3
"""CJK 子集刷新：扫描 deck HTML 里实际用到的全部非 ASCII 字符，把 Xiaolai.ttf 子集化成
~70KB 的 woff2；顺带把 JetBrains Mono 子集化为 ASCII+制表符 woff2。
每次修改 HTML 文案后必须重跑，否则新字会 fallback 到系统黑体。

用法：python3 scripts/refresh_cjk_subset.py [deck目录，默认脚本上级]
      （Windows 上命令名通常是 python 或 py，不是 python3）

输出：
  fonts/Xiaolai-subset.woff2   —— 仅含用到的非 ASCII 字符
  fonts/JetBrainsMono-subset.woff2 —— ASCII + 常用符号
  fonts/fonts.css              —— @font-face + ?v=（内容哈希）
                                   <link> 的 ?v= 是 fonts.css 的内容哈希，
                                   fonts.css 内各字体的 ?v= 是各自文件的内容哈希，都由本脚本同步

依赖：pip install fonttools brotli
退出码：0 完成；缺源字体 / 缺依赖 / 子集化失败时非 0。
"""
from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from pathlib import Path

# stdout 接管道时 Windows 默认用系统编码（中文系统是 GBK），打印 ✓/✗ 会抛 UnicodeEncodeError：
# 生成物已落盘但退出码为 1、覆盖自检的结论也丢了。统一改成 UTF-8。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    sys.exit(0)

DECK = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent)
FONTS = DECK / "fonts"

# 无论正文是否用到，中文排版必需的全角标点与常见符号一次带全（体积可忽略）
BASE_CJK_PUNCT = (
    "，。、；：？！""''（）【】《》〈〉…—·～￥％＋－×÷＝℃°"
    "①②③④⑤⑥⑦⑧⑨⑩√×✓✗→←↑↓↔⇒☐☑☒"
    "─│┌┐└┘├┤┬┴┼═║"
)


def read_raw(p: Path) -> str:
    """原样读，不做换行转换。"""
    with p.open(encoding="utf-8", newline="") as f:
        return f.read()


def write_raw(p: Path, text: str, newline: str = "") -> None:
    """原样写。newline="" 不转换换行，LF 的文件跑完还是 LF。
    （Path.write_text 在 Windows 上会把 \\n 全写成 \\r\\n，改一个字也让整份文件在 git 里显示全量变更。）"""
    with p.open("w", encoding="utf-8", newline=newline) as f:
        f.write(text)


def collect_chars() -> str:
    """扫 deck 目录全部 html，收集用到的全部非 ASCII 字符。

    不能只收 CJK 区：希腊字母（λ、μ）、上标（²、⁷）、全角空格这些技术汇报常用字符
    不在 CJK 区，不收进子集就会静默回落到系统字体，而且原来的覆盖自检也看不到它们。
    可打印 ASCII 不收——Excalifont 全覆盖，排在字体栈第一位。
    """
    chars: set[str] = set(BASE_CJK_PUNCT)
    for html in sorted(DECK.glob("*.html")):
        text = read_raw(html)
        # 去掉<style>/<script>里的内容避免误收？——字体声明也含中文注释，宁可多收
        chars.update(ch for ch in text if ord(ch) > 0x7E)
    return "".join(sorted(chars))


def pyftsubset(src: Path, out: Path, chars: str, extra_args: list[str] | None = None) -> None:
    # --unicodes 接受十六进制码点列表（逗号分隔），不是字面字符
    unicodes = ",".join(f"{ord(c):04X}" for c in chars)
    cmd = [
        sys.executable, "-m", "fontTools.subset", str(src),
        f"--unicodes={unicodes}",
        "--flavor=woff2",
        "--layout-features=*",
        "--no-hinting",
        "--desubroutinize",
        f"--output-file={out}",
    ] + (extra_args or [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[:500], file=sys.stderr)
        raise SystemExit(f"subset failed: {src.name}")
    print(f"  {out.name}: {out.stat().st_size // 1024} KB")


def write_fonts_css(vers: dict[str, str]) -> None:
    css = f"""/* 自托管字体：改字体/改本文件后，index.html 里 <link> 的 ?v= 由本脚本自动同步 */
@font-face {{
  font-family: 'Xiaolai';
  src: url('Xiaolai-subset.woff2?v={vers["xiaolai"]}') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}}
@font-face {{
  font-family: 'Excalifont';
  src: url('Excalifont-latin.woff2?v={vers["excalifont-latin"]}') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}}
@font-face {{
  font-family: 'Excalifont';
  src: url('Excalifont-latin-ext.woff2?v={vers["excalifont-latin-ext"]}') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
  unicode-range: U+0100-024F;
}}
@font-face {{
  font-family: 'JetBrains Mono';
  src: url('JetBrainsMono-subset.woff2?v={vers["jetbrains-mono"]}') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}}
"""
    # <link> 的版本号取 fonts.css 自身的内容哈希：任一字体变了它都会变，浏览器缓存随之失效
    css_ver = hashlib.sha1(css.encode("utf-8")).hexdigest()[:8]
    write_raw(FONTS / "fonts.css", css, newline="\n")
    print("  fonts.css: " + " / ".join(f"{k} ?v={v}" for k, v in vers.items()))

    # 自动同步 index.html 里 <link> 的 ?v=
    for html in sorted(DECK.glob("*.html")):
        text = read_raw(html)
        new = re.sub(r"(fonts\.css\?v=)[0-9a-f]+", rf"\g<1>{css_ver}", text)
        if new != text:
            write_raw(html, new)
            print(f"  {html.name}: link ?v= 已同步为 {css_ver}")


def content_hash(p: Path) -> str:
    return hashlib.sha1(p.read_bytes()).hexdigest()[:8]


def verify_coverage(subset_path: Path, chars: str) -> list[str]:
    """子集后自检：重开输出字体读 cmap，断言每个用到的字符都在。
    缺失 = 源字体本身没有该字形（如 Xiaolai 缺某些符号），浏览器必然回落——
    必须列出让人决策（换写法/接受回落/换字体），不允许静默带病交付。"""
    from fontTools.ttLib import TTFont
    cmap = TTFont(str(subset_path)).getBestCmap() or {}
    return [c for c in chars if ord(c) not in cmap]


def show(chars: list[str]) -> str:
    """缺字带上码位：终端显示不出该字形时也能认出是哪个字符。"""
    return " ".join(f"{c}(U+{ord(c):04X})" for c in chars)


def main() -> None:
    if not FONTS.is_dir():
        raise SystemExit(f"找不到 {FONTS}：先按 SKILL.md 的字体管线建 fonts/ 并下载三个源字体")
    for name in ("Xiaolai.ttf", "Excalifont-latin.woff2", "Excalifont-latin-ext.woff2", "JetBrainsMono-Regular.ttf"):
        if not (FONTS / name).exists():
            raise SystemExit(f"缺源字体 fonts/{name}：按 SKILL.md 的字体管线下载")
    try:
        import fontTools  # noqa: F401
        import brotli  # noqa: F401
    except ImportError:
        raise SystemExit("缺依赖：pip3 install fonttools brotli（中国大陆加 -i https://mirrors.aliyun.com/pypi/simple/）")

    chars = collect_chars()
    n_cjk = sum(1 for c in chars if 0x4E00 <= ord(c) <= 0x9FFF)
    print(f"[subset] 收集到 {n_cjk} 个汉字 + {len(chars) - n_cjk} 个标点/符号/其它非 ASCII 字符")

    pyftsubset(FONTS / "Xiaolai.ttf", FONTS / "Xiaolai-subset.woff2", chars)
    # JetBrains Mono：ASCII 可打印 + 常用箭头/制表符（代码窗用）
    jbm_chars = "".join(chr(c) for c in range(0x20, 0x7F)) + "─│┌┐└┘├┤┬┴┼→←·"
    pyftsubset(FONTS / "JetBrainsMono-Regular.ttf", FONTS / "JetBrainsMono-subset.woff2", jbm_chars)

    write_fonts_css({
        "xiaolai": content_hash(FONTS / "Xiaolai-subset.woff2"),
        "excalifont-latin": content_hash(FONTS / "Excalifont-latin.woff2"),
        "excalifont-latin-ext": content_hash(FONTS / "Excalifont-latin-ext.woff2"),
        "jetbrains-mono": content_hash(FONTS / "JetBrainsMono-subset.woff2"),
    })

    # 字形覆盖自检（2026-09-15 坑：改文案后忘跑脚本/字体本身缺字 → 回落黑体且无人发现）
    miss_x = verify_coverage(FONTS / "Xiaolai-subset.woff2", chars)
    miss_j = verify_coverage(FONTS / "JetBrainsMono-subset.woff2", jbm_chars)
    if not miss_x and not miss_j:
        print(f"[verify] 字形覆盖 ✓ 全部 {len(chars)} 字符在子集内")
    else:
        if miss_x:
            print(f"[verify] ✗ Xiaolai 缺 {len(miss_x)} 个字形（源字体没有，浏览器必然回落）：{show(miss_x)}")
        if miss_j:
            print(f"[verify] ✗ JetBrains Mono 缺字形：{show(miss_j)}")
        print("[verify] 处理：换写法（如 ①→1.）/ 接受回落 / 换字体，不要静默带病交付")
    print("[subset] 完成。<link> 的 ?v=（fonts.css 的内容哈希）与 fonts.css 内各字体的 ?v= 都已由本脚本同步，不用手改")


if __name__ == "__main__":
    main()
