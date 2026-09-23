// 逐页 element 截图（布局目检用——探针查不出"文字被撕成乱列"这类布局问题）。
// 用法（从含 playwright 依赖的项目根跑）：
//   node <skill>/scripts/shot-deck.mjs <deck-url> <1-based页码,逗号分隔> [输出目录,默认/tmp]
// 关键：截图前给所有 .slide 加 .on——滚入动画默认 opacity:0，不点亮会截到空页。
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

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

const [url, pagesArg, outDir = '/tmp'] = process.argv.slice(2);
if (!url || !pagesArg) { console.error('usage: shot-deck.mjs <deck-url> <页码,逗号> [输出目录]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const b = await chromium.launch({ executablePath: findChrome() });
const p = await b.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
await p.goto(url);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelectorAll('.slide').forEach((s) => s.classList.add('on')));
await p.waitForTimeout(600);
const handles = await p.$$('.slide');
for (const n of pagesArg.split(',').map(Number)) {
  const el = handles[n - 1];
  if (!el) { console.error(`no slide ${n}`); continue; }
  const out = path.join(outDir, `deck-page-${n}.png`);
  await el.screenshot({ path: out });
  console.log('shot', out);
}
await b.close();
