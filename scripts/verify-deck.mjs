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
    if (!el.getClientRects().length) continue; // hidden / display:none 的切换面板不参与溢出测量
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
  const brokenImages = q('.slide img').filter((img) => !img.complete || img.naturalWidth === 0)
    .map((img) => (img.getAttribute('src') || '(no-src)') + ' | ' + (img.alt || ''));
  const ownText = (el) => [...el.childNodes].filter((nd) => nd.nodeType === 3).map((nd) => nd.textContent).join('').trim();
  const small = q('.slide *').filter((el) => {
    const svg = el.closest('svg');
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (!ownText(el)) return false;
    if (svg) {
      const vbW = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : 0;
      const scaleToDesign = vbW ? (svg.clientWidth || svg.getBoundingClientRect().width / 0.875) / vbW : 1;
      return fs * scaleToDesign < 16; // SVG 标注在设计稿尺度下低于 16px 才算偏小（不误报 viewBox 坐标系标签）
    }
    return fs < 20 && !(fs === 19 && el.closest('.codewin'));   // 正文字号下限 20px；只豁免代码窗的 19px
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
  // 重复的 id：复制整页来加页时最常见，锚点链接会悄悄指到第一处
  const idCount = new Map();
  for (const el of q('[id]')) idCount.set(el.id, (idCount.get(el.id) || 0) + 1);
  const dupIds = [...idCount].filter(([, c]) => c > 1).map(([id, c]) => id + '×' + c);
  // 指不到任何元素的页内链接
  const deadAnchors = q('a[href^="#"]').map((a) => a.getAttribute('href'))
    .filter((h) => h.length > 1 && !document.getElementById(h.slice(1)));
  // 散落的色值：颜色只走 :root 里的 token。图表内部（svg 里）由模板自己管，不查
  const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/i;
  const strayColors = q('.slide [style]').filter((el) => !el.closest('svg') && COLOR.test(el.getAttribute('style')))
    .map((el) => (el.className || el.tagName) + ' | ' + el.getAttribute('style').match(COLOR)[0]);
  // 中文与英文、数字之间留一个空格；正文句子不超过 60 字、一个分句不超过 40 字（只查正文，不查代码和图表）
  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;
  const LATIN = /[A-Za-z0-9]/;
  const BLOCK = /^(block|flex|grid|list-item|table-cell)$/;
  const spacing = new Map(), longText = new Set();
  // 按"叶子块"取 innerText：跨 <a>、<b> 这类行内元素的相邻字符和整句才不会被漏掉
  const blocks = q('.slide *').filter((el) => {
    if (el.closest('pre,code,svg,script,style') || !(el.innerText || '').trim()) return false;
    return ![...el.querySelectorAll('*')].some((c) => BLOCK.test(getComputedStyle(c).display));
  });
  for (const el of blocks) {
    const s = el.innerText || '';
    if (!s.trim()) continue;
    const where = el.className || el.tagName;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      if ((CJK.test(a) && LATIN.test(b)) || (LATIN.test(a) && CJK.test(b))) spacing.set(where + ' | ' + a + b, true);
    }
    s.split(/[。！？!?\n]+/).forEach((sent) => {
      const t2 = sent.trim();
      if (t2.length > 60) longText.add('句 ' + t2.length + ' 字：' + t2.slice(0, 14) + '…');
      t2.split(/[，、；：,;\n]+/).forEach((cl) => {
        if (cl.trim().length > 40) longText.add('分句 ' + cl.trim().length + ' 字：' + cl.trim().slice(0, 14) + '…');
      });
    });
  }
  // 用了但 <style> 里没定义的类：拼错或发明的类名会静默失效
  const defined = new Set();
  for (const ss of document.styleSheets) {
    try {
      for (const rule of ss.cssRules) {
        const sel = rule.selectorText || '';
        sel.replace(/\.([A-Za-z_][\w-]*)/g, function (m2, c2) { defined.add(c2); return m2; });
      }
    } catch { /* 跨域样式表读不到，跳过 */ }
  }
  const used = new Set();
  for (const el of q('[class]')) {
    if (!el.closest('.deck')) continue;
    for (const c2 of el.classList) used.add(c2);
  }
  const undefinedClasses = [...used].filter((c2) => !defined.has(c2)).sort();
  // 文字互相压住：scrollHeight 查不出遮挡，这里按元素矩形相交判断
  const textOverlap = [];
  const leaves = q('.slide *').filter((el) => {
    if (el.children.length || el.closest('.pageno') || !(el.textContent || '').trim()) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const A = leaves[i], B = leaves[j];
      if (A.contains(B) || B.contains(A)) continue;
      const a = A.getBoundingClientRect(), b = B.getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 4 && h > 4 && w * h > 0.25 * Math.min(a.width * a.height, b.width * b.height)) {
        textOverlap.push((A.className || A.tagName) + ' × ' + (B.className || B.tagName) + ' | ' + (A.textContent || '').trim().slice(0, 10));
      }
    }
  }
  // 过程词泄漏：内部文件名、路径、本地地址、Option A/B 这类词不该出现在页面上（代码窗除外）
  const internalWords = [];
  const walk3 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const IW = /(localhost|127\.0\.0\.1|file:\/\/|[A-Za-z]:[\/]|\/tmp\/|index\.html|template\.html|Option\s+[A-D]\b)/;
  for (let n; (n = walk3.nextNode());) {
    const el = n.parentElement;
    if (!el || el.closest('pre,code,svg,script,style')) continue;
    const m2 = n.textContent.match(IW);
    if (m2) internalWords.push((el.className || el.tagName) + ' | ' + m2[0]);
  }
  // 版式序列：按页面里出现的组件粗略判断，查"连续三页同一个版式"
  const layoutOf = (s2) => {
    if (s2.querySelector('.codewin')) return '代码窗';
    if (s2.querySelector('.archsvg')) return '结构图';
    if (s2.querySelector('.stepper')) return '演示';
    if (s2.querySelector('.figframe')) return '原图';
    if (s2.querySelector('.chart-line')) return '趋势';
    if (s2.querySelector('.stack')) return '构成';
    if (s2.querySelector('.flow')) return '链路';
    if (s2.querySelector('.dtable')) return '简表';
    if (s2.querySelectorAll('.grid4 .card').length >= 3) return '读数行';
    if (s2.querySelectorAll('.grid3 .subcard').length >= 4) return '卡阵';
    if (s2.querySelector('.t-stat, .t-readout')) return '读数';
    if (s2.querySelectorAll('.inset').length >= 2) return '清单';
    if (s2.querySelectorAll('.card, .subcard').length >= 2) return '多卡';
    return '文字';
  };
  const layouts = slides.map(layoutOf);
  let run = 1, layoutRun = 1;
  for (let i = 1; i < layouts.length; i++) {
    run = layouts[i] === layouts[i - 1] ? run + 1 : 1;
    if (run > layoutRun) layoutRun = run;
  }
  // 卡片内部底部留白：grid 把卡拉到等高之后，内容早早结束的卡会露一大块空白
  const cardGap = [];
  for (const card of q('.slide .card, .slide .subcard')) {
    const box = card.getBoundingClientRect();
    if (box.height < 80) continue;
    const scale = box.width / card.offsetWidth || 1;
    const padB = parseFloat(getComputedStyle(card).paddingBottom) * scale;
    let bottom = 0;
    for (const el of card.querySelectorAll('*')) {
      if (!el.getClientRects().length) continue;
      const r2 = el.getBoundingClientRect();
      if (r2.width && r2.height) bottom = Math.max(bottom, r2.bottom);
    }
    const gap = box.bottom - padB - bottom;
    if (gap / box.height > 0.35) cardGap.push((card.className || card.tagName) + ' | 底部空 ' + Math.round(gap / box.height * 100) + '%');
  }
  const titles = slides.map((s2) => {
    const h = s2.querySelector('.t-title') || s2.querySelector('h1,h2');
    return h ? h.textContent.trim() : '(无标题)';
  });
  const titlePlaceholder = ['', '标题', 'title', 'Title'].includes(document.title.trim());
  const sampleSlides = slides.map((s2, i) => (s2.hasAttribute('data-sample') ? i + 1 : null)).filter(Boolean);
  return {
    missing: [...miss.values()], checked, accepted, brokenImages,
    undefinedClasses, textOverlap: [...new Set(textOverlap)].slice(0, 6), internalWords: [...new Set(internalWords)].slice(0, 6),
    layouts, layoutRun, cardGap: cardGap.slice(0, 6), titles, titlePlaceholder, sampleSlides,
    overflowN: overflow.length, overflow: overflow.slice(0, 8),
    fonts, fontErrors, slides: slides.length, pagenos, small: small.slice(0, 8), heights, designHeights,
    hiddenSlides, reducedMotion, placeholders, emptyLinks, staleRefs, dupIds, deadAnchors, strayColors,
    cjkSpacing: [...spacing.keys()], longText: [...longText].slice(0, 8),
    templateSample: !!document.querySelector('meta[name="deck-template"]'),
  };
}, extra);

