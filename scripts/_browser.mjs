// 两个探针脚本共用：定位 playwright 与 chromium，并把"URL 或本地路径"统一成可打开的地址。
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// playwright 按 CWD 解析：脚本放在 skill 目录时，按脚本所在目录找不到依赖（实测坑）
export function loadPlaywright() {
  try {
    return createRequire(path.join(process.cwd(), 'noop.js'))('playwright');
  } catch {
    console.error('[env] 当前目录解析不到 playwright。请在装了 playwright 的目录里运行，例如：');
    console.error('       npm init -y && npm i playwright && npx playwright install chromium');
    console.error('       或设置 CHROME_EXE 指向本机已有的 Chrome / Edge 可执行文件。');
    process.exit(3);
  }
}

// playwright 的浏览器缓存目录：Linux ~/.cache、macOS ~/Library/Caches、Windows %LOCALAPPDATA%
function registryDirs() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return [process.env.PLAYWRIGHT_BROWSERS_PATH];
  }
  const home = homedir();
  if (process.platform === 'win32') {
    return [path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ms-playwright')];
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Caches', 'ms-playwright')];
  return [path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'ms-playwright')];
}

const EXE = /^(chrome|headless_shell|chrome-headless-shell)(\.exe)?$/i;
const MAC_APP = /\.app[\\/]Contents[\\/]MacOS[\\/]/;

// 在缓存里找任意一个可用的 chromium：版本号大的优先，完整版优先于 headless shell
function scanChrome() {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && (EXE.test(e.name) || (process.platform === 'darwin' && MAC_APP.test(p) && /chrom|headless/i.test(e.name)))) {
        found.push(p);
      }
    }
  };
  for (const d of registryDirs()) if (existsSync(d)) walk(d, 0);
  const rev = (p) => { const m = p.match(/-(\d+)[\\/]/); return m ? +m[1] : 0; };
  const shell = (p) => (/headless/i.test(p) ? 1 : 0);
  return found.sort((a, b) => rev(b) - rev(a) || shell(a) - shell(b))[0];
}

// 返回 executablePath；undefined 表示用 playwright 自带的那一份（它存在时永远优先）
export function findChromeExe(chromium) {
  if (process.env.CHROME_EXE) {
    if (existsSync(process.env.CHROME_EXE)) return process.env.CHROME_EXE;
    console.error(`[env] CHROME_EXE=${process.env.CHROME_EXE} 不存在，忽略`);
  }
  let own;
  try { own = chromium.executablePath(); } catch { own = undefined; }
  if (own && existsSync(own)) return undefined;
  // 版本错配兜底：仓库依赖想要的 build 缓存里没有时，借用缓存里现成的其它版本
  const alt = scanChrome();
  if (alt) console.error('[env] playwright 期望的浏览器不存在，改用缓存里的：' + alt);
  return alt;
}

export async function openPage(viewport) {
  const { chromium } = loadPlaywright();
  const exe = findChromeExe(chromium);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: exe });
  } catch (e) {
    console.error('[env] 浏览器启动失败：' + String(e.message).split('\n')[0]);
    console.error('       修复：npx playwright install chromium，或设置 CHROME_EXE 指向本机 Chrome / Edge');
    process.exit(3);
  }
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  return { browser, page };
}

// http(s) 地址原样返回；其它输入当本地文件路径处理
export function toUrl(target) {
  if (/^https?:\/\//.test(target)) return target;
  const file = path.resolve(target);
  if (!existsSync(file)) {
    console.error('[env] 找不到文件：' + file);
    process.exit(2);
  }
  return pathToFileURL(file).href;
}
