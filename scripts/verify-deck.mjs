// 程序化探针（字符级）：缺字 / 溢出 / 字号下限 / 页码连续 / 藏页 / 资源加载失败 / 占位符残留。
// 布局级问题（文字撕列、链接浮空、层次倒挂）它查不出来，要配合 shot-deck.mjs 目检。
//
// 用法（在装了 playwright 的目录里运行）：
//   node <skill>/scripts/verify-deck.mjs <deck 的 URL 或本地 index.html 路径> [额外要查的字符]
// 第二个参数：还没写进 HTML、但准备用到的字符（如 "锚冻鎏"），会一并检查子集里有没有。
// 退出码：0 全部通过；1 有 FAIL；2 参数错误；3 环境问题（playwright / 浏览器）。
import { openPage, toUrl } from './_browser.mjs';

const HELP = `用法：node verify-deck.mjs <deck-url 或 index.html 路径> [额外要查的字符]
  例：node verify-deck.mjs http://127.0.0.1:8000/index.html 锚冻鎏
环境：在装了 playwright 的目录里运行；浏览器默认用 playwright 自带的，
      可用 CHROME_EXE 指向本机 Chrome / Edge。`;
if (!process.argv[2] || /-h|--help/.test(process.argv[2])) { console.log(HELP); process.exit(process.argv[2] ? 0 : 2); }

const url = toUrl(process.argv[2]);
const extra = [...new Set(process.argv[3] || '')];

const { browser, page } = await openPage({ width: 1680, height: 945 });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errs.push('reqfail: ' + r.url().slice(0, 90)));
await page.goto(url);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1800);

