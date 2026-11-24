// 逐页截图（布局目检）：探针查不出"文字被撕成乱列 / 链接浮空 / 层次倒挂"，只能看图。
//
// 用法（在装了 playwright 的目录里运行）：
//   node <skill>/scripts/shot-deck.mjs <deck 的 URL 或本地 index.html 路径> <页码，逗号分隔，或 all> [输出目录]
//   例：node shot-deck.mjs http://127.0.0.1:8000/index.html 5,9
// 不给输出目录时，落在 <系统临时目录>/deck-shots/<deck 名>/<时间戳>/：不同 deck、改前改后互不覆盖。
// 截图后用读图工具逐张看。
// 截图前会给所有 .slide 加 .on：滚入动画默认 opacity:0，不点亮截到的是空页。
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openPage, toUrl } from './_browser.mjs';

const HELP = `用法：node shot-deck.mjs <deck-url 或 index.html 路径> <页码,逗号分隔 | all> [输出目录]
  例：node shot-deck.mjs http://127.0.0.1:8000/index.html 5,9
环境：在装了 playwright 的目录里运行；浏览器默认用 playwright 自带的，
      可用 CHROME_EXE 指向本机 Chrome / Edge。`;
const [target, pages, dirArg] = process.argv.slice(2);
if (/-h|--help/.test(target || '')) { console.log(HELP); process.exit(0); }
if (!target || !pages) { console.log(HELP); process.exit(2); }

const url = toUrl(target);

const pad = (n) => String(n).padStart(2, '0');
function defaultOutDir() {
  const name = /^https?:\/\//.test(target)
    ? new URL(target).hostname
    : path.basename(path.dirname(path.resolve(target)));
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return path.join(tmpdir(), 'deck-shots', name.replace(/[^\w.-]/g, '_'), stamp);
}
const outDir = dirArg || defaultOutDir();
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const { browser, page } = await openPage({ width: 1920, height: 1200 });
await page.goto(url);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelectorAll('.slide').forEach((s) => s.classList.add('on')));
await page.waitForTimeout(600);
const handles = await page.$$('.slide');
const wanted = pages === 'all'
  ? handles.map((_, i) => i + 1)
  : pages.split(',').map(Number);
const bad = wanted.filter((n) => !Number.isInteger(n) || n < 1 || n > handles.length);
if (bad.length) {
  console.error(`页码无效：${bad.join('、')}（这份 deck 共 ${handles.length} 页，页码从 1 开始）`);
  await browser.close();
  process.exit(2);
}

let missing = 0;
for (const n of wanted) {
  const el = handles[n - 1];
  if (!el) { console.error(`no slide ${n}`); missing += 1; continue; }
  const out = path.join(outDir, `deck-page-${n}.png`);
  await el.screenshot({ path: out });
  console.log('shot', out);
}
await browser.close();
if (missing) process.exit(1);
