// 程序化探针：缺字 / 溢出 / 字号下限 / 页码连续 / 资源加载失败。
// 用法（从含 playwright 依赖的项目根跑）：
//   node <skill>/scripts/verify-deck.mjs <deck-url> [probe字符串]
// probe 字符串 = 本轮新文案里挑的、旧子集大概率没有的字；缺省给一组常用探针字。
// 依赖解析：按 CWD 找 playwright（脚本放 /tmp 或 skill 目录时 import 'playwright' 解析不到）。
// 浏览器：CHROME_EXE 覆盖；缺省扫 /root/.cache/ms-playwright 下现存 chromium 二进制。
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const pw = require('playwright');
const { chromium } = pw;

function findChrome() {
  if (process.env.CHROME_EXE && existsSync(process.env.CHROME_EXE)) return process.env.CHROME_EXE;
  const root = '/root/.cache/ms-playwright';
  if (!existsSync(root)) return undefined;
  for (const d of readdirSync(root).sort().reverse()) {
    for (const sub of ['chrome-linux-arm64', 'chrome-linux', 'chrome-linux-headless-shell']) {
      const p = path.join(root, d, sub, 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const url = process.argv[2];
if (!url) { console.error('usage: verify-deck.mjs <deck-url> [probe字符串]'); process.exit(2); }
const probe = process.argv[3] || '总账归因复核锚冻结拒注溯源枚举';

const b = await chromium.launch({ executablePath: findChrome() });
const p = await b.newPage({ viewport: { width: 1680, height: 945 } });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('requestfailed', (r) => errs.push('reqfail: ' + r.url().slice(0, 90)));
await p.goto(url);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1800);
const r = await p.evaluate((probe) => {
  const missing = [...new Set([...probe].filter((c) => !document.fonts.check('20px Xiaolai', c)))];
  const overflow = [...document.querySelectorAll('.slide *')]
    .filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto')
    .map((el) => el.className + '|' + (el.textContent || '').trim().slice(0, 24));
  const fonts = [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))];
  const slides = document.querySelectorAll('.slide').length;
  const pagenos = [...document.querySelectorAll('.pageno')].map((e) => e.textContent.trim());
  const small = [...document.querySelectorAll('.slide *')].filter((el) => {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return el.children.length === 0 && (el.textContent || '').trim() && fs < 19;
  }).map((el) => el.className + ':' + getComputedStyle(el).fontSize);
  const heights = [...document.querySelectorAll('.slide')].map((s) => Math.round(s.getBoundingClientRect().height));
  return { missing, overflowN: overflow.length, overflow: overflow.slice(0, 8), fonts, slides, pagenos, small: small.slice(0, 8), heights };
}, probe);
// 页码连续性自检：N / M 且 M == slides
const okPageno = r.pagenos.length === r.slides &&
  r.pagenos.every((t, i) => t === `${i + 1} / ${r.slides}`);
console.log(JSON.stringify({ ...r, pagenosOk: okPageno, errs }, null, 1));
console.log('验收：missing=[] && overflowN=0 && small=[] && errs=[] && pagenosOk=true && fonts 含 Xiaolai/Excalifont/JetBrains Mono');
await b.close();
