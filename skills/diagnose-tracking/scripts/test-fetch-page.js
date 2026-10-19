#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the pixel-check page download.
 *
 * Run: node skills/diagnose-tracking/scripts/test-fetch-page.js
 *
 * Everything runs against a local HTTP server on 127.0.0.1, so CI needs no
 * outside network. No dependencies, no framework.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

// Async on purpose: the test server runs in this process, so a sync child
// call would block it from answering and the CLI would time out.
const run = promisify(execFile);

const f = require('./fetch-page.js');

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) passed++;
  else failures.push(detail ? `${name}\n      ${detail}` : name);
}

async function rejects(name, promise, pattern) {
  try {
    await promise;
    check(name, false, 'expected a rejection, got success');
  } catch (e) {
    check(name, pattern.test(e.message), `got ${JSON.stringify(e.message)}`);
  }
}

function throws(name, fn, pattern) {
  try {
    fn();
    check(name, false, 'expected a throw');
  } catch (e) {
    check(name, pattern.test(e.message), `got ${JSON.stringify(e.message)}`);
  }
}

const PIXEL_PAGE =
  '<html><head><script>window._tfa = window._tfa || [];' +
  "_tfa.push({notify: 'event', name: 'page_view', id: 1234567});</script>" +
  '<script src="//cdn.taboola.com/libtrc/unip/1234567/tfa.js" id="tb_tfa_script"></script>' +
  '</head><body>shop</body></html>';

function startServer() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const hops = Number(u.searchParams.get('n') || 0);
    switch (u.pathname) {
      case '/page':
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(PIXEL_PAGE);
        return;
      case '/ua':
        res.writeHead(200);
        res.end(`ua=${req.headers['user-agent']} cookie=${req.headers.cookie || ''}`);
        return;
      case '/chain':
        if (hops <= 0) {
          res.writeHead(200);
          res.end('end of chain');
        } else {
          res.writeHead(302, { location: `/chain?n=${hops - 1}` });
          res.end();
        }
        return;
      case '/to-file':
        res.writeHead(302, { location: 'file:///etc/passwd' });
        res.end();
        return;
      case '/to-localhost-alias':
        res.writeHead(302, { location: `http://localhost:${server.address().port}/page` });
        res.end();
        return;
      case '/big':
        res.writeHead(200);
        res.end('x'.repeat(2048));
        return;
      case '/missing':
        res.writeHead(404);
        res.end('not here');
        return;
      default:
        res.writeHead(500);
        res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  // -------------------------------------------------------------------------
  // URL vetting — the trust boundary for a user-supplied URL
  // -------------------------------------------------------------------------
  check('https accepted', f.vetUrl('https://shop.example.com/p').hostname === 'shop.example.com');
  check('surrounding whitespace tolerated', f.vetUrl('  http://a.example/  ').hostname === 'a.example');
  throws('file: refused', () => f.vetUrl('file:///etc/passwd'), /only http and https/);
  throws('ftp: refused', () => f.vetUrl('ftp://a.example/x'), /only http and https/);
  throws('javascript: refused', () => f.vetUrl('javascript:alert(1)'), /only http and https/);
  throws('embedded credentials refused', () => f.vetUrl('https://u:p@a.example/'), /embedded credentials/);
  throws('garbage refused', () => f.vetUrl('not a url'), /not a valid URL/);

  // -------------------------------------------------------------------------
  // argument parsing — URL by file, so the shell never sees it
  // -------------------------------------------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-page-test-'));
  const urlFile = path.join(tmp, 'url.txt');
  // `$` and `&` are exactly what a double-quoted shell argument would mangle.
  fs.writeFileSync(urlFile, 'https://shop.example.com/p?price=$12.40&a=1\n');
  check('url read from file verbatim', f.parseArgs(['--url-file', urlFile]).url === 'https://shop.example.com/p?price=$12.40&a=1');
  throws('no url', () => f.parseArgs([]), /no URL/);
  throws('two urls', () => f.parseArgs(['http://a.example', 'http://b.example']), /exactly one URL/);
  throws('unknown flag', () => f.parseArgs(['--insecure']), /unknown option/);
  throws('unreadable url file', () => f.parseArgs(['--url-file', path.join(tmp, 'nope')]), /cannot read/);

  // -------------------------------------------------------------------------
  // downloads against a local server
  // -------------------------------------------------------------------------
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await f.fetchPage(`${base}/page`);
    check('raw HTML keeps script tags', r.body.toString().includes('libtrc/unip/1234567/tfa.js'));
    check('status reported', r.status === 200);
    check('same host is not flagged', r.hostChanged === false);
    check('not truncated', r.truncated === false);

    const ua = (await f.fetchPage(`${base}/ua`)).body.toString();
    check('identifies itself honestly', ua.includes('RealizePluginPixelCheck'), ua);
    check('sends no cookies', ua.endsWith('cookie='), ua);

    const ok = await f.fetchPage(`${base}/chain?n=${f.MAX_REDIRECTS}`);
    check('follows up to the redirect cap', ok.body.toString() === 'end of chain');
    check('final url is the last hop', ok.finalUrl.endsWith('/chain?n=0'), ok.finalUrl);
    await rejects('stops past the redirect cap', f.fetchPage(`${base}/chain?n=${f.MAX_REDIRECTS + 1}`), /more than 3 redirects/);
    await rejects('redirect to file: refused', f.fetchPage(`${base}/to-file`), /only http and https/);

    const moved = await f.fetchPage(`${base}/to-localhost-alias`);
    check('host change on redirect is flagged', moved.hostChanged === true);

    const big = await f.fetchPage(`${base}/big`, { maxBytes: 1000 });
    check('size cap truncates', big.body.length === 1000 && big.truncated === true, `len=${big.body.length}`);

    const missing = await f.fetchPage(`${base}/missing`);
    check('error status is reported, not hidden', missing.status === 404);

    // End to end through the CLI, the way the skill runs it.
    fs.writeFileSync(urlFile, `${base}/page`);
    const { stdout: out } = await run(process.execPath, [path.join(__dirname, 'fetch-page.js'), '--url-file', urlFile]);
    const saved = /saved_to: (.+)/.exec(out);
    check('cli prints status', /^status: 200$/m.test(out), out);
    check('cli prints host_changed', /^host_changed: no$/m.test(out), out);
    check('cli saves the page', saved && fs.readFileSync(saved[1], 'utf8') === PIXEL_PAGE, out);
    if (saved) fs.rmSync(path.dirname(saved[1]), { recursive: true, force: true });

    let exitCode = 0;
    try {
      await run(process.execPath, [path.join(__dirname, 'fetch-page.js'), 'file:///etc/passwd']);
    } catch (e) {
      exitCode = e.code;
    }
    check('cli exits 2 on a refused url', exitCode === 2, `exit ${exitCode}`);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // -------------------------------------------------------------------------
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const x of failures) console.log(`  FAIL ${x}`);
    process.exit(1);
  }
})();
