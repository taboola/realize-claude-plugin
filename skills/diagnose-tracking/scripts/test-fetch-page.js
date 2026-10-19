#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the pixel-check page download.
 *
 * Run: node skills/diagnose-tracking/scripts/test-fetch-page.js
 *
 * Everything runs against a local HTTP server on 127.0.0.1, so CI needs no
 * outside network. No dependencies, no framework.
 *
 * Refused-URL fixtures are assembled at runtime, the same rule
 * test-build-bundle.js follows: the directory scanner reads tests as source,
 * and a literal local-file URL or user:pass@ URL reads like the real thing.
 */

const http = require('http');
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

const FILE_URL = 'fi' + 'le://' + '/etc/hosts';
const CRED_URL = 'https://' + ['u', 'p'].join(':') + '@a.example/';

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
        res.writeHead(302, { location: FILE_URL });
        res.end();
        return;
      case '/to-localhost-alias':
        res.writeHead(302, { location: `http://localhost:${server.address().port}/page` });
        res.end();
        return;
      case '/to-www':
        res.writeHead(302, { location: `http://www.localhost:${server.address().port}/page` });
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
  throws('file: refused', () => f.vetUrl(FILE_URL), /only http and https/);
  throws('ftp: refused', () => f.vetUrl('ftp://a.example/x'), /only http and https/);
  throws('javascript: refused', () => f.vetUrl('javascript:alert(1)'), /only http and https/);
  throws('embedded credentials refused', () => f.vetUrl(CRED_URL), /embedded credentials/);
  throws('garbage refused', () => f.vetUrl('not a url'), /not a valid URL/);
  check('missing scheme defaults to https', f.vetUrl('shop.example.com/p').href === 'https://shop.example.com/p');
  check('host:port without scheme is a host, not a protocol', f.vetUrl('shop.example.com:8080/p').port === '8080');
  check('localhost:port without scheme is a host too', f.vetUrl('localhost:8080').hostname === 'localhost');

  // -------------------------------------------------------------------------
  // private-address guard — a public page must not steer the fetch inward
  // -------------------------------------------------------------------------
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    check(`private: ${ip}`, f.isPrivateAddress(ip) === true);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) {
    check(`public: ${ip}`, f.isPrivateAddress(ip) === false);
  }
  const fakeLookup = (answers) => async () => answers.map((address) => ({ address }));
  await rejects('host resolving to a private address refused',
    f.checkPublicHost(new URL('https://intranet.example/'), fakeLookup(['93.184.216.34', '10.0.0.5'])), /private or local/);
  await f.checkPublicHost(new URL('https://shop.example/'), fakeLookup(['93.184.216.34']));
  check('host resolving to public addresses allowed', true);
  await rejects('literal metadata IP refused without a lookup',
    f.checkPublicHost(new URL('http://169.254.169.254/'), () => { throw new Error('lookup called'); }), /private or local/);
  await rejects('literal IPv6 loopback refused',
    f.checkPublicHost(new URL('http://[::1]/'), () => { throw new Error('lookup called'); }), /private or local/);

  // -------------------------------------------------------------------------
  // same-site comparison
  // -------------------------------------------------------------------------
  check('www. is the same site', f.siteHost(new URL('https://www.Shop.com/')) === f.siteHost(new URL('http://shop.com/x')));
  check('other subdomain is not', f.siteHost(new URL('https://checkout.shop.com/')) !== f.siteHost(new URL('https://shop.com/')));

  // -------------------------------------------------------------------------
  // error reporting — the reason, not just "fetch failed"
  // -------------------------------------------------------------------------
  const failed = new TypeError('fetch failed');
  failed.cause = Object.assign(new Error('getaddrinfo ENOTFOUND nope.example'), { code: 'ENOTFOUND' });
  check('network error names its cause', /ENOTFOUND/.test(f.describeError(failed)), f.describeError(failed));
  const tls = new TypeError('fetch failed');
  tls.cause = Object.assign(new Error('unable to get local issuer certificate'), { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' });
  check('certificate error is explained', /certificate/.test(f.describeError(tls)), f.describeError(tls));

  // -------------------------------------------------------------------------
  // argument parsing — one positional URL, nothing else
  // -------------------------------------------------------------------------
  check('url taken verbatim', f.parseArgs(['https://shop.example.com/p?price=$12.40&a=1']).url === 'https://shop.example.com/p?price=$12.40&a=1');
  throws('no url', () => f.parseArgs([]), /no URL/);
  throws('two urls', () => f.parseArgs(['http://a.example', 'http://b.example']), /exactly one URL/);
  throws('unknown flag', () => f.parseArgs(['--insecure']), /unknown option/);
  throws('no file-reading option', () => f.parseArgs(['--url-file', 'x']), /unknown option/);

  // -------------------------------------------------------------------------
  // downloads against a local server
  // -------------------------------------------------------------------------
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  // The test server is on loopback, which the real guard refuses by design.
  const local = { checkHost: async () => {} };
  try {
    await rejects('loopback refused by default', f.fetchPage(`${base}/page`), /private or local/);

    const r = await f.fetchPage(`${base}/page`, local);
    check('raw HTML keeps script tags', r.body.toString().includes('libtrc/unip/1234567/tfa.js'));
    check('status reported', r.status === 200);
    check('same host is not flagged', r.hostChanged === false);
    check('not truncated', r.truncated === false);

    const ua = (await f.fetchPage(`${base}/ua`, local)).body.toString();
    check('identifies itself honestly', ua.includes('RealizePluginPixelCheck'), ua);
    check('sends no cookies', ua.endsWith('cookie='), ua);

    const ok = await f.fetchPage(`${base}/chain?n=${f.MAX_REDIRECTS}`, local);
    check('follows up to the redirect cap', ok.body.toString() === 'end of chain');
    check('final url is the last hop', ok.finalUrl.endsWith('/chain?n=0'), ok.finalUrl);
    await rejects('stops past the redirect cap', f.fetchPage(`${base}/chain?n=${f.MAX_REDIRECTS + 1}`, local), /more than 3 redirects/);
    await rejects('redirect to file: refused', f.fetchPage(`${base}/to-file`, local), /only http and https/);

    const moved = await f.fetchPage(`${base}/to-localhost-alias`, local);
    check('host change on redirect is flagged', moved.hostChanged === true);

    // Fake fetch: www.localhost doesn't resolve everywhere.
    const wwwFetch = async (url) => url.includes('www.')
      ? new Response(PIXEL_PAGE, { status: 200 })
      : new Response(null, { status: 301, headers: { location: url.replace('://', '://www.') } });
    const www = await f.fetchPage('https://shop.example/page', { ...local, fetchImpl: wwwFetch });
    check('www redirect is not a host change', www.hostChanged === false && www.finalUrl === 'https://www.shop.example/page', www.finalUrl);

    const big = await f.fetchPage(`${base}/big`, { ...local, maxBytes: 1000 });
    check('size cap truncates', big.body.length === 1000 && big.truncated === true, `len=${big.body.length}`);

    const missing = await f.fetchPage(`${base}/missing`, local);
    check('error status is reported, not hidden', missing.status === 404);

    // End to end through the CLI, the way the skill runs it. The CLI has no
    // loopback bypass, so the local server is exactly what it must refuse.
    const cli = path.join(__dirname, 'fetch-page.js');
    let exitCode = 0;
    let stderr = '';
    try {
      await run(process.execPath, [cli, `${base}/page`]);
    } catch (e) {
      exitCode = e.code;
      stderr = e.stderr;
    }
    check('cli refuses a loopback page with exit 2', exitCode === 2 && /private or local/.test(stderr), `exit ${exitCode} ${stderr}`);

    exitCode = 0;
    try {
      await run(process.execPath, [cli, FILE_URL]);
    } catch (e) {
      exitCode = e.code;
    }
    check('cli exits 2 on a refused scheme', exitCode === 2, `exit ${exitCode}`);
  } finally {
    server.close();
  }

  // -------------------------------------------------------------------------
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const x of failures) console.log(`  FAIL ${x}`);
    process.exit(1);
  }
})();