// 窄屏和宽屏下都不该出现横向滚动条：出现就说明页面没有按视口宽缩放。量完把视口恢复成 1680。
const hScroll = [];
for (const w of [390, 1280, 2600]) {
  await page.setViewportSize({ width: w, height: 945 });
  await page.waitForTimeout(250);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 1) hScroll.push(`${w}px 宽时多出 ${Math.round(over)}px`);
}
await page.setViewportSize({ width: 1680, height: 945 });

// 页码连续性：N / M，M == 页数
const pagenosOk = r.slides > 0 && r.pagenos.length === r.slides && r.pagenos.every((t, i) => t === `${i + 1} / ${r.slides}`);
const needFonts = ['Xiaolai', 'Excalifont', 'JetBrains Mono'];
const fontsOk = needFonts.every((f) => r.fonts.includes(f)) && !r.fontErrors.length;
const tall = r.heights.map((h, i) => ({ h, i: i + 1 })).filter((x) => x.h > 1400).map((x) => 'p' + x.i + ':' + x.h + 'px');

console.log(JSON.stringify({ ...r, pagenosOk, errs }, null, 1));
const line = (tag, name, val) => console.log(`[${tag}] ${name}=${JSON.stringify(val)}`);
line(r.missing.length ? 'FAIL' : 'PASS', 'missing', r.missing.map((m) => `${m.ch}(${m.cp}) @${m.where}`));
line(r.brokenImages.length ? 'FAIL' : 'PASS', 'brokenImages', r.brokenImages);
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
line(r.dupIds.length ? 'FAIL' : 'PASS', 'dupIds', r.dupIds);
line(r.deadAnchors.length ? 'FAIL' : 'PASS', 'deadAnchors', [...new Set(r.deadAnchors)]);
line(hScroll.length ? 'FAIL' : 'PASS', 'hScroll', hScroll);
line(r.strayColors.length ? 'WARN' : 'PASS', 'strayColors', r.strayColors.slice(0, 8));
line(r.cjkSpacing.length ? 'WARN' : 'PASS', 'cjkSpacing', r.cjkSpacing.slice(0, 8));
line(r.longText.length ? 'WARN' : 'PASS', 'longText', r.longText);
line(r.undefinedClasses.length ? 'WARN' : 'PASS', 'undefinedClasses', r.undefinedClasses.slice(0, 10));
line(r.textOverlap.length ? 'WARN' : 'PASS', 'textOverlap', r.textOverlap);
line(r.internalWords.length ? 'WARN' : 'PASS', 'internalWords', r.internalWords);
line(r.layoutRun >= 3 ? 'WARN' : 'PASS', 'layoutRun', r.layoutRun);
line(r.cardGap.length ? 'WARN' : 'PASS', 'cardGap', r.cardGap);
line(r.templateSample ? 'WARN' : 'PASS', 'templateSample', r.templateSample);
line(r.titlePlaceholder ? 'WARN' : 'PASS', 'titlePlaceholder', r.titlePlaceholder);
line(r.sampleSlides.length ? 'WARN' : 'PASS', 'sampleSlides', r.sampleSlides);
console.log(`[INFO] slides=${r.slides} glyphsChecked=${r.checked} heights=${r.heights.join(',')}${tall.length ? ' tall(>1400px)=' + tall.join(' ') : ''}`);
console.log(`[INFO] designHeights=${r.designHeights.join(',')}（未缩放的设计稿像素；heights 是 1680 宽视口下按 0.875× 缩放后的值，与单页高度基线同一口径）`);
console.log(`[INFO] layouts=${r.layouts.join(' > ')}`);
console.log(`[INFO] titles=${JSON.stringify(r.titles)}`);
if (r.missing.length) console.log('       缺字修法：改文案后重跑 refresh_cjk_subset.py；源字体确实没有的字符换写法，或写进 <meta name="fallback-ok" content="…"> 表示已人工接受回落');
const fail = r.missing.length || r.brokenImages.length || r.overflowN || r.small.length || errs.length || !pagenosOk || !fontsOk || r.hiddenSlides.length
  || !r.reducedMotion || r.dupIds.length || r.deadAnchors.length || hScroll.length;
console.log(fail ? '验收：FAIL' : '验收：PASS');
await browser.close();
process.exit(fail ? 1 : 0);
