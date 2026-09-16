#!/usr/bin/env python3
"""CJK 子集刷新：扫描 deck HTML 里实际用到的中文字符，把 Xiaolai.ttf 子集化成
~70KB 的 woff2；顺带把 JetBrains Mono 子集化为 ASCII+制表符 woff2。
每次修改 HTML 中文文案后必须重跑，否则新字会 fallback 到系统黑体。

用法：python3 scripts/refresh_cjk_subset.py [deck目录，默认脚本上级]

输出：
  fonts/Xiaolai-subset.woff2   —— 仅含用到的中文字符
  fonts/JetBrainsMono-subset.woff2 —— ASCII + 常用符号
  fonts/fonts.css              —— @font-face + ?v=（内容哈希，css 与引用两处同步）

依赖：pip install fonttools brotli
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

DECK = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent)
FONTS = DECK / "fonts"

# 无论正文是否用到，中文排版必需的全角标点与常见符号一次带全（体积可忽略）
BASE_CJK_PUNCT = (
    "，。、；：？！""''（）【】《》〈〉…—·～￥％＋－×÷＝℃°"
    "①②③④⑤⑥⑦⑧⑨⑩√×✓✗→←↑↓↔⇒☐☑☒"
    "─│┌┐└┘├┤┬┴┼═║"
)

def collect_chars() -> str:
    """扫 deck 目录全部 html，收集 CJK 区 + 全角区 + 基础标点。"""
    chars: set[str] = set(BASE_CJK_PUNCT)
    for html in sorted(DECK.glob("*.html")):
        text = html.read_text(encoding="utf-8")
        # 去掉<style>/<script>里的内容避免误收？——字体声明也含中文注释，宁可多收
        for ch in text:
            o = ord(ch)
            if (
                0x4E00 <= o <= 0x9FFF    # CJK 统一表意
                or 0x3400 <= o <= 0x4DBF  # 扩展 A
                or 0x3000 <= o <= 0x303F  # CJK 标点
                or 0xFF00 <= o <= 0xFFEF  # 全角形式
            ):
                chars.add(ch)
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


def write_fonts_css(xiaolai_ver: str, jbm_ver: str) -> None:
    css = f"""/* 自托管字体：改字体/改本文件后，index.html 里 <link> 的 ?v= 由本脚本自动同步 */
@font-face {{
  font-family: 'Xiaolai';
  src: url('Xiaolai-subset.woff2?v={xiaolai_ver}') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}}
@font-face {{
  font-family: 'Excalifont';
  src: url('Excalifont-latin.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}}
@font-face {{
  font-family: 'Excalifont';
  src: url('Excalifont-latin-ext.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
  unicode-range: U+0100-024F;
}}
@font-face {{
  font-family: 'JetBrains Mono';
  src: url('JetBrainsMono-subset.woff2?v={jbm_ver}') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}}
"""
    (FONTS / "fonts.css").write_text(css, encoding="utf-8")
    print(f"  fonts.css: xiaolai ?v={xiaolai_ver} / jbm ?v={jbm_ver}")

    # 自动同步 index.html 里 <link> 的 ?v=（两处一致由脚本保证）
    for html in sorted(DECK.glob("*.html")):
        text = html.read_text(encoding="utf-8")
        new = re.sub(r"(fonts\.css\?v=)[0-9a-f]+", rf"\g<1>{xiaolai_ver}", text)
        if new != text:
            html.write_text(new, encoding="utf-8")
            print(f"  {html.name}: link ?v= 已同步为 {xiaolai_ver}")


def content_hash(p: Path) -> str:
    return hashlib.sha1(p.read_bytes()).hexdigest()[:8]


def verify_coverage(subset_path: Path, chars: str, family: str) -> list[str]:
    """子集后自检：重开输出字体读 cmap，断言每个用到的字符都在。
    缺失 = 源字体本身没有该字形（如 Xiaolai 缺某些符号），浏览器必然回落——
    必须列出让人决策（换写法/接受回落/换字体），不允许静默带病交付。"""
    from fontTools.ttLib import TTFont
    cmap = TTFont(str(subset_path)).getBestCmap() or {}
    return [c for c in chars if ord(c) not in cmap]


def main() -> None:
    chars = collect_chars()
    n_cjk = sum(1 for c in chars if 0x4E00 <= ord(c) <= 0x9FFF)
    print(f"[subset] 收集到 {n_cjk} 个汉字 + {len(chars) - n_cjk} 个标点/符号")

    pyftsubset(FONTS / "Xiaolai.ttf", FONTS / "Xiaolai-subset.woff2", chars)
    # JetBrains Mono：ASCII 可打印 + 常用箭头/制表符（代码窗用）
    jbm_chars = "".join(chr(c) for c in range(0x20, 0x7F)) + "─│┌┐└┘├┤┬┴┼→←·"
    pyftsubset(FONTS / "JetBrainsMono-Regular.ttf", FONTS / "JetBrainsMono-subset.woff2", jbm_chars)

    write_fonts_css(content_hash(FONTS / "Xiaolai-subset.woff2"),
                    content_hash(FONTS / "JetBrainsMono-subset.woff2"))

    # 字形覆盖自检（2026-09-15 坑：改文案后忘跑脚本/字体本身缺字 → 回落黑体且无人发现）
    miss_x = verify_coverage(FONTS / "Xiaolai-subset.woff2", chars, "Xiaolai")
    miss_j = verify_coverage(FONTS / "JetBrainsMono-subset.woff2", jbm_chars, "JetBrains Mono")
    if not miss_x and not miss_j:
        print(f"[verify] 字形覆盖 ✓ 全部 {len(chars)} 字符在子集内")
    else:
        if miss_x:
            print(f"[verify] ✗ Xiaolai 缺 {len(miss_x)} 个字形（源字体没有，浏览器必然回落）：{''.join(miss_x)}")
        if miss_j:
            print(f"[verify] ✗ JetBrains Mono 缺字形：{''.join(miss_j)}")
        print("[verify] 处理：换写法（如 ①→1.）/ 接受回落 / 换字体，不要静默带病交付")
    print("[subset] 完成。index.html 的 <link ...fonts.css?v=XXX> 需与 fonts.css 内 ?v= 保持一致（两处）")


if __name__ == "__main__":
    main()