const r = await page.evaluate(async (extra) => {
  const q = (s) => [...document.querySelectorAll(s)];
  const slides = q('.slide');

  // 先把 @font-face 声明的字体各加载一遍再看状态。浏览器只在有文字用到某套字体时才加载它：
  // 没有代码窗的 deck 里 JetBrains Mono 永远不会加载，只看"已加载了哪些"就会误报字体不全。
  for (const f of document.fonts) { try { await f.load(); } catch { /* 失败的按下面的 status 报 */ } }
  const fontErrors = [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family);

  // ---- 缺字：document.fonts.check() 只要字体已加载就返回 true，查不出子集里没有的字形 ----
  // 可靠判据：同一字符分别用"某字体"和"一个不存在的字体"在 CPU 画布上按共享基线渲染，
  // 像素完全一致 ⟺ 该字体没有这个字形、浏览器回落到了系统字体。
  const C = 96;
  const mk = (font) => {
    const c = document.createElement('canvas'); c.width = C; c.height = C;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.font = '64px ' + font; x.fillStyle = '#000'; x.textBaseline = 'alphabetic';
    return x;
  };
  const sig = (x, ch) => { x.clearRect(0, 0, C, C); x.fillText(ch, 4, 74); return x.getImageData(0, 0, C, C).data; };
  const same = (a, b) => { for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false; return true; };
  const NONE = mk("'hdd-no-such-font'");
  const fb = new Map(), ctx = new Map(), cache = new Map();
  const famHas = (fam, ch) => {
    const k = fam + '|' + ch;
    if (cache.has(k)) return cache.get(k);
    if (!fb.has(ch)) fb.set(ch, sig(NONE, ch));
    if (!ctx.has(fam)) ctx.set(fam, mk("'" + fam.replace(/'/g, "\\'") + "'"));
    const has = !same(sig(ctx.get(fam), ch), fb.get(ch));
    cache.set(k, has);
    return has;
  };
  const FAMS = [...new Set([...document.fonts].map((f) => f.family.replace(/^["']|["']$/g, '')))];
  const SKIP = /[\s\p{M}\p{Default_Ignorable_Code_Point}]/u;
  const cp = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase();
  let checked = 0;
  const miss = new Map();
  const root = document.querySelector('.deck') || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement;
    if (!el || el.closest('script,style')) continue;
    const stack = getComputedStyle(el).fontFamily.split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, '')).filter((f) => FAMS.includes(f));
    for (const ch of n.textContent) {
      if (SKIP.test(ch)) continue;
      checked++;
      if (!stack.some((f) => famHas(f, ch)) && !miss.has(ch)) {
        miss.set(ch, { ch, cp: cp(ch), where: (el.className || el.tagName) + ' | ' + n.textContent.trim().replace(/\s+/g, ' ').slice(0, 14), stack: stack.join(', ') || '(未使用自托管字体)' });
      }
    }
  }
  // 人工决定接受回落的字符：<meta name="fallback-ok" content="…">
  const ok = new Set(document.querySelector('meta[name="fallback-ok"]')?.content || '');
  const accepted = [...miss.values()].filter((m) => ok.has(m.ch));
  accepted.forEach((m) => miss.delete(m.ch));
  for (const ch of extra) {
    if (!SKIP.test(ch) && !FAMS.some((f) => famHas(f, ch)) && !miss.has(ch)) {
      miss.set(ch, { ch, cp: cp(ch), where: '(命令行传入的探针字符，尚未写进 HTML)', stack: FAMS.join(', ') });
    }
  }

  const tag = (el) => (el.className || el.tagName) + ' | ' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18);
  const overflow = [];
  for (const el of q('.slide *')) {
    const cs = getComputedStyle(el);
    // 文字伸进右侧内边距时 scrollWidth 不变，这类元素（代码窗的 pre 等）改用 Range 量文字的真实边界
    const inlineOnly = [...el.children].every((c) => getComputedStyle(c).display === 'inline');
    const padded = inlineOnly && (parseFloat(cs.paddingLeft) || parseFloat(cs.paddingRight));
    let out = el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto';
    if (!out && padded && (el.textContent || '').trim()) {
      const box = el.getBoundingClientRect(), k = box.width / el.offsetWidth || 1;
      const rg = document.createRange(); rg.selectNodeContents(el);
      const text = rg.getBoundingClientRect();
      out = text.right > box.right - parseFloat(cs.paddingRight) * k + 2 || text.left < box.left + parseFloat(cs.paddingLeft) * k - 2;
    }
    if (out) overflow.push(tag(el));
  }
  const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))];
  const pagenos = q('.pageno').map((e) => e.textContent.trim());
  const small = q('.slide *').filter((el) => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return el.children.length === 0 && (el.textContent || '').trim() && fs < 19;
  }).map((el) => tag(el) + ' | ' + getComputedStyle(el).fontSize);
  // heights 是缩放后的视口像素（本脚本视口宽 1680，即 0.875×）；designHeights 是未缩放的设计稿像素
  const heights = slides.map((s) => Math.round(s.getBoundingClientRect().height));
  const designHeights = slides.map((s) => s.offsetHeight);
  // 藏页：.slide 必须在普通流里（禁 absolute / fixed / display:none / visibility:hidden）
  const hiddenSlides = slides.map((s, i) => ({ s, i })).filter(({ s }) => {
    const cs = getComputedStyle(s);
    return /^(absolute|fixed)$/.test(cs.position) || cs.display === 'none' || cs.visibility === 'hidden';
  }).map(({ i }) => i + 1);
  // 页内的"第 N 页"引用：N 超过总页数一定是指错了（插页、删页之后常见）
  const staleRefs = slides.map((s, i) => ({ i: i + 1, m: [...s.textContent.matchAll(/第\s*(\d+)\s*页/g)].map((m) => +m[1]).filter((n) => n > slides.length) }))
    .filter((x) => x.m.length).map((x) => 'p' + x.i + ': 第' + [...new Set(x.m)].join('、') + '页 超出总页数 ' + slides.length);
  let reducedMotion = false;
  for (const ss of document.styleSheets) {
    try { for (const rule of ss.cssRules) if (rule.media && /prefers-reduced-motion/.test(rule.media.mediaText)) reducedMotion = true; } catch { /* 跨域样式表读不到 */ }
  }
  // 占位残留（WARN）：连注释一起查——"待做 / 待部署 / 待复核"是真实的状态词，不算占位。
  // href="#" 是占位链接：模板里的票号就是这种，留着的话点一下会跳回页顶。
  const PH = /TODO|TBD|FIXME|lorem ipsum|\[insert|待填|待补充/i;
  const placeholders = slides.map((s, i) => ({ i: i + 1, m: s.outerHTML.match(PH) })).filter((x) => x.m)
    .map((x) => 'p' + x.i + ':' + x.m[0]);
  const emptyLinks = q('.slide a[href="#"]').length;
  return {
    missing: [...miss.values()], checked, accepted,
    overflowN: overflow.length, overflow: overflow.slice(0, 8),
    fonts, fontErrors, slides: slides.length, pagenos, small: small.slice(0, 8), heights, designHeights,
    hiddenSlides, reducedMotion, placeholders, emptyLinks, staleRefs,
    templateSample: !!document.querySelector('meta[name="deck-template"]'),
  };
}, extra);

// 页码连续性：N / M，M == 页数
const pagenosOk = r.pagenos.length === r.slides && r.pagenos.every((t, i) => t === `${i + 1} / ${r.slides}`);
const needFonts = ['Xiaolai', 'Excalifont', 'JetBrains Mono'];
const fontsOk = needFonts.every((f) => r.fonts.includes(f)) && !r.fontErrors.length;
const tall = r.heights.map((h, i) => ({ h, i: i + 1 })).filter((x) => x.h > 1400).map((x) => 'p' + x.i + ':' + x.h + 'px');

console.log(JSON.stringify({ ...r, pagenosOk, errs }, null, 1));
const line = (tag, name, val) => console.log(`[${tag}] ${name}=${JSON.stringify(val)}`);
line(r.missing.length ? 'FAIL' : 'PASS', 'missing', r.missing.map((m) => `${m.ch}(${m.cp}) @${m.where}`));
line(r.overflowN ? 'FAIL' : 'PASS', 'overflowN', r.overflowN);
line(r.small.length ? 'FAIL' : 'PASS', 'small', r.small);
line(errs.length ? 'FAIL' : 'PASS', 'errs', errs);
line(pagenosOk ? 'PASS' : 'FAIL', 'pagenosOk', pagenosOk);
line(fontsOk ? 'PASS' : 'FAIL', 'fonts', r.fontErrors.length ? r.fonts.concat(['加载失败: ' + r.fontErrors.join(',')]) : r.fonts);
line(r.hiddenSlides.length ? 'FAIL' : 'PASS', 'hiddenSlides', r.hiddenSlides);
line(r.reducedMotion ? 'PASS' : 'FAIL', 'reducedMotion', r.reducedMotion);
line(r.accepted.length ? 'WARN' : 'PASS', 'acceptedFallback', r.accepted.map((m) => `${m.ch}(${m.cp})`));
line(r.placeholders.length ? 'WARN' : 'PASS', 'placeholders', r.placeholders);
line(r.emptyLinks ? 'WARN' : 'PASS', 'emptyLinks', r.emptyLinks);
line(r.staleRefs.length ? 'WARN' : 'PASS', 'staleRefs', r.staleRefs);
line(r.templateSample ? 'WARN' : 'PASS', 'templateSample', r.templateSample);
console.log(`[INFO] slides=${r.slides} glyphsChecked=${r.checked} heights=${r.heights.join(',')}${tall.length ? ' tall(>1400px)=' + tall.join(' ') : ''}`);
console.log(`[INFO] designHeights=${r.designHeights.join(',')}（未缩放的设计稿像素；heights 是 1680 宽视口下按 0.875× 缩放后的值，与单页高度基线同一口径）`);
if (r.missing.length) console.log('       缺字修法：改文案后重跑 refresh_cjk_subset.py；源字体确实没有的字符换写法，或写进 <meta name="fallback-ok" content="…"> 表示已人工接受回落');
const fail = r.missing.length || r.overflowN || r.small.length || errs.length || !pagenosOk || !fontsOk || r.hiddenSlides.length || !r.reducedMotion;
console.log(fail ? '验收：FAIL' : '验收：PASS');
await browser.close();
process.exit(fail ? 1 : 0);
