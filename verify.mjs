// Vice Cover Studio — headless export check.
//
// Opens the editor, waits for the default sample photo to load, then calls
// the app's own export for each of the three post sizes and reports the PNG
// byte size of each. Also fails the run on any console error, page error, or
// request that leaves localhost.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/makefun/tools-browser/node_modules/playwright');

const repo = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8472;

function waitForServer(url, tries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      fetch(url).then((r) => (r.ok ? resolve() : retry())).catch(retry);
      function retry() {
        if (left <= 0) return reject(new Error(`server never came up at ${url}`));
        setTimeout(() => attempt(left - 1), 250);
      }
    };
    attempt(tries);
  });
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repo, stdio: 'pipe' });
let failures = 0;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const problems = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
    page.on('request', (req) => {
      const host = new URL(req.url()).hostname;
      if (host !== '127.0.0.1' && host !== 'localhost') problems.push(`off-machine request: ${req.url()}`);
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => window.__vice && window.__vice.state.panels[0].image !== null,
      null,
      { timeout: 20000 },
    );
    await page.waitForTimeout(300);
    for (const [w, h] of [[1080, 1080], [1080, 1350], [1920, 1080]]) {
      const bytes = await page.evaluate(async ([ew, eh]) => {
        const blob = await window.__vice.exportPng(ew, eh);
        const buf = await blob.arrayBuffer();
        // Sanity: the blob really is a PNG at the requested size.
        const view = new Uint8Array(buf);
        const isPng = view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47;
        const pw = (view[16] << 24) | (view[17] << 16) | (view[18] << 8) | view[19];
        const ph = (view[20] << 24) | (view[21] << 16) | (view[22] << 8) | view[23];
        return { bytes: buf.byteLength, isPng, pw, ph };
      }, [w, h]);
      console.log(`export ${w}x${h}: ${bytes.bytes} bytes, png=${bytes.isPng}, dims=${bytes.pw}x${bytes.ph}`);
      if (!bytes.isPng || bytes.pw !== w || bytes.ph !== h || bytes.bytes < 10000) failures += 1;
    }
    if (problems.length) {
      console.error('problems: ' + problems.join(' | '));
      failures += problems.length;
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}

if (failures) {
  console.error(`export check failed with ${failures} problem(s)`);
  process.exit(1);
}
console.log('all three exports verified');
