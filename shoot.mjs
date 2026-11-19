// Vice Cover Studio — screenshot runner.
//
// Serves app/ on a scratch port, opens every scene from shots.json in
// headless Chromium, waits until the app reports itself ready, and saves a
// JPEG per scene into screenshots/. The run fails on any console error, page
// error, failed request, or request that leaves localhost.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/makefun/tools-browser/node_modules/playwright');

const repo = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8471;
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));

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
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
      const problems = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
      });
      page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
      page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()}`));
      page.on('request', (req) => {
        const host = new URL(req.url()).hostname;
        if (host !== '127.0.0.1' && host !== 'localhost') {
          problems.push(`off-machine request: ${req.url()}`);
        }
      });
      const url = `http://127.0.0.1:${PORT}/${shot.query}`;
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 20000 });
      await page.waitForTimeout(400);
      const out = join(repo, 'screenshots', shot.name);
      await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
      const size = statSync(out).size;
      console.log(`${shot.name}: ${shot.w}x${shot.h} ${Math.round(size / 1024)} KiB ${problems.length ? 'PROBLEMS: ' + problems.join(' | ') : 'ok'}`);
      if (problems.length) failures += problems.length;
      await page.close();
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}

if (failures) {
  console.error(`screenshot run failed with ${failures} problem(s)`);
  process.exit(1);
}
console.log('all shots taken cleanly');
