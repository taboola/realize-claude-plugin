#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the pixel-check page download.
 *
 * Run: node skills/diagnose-tracking/scripts/test-fetch-page.js
 *
 * Everything runs against a local HTTP server on 127.0.0.1, so CI needs no
 * outside network. Host names are pointed at it with a stub resolver, which
 * is also how the DNS-rebinding cases are simulated. No dependencies, no
 * framework.
 *
 * Refused-URL fixtures are assembled at runtime, the same rule
 * test-build-bundle.js follows: the directory scanner reads tests as source,
 * and a literal local-file URL or user:pass@ URL reads like the real thing.
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

/** Run a group; an unexpected error is a recorded failure, not a crashed suite. */
async function group(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(`${name}: no unexpected error`, false, e && e.stack ? e.stack : String(e));
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
    const port = server.address().port;
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
      case '/to-ip':
        res.writeHead(302, { location: `http://127.0.0.1:${port}/page` });
        res.end();
        return;
      case '/to-www':
        res.writeHead(301, { location: `http://www.${req.headers.host}/page` });
        res.end();
        return;
      case '/same-host':
        res.writeHead(302, { location: '/page' });
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

/** A resolver stub: answers from `script` call by call, repeating the last. */
function stubResolver(script) {
  const calls = [];
  const resolve = async (host) => {
    calls.push(host);
    const answer = script[Math.min(calls.length - 1, script.length - 1)];
    return answer.map((address) => ({ address }));
  };
  return { resolve, calls };
}

(async () => {
  // -------------------------------------------------------------------------
  // URL vetting — the trust boundary for a user-supplied URL
  // -------------------------------------------------------------------------
  await group('url vetting', () => {
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
  });

  // -------------------------------------------------------------------------
  // private-address guard — a public page must not steer the fetch inward
  // -------------------------------------------------------------------------
  await group('private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
      '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      check(`private: ${ip}`, f.isPrivateAddress(ip) === true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) {
      check(`public: ${ip}`, f.isPrivateAddress(ip) === false);
    }

    // Through the URL parser first, as the fetch sees them: it rewrites the
    // dotted IPv4 tail into hex (`[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`).
    // Review finding: only the dotted form was caught, and the hex form
    // reached a server bound to 127.0.0.1.
    for (const literal of ['[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::ffff:a9fe:a9fe]', '[::ffff:a00:5]',
      '[::7f00:1]', '[64:ff9b::7f00:1]', '[fec0::1]', '[2002:7f00:1::]']) {
      const host = new URL(`http://${literal}/`).hostname;
      check(`private after URL parsing: ${literal} → ${host}`, f.isPrivateAddress(host) === true);
    }
    for (const literal of ['[::ffff:808:808]', '[64:ff9b::808:808]', '[2606:4700::1111]']) {
      const host = new URL(`http://${literal}/`).hostname;
      check(`public after URL parsing: ${literal}`, f.isPrivateAddress(host) === false);
    }

    check('ipv6 expands ::', JSON.stringify(f.parseIPv6('::')) === JSON.stringify([0, 0, 0, 0, 0, 0, 0, 0]));
    check('ipv6 expands a dotted tail', f.parseIPv6('::ffff:1.2.3.4')[7] === 0x0304);
    check('ipv6 rejects bad hextets', f.parseIPv6('g::1') === null);
    check('ipv6 rejects two ::', f.parseIPv6('1::2::3') === null);
    check('unclassifiable address is refused', f.isPrivateAddress('not-an-ip') === true);
  });

  // -------------------------------------------------------------------------
  // same-site comparison
  // -------------------------------------------------------------------------
  await group('same site', () => {
    check('www. is the same site', f.siteHost(new URL('https://www.Shop.com/')) === f.siteHost(new URL('http://shop.com/x')));
    check('other subdomain is not', f.siteHost(new URL('https://checkout.shop.com/')) !== f.siteHost(new URL('https://shop.com/')));
  });

  // -------------------------------------------------------------------------
  // proxy decisions — which path a request takes
  // -------------------------------------------------------------------------
  await group('proxy', () => {
    const u = new URL('https://shop.example.com/');
    check('no proxy vars: none', f.proxyFor(u, {}) === null);
    check('HTTPS_PROXY applies to https', f.proxyFor(u, { HTTPS_PROXY: 'http://p:8080' }) === 'http://p:8080');
    check('https falls back to HTTP_PROXY', f.proxyFor(u, { HTTP_PROXY: 'http://p:3128' }) === 'http://p:3128');
    check('HTTPS_PROXY does not apply to http', f.proxyFor(new URL('http://a.example/'), { HTTPS_PROXY: 'http://p' }) === null);
    check('NO_PROXY exact host', f.proxyFor(u, { HTTPS_PROXY: 'http://p', NO_PROXY: 'shop.example.com' }) === null);
    check('NO_PROXY parent domain', f.proxyFor(u, { HTTPS_PROXY: 'http://p', NO_PROXY: 'localhost,.example.com' }) === null);
    check('NO_PROXY *', f.proxyFor(u, { HTTPS_PROXY: 'http://p', NO_PROXY: '*' }) === null);
    check('NO_PROXY unrelated', f.proxyFor(u, { HTTPS_PROXY: 'http://p', NO_PROXY: 'other.com' }) === 'http://p');

    for (const [v, want] of [['20.20.0', false], ['22.20.0', false], ['22.21.0', true], ['23.11.0', false], ['24.0.0', true]]) {
      check(`env proxy support on Node ${v}`, f.supportsEnvProxy(v) === want);
    }
    const env = { HTTPS_PROXY: 'http://p', NODE_USE_ENV_PROXY: '1' };
    check('env proxy active when switched on', f.envProxyActive(u, env, '24.0.0') === true);
    check('env proxy inactive without NODE_USE_ENV_PROXY', f.envProxyActive(u, { HTTPS_PROXY: 'http://p' }, '24.0.0') === false);
    check('env proxy inactive on old Node', f.envProxyActive(u, env, '20.20.0') === false);
  });

  // -------------------------------------------------------------------------
  // error reporting — the reason, not just "fetch failed"
  // -------------------------------------------------------------------------
  await group('errors', () => {
    const withCause = (code, message) => {
      const e = new TypeError('fetch failed');
      e.cause = Object.assign(new Error(message), { code });
      return e;
    };
    const notFound = withCause('ENOTFOUND', 'getaddrinfo ENOTFOUND nope.example');
    check('network error names its cause', /ENOTFOUND/.test(f.describeError(notFound, {})), f.describeError(notFound, {}));
    const tls = withCause('UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'unable to get local issuer certificate');
    check('certificate error is explained', /certificate/.test(f.describeError(tls, {})));
    const refused = Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:443'), { code: 'ECONNREFUSED' });
    check('http-module error keeps its code', /ECONNREFUSED/.test(f.describeError(refused, {})));

    const proxyEnv = { HTTPS_PROXY: 'http://p:8080' };
    const note = /cannot route through it/;
    check('proxy note: connection error on old Node', note.test(f.describeError(refused, proxyEnv, '20.20.0')));
    check('no proxy note when Node supports env proxy', !note.test(f.describeError(refused, proxyEnv, '24.0.0')));
    check('no proxy note for an unknown host', !note.test(f.describeError(notFound, proxyEnv, '20.20.0')));
    check('no proxy note for a certificate error', !note.test(f.describeError(tls, proxyEnv, '20.20.0')));
    check('no proxy note without a proxy', !note.test(f.describeError(refused, {}, '20.20.0')));
  });

  // -------------------------------------------------------------------------
  // argument parsing — one positional URL, nothing else
  // -------------------------------------------------------------------------
  await group('args', () => {
    check('url taken verbatim', f.parseArgs(['https://shop.example.com/p?price=$12.40&a=1']).url === 'https://shop.example.com/p?price=$12.40&a=1');
    throws('no url', () => f.parseArgs([]), /no URL/);
    throws('two urls', () => f.parseArgs(['http://a.example', 'http://b.example']), /exactly one URL/);
    throws('unknown flag', () => f.parseArgs(['--insecure']), /unknown option/);
    throws('no file-reading option', () => f.parseArgs(['--url-file', 'x']), /unknown option/);
  });

  // -------------------------------------------------------------------------
  // saved-page pruning — only our own, old, real folders
  // -------------------------------------------------------------------------
  await group('pruning', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-page-prune-test-'));
    try {
      const old = path.join(root, `${f.SAVE_PREFIX}old`);
      const fresh = path.join(root, `${f.SAVE_PREFIX}fresh`);
      const foreign = path.join(root, 'someone-elses-old');
      for (const d of [old, fresh, foreign]) fs.mkdirSync(d);
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      fs.utimesSync(old, twoHoursAgo, twoHoursAgo);
      fs.utimesSync(foreign, twoHoursAgo, twoHoursAgo);
      f.pruneOldSaves(root);
      check('old save folder pruned', !fs.existsSync(old));
      check('fresh save folder kept', fs.existsSync(fresh));
      check('unrelated folder kept', fs.existsSync(foreign));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // downloads against a local server
  // -------------------------------------------------------------------------
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  // The test server is on loopback, which the real guard refuses by design;
  // these options let names reach it and loopback count as allowed.
  const local = { resolve: stubResolver([['127.0.0.1']]).resolve, isBlocked: () => false };
  try {
    await group('guard end to end', async () => {
      await rejects('loopback refused by default', f.fetchPage(`${base}/page`), /private or local/);
      // Review finding: this exact URL reached the server before the fix.
      await rejects('IPv4-mapped loopback refused end to end',
        f.fetchPage(`http://[::ffff:127.0.0.1]:${port}/page`), /private or local/);
      await rejects('literal private IP refused on the proxy path too',
        f.fetchPage('http://[::ffff:a9fe:a9fe]/latest/', { env: { HTTP_PROXY: 'http://p:3128', NODE_USE_ENV_PROXY: '1' }, nodeVersion: '24.0.0' }),
        /private or local/);
    });

    await group('DNS rebinding', async () => {
      // A name with a public and a private answer is refused outright.
      const mixed = stubResolver([['93.184.216.34', '10.0.0.5']]);
      await rejects('any private answer refuses the connection',
        f.fetchPage(`http://shop.test:${port}/page`, { resolve: mixed.resolve }), /resolves to a private or local address/);

      // Answers that change between queries: every connection is checked
      // with the answer it actually connects to. 127.0.0.1 stands in for the
      // public address here (the test server must be reachable), and the
      // second answer, at the redirect's new connection, is private.
      const flipping = stubResolver([['127.0.0.1'], ['10.0.0.5']]);
      await rejects('a name that turns private between connections is refused',
        f.fetchPage(`http://rebind.test:${port}/same-host`, { resolve: flipping.resolve, isBlocked: (a) => a !== '127.0.0.1' }),
        /resolves to a private or local address \(10\.0\.0\.5\)/);
      check('resolved once per connection', flipping.calls.length === 2, `calls=${flipping.calls.length}`);

      // The timeout covers DNS too: a lookup that never answers still ends.
      const started = Date.now();
      await rejects('hanging lookup ends at the timeout',
        f.fetchPage(`http://slow.test:${port}/page`, { resolve: () => new Promise(() => {}), timeoutMs: 200 }), /timed out|aborted/i);
      check('timeout honored for DNS', Date.now() - started < 5000, `took ${Date.now() - started} ms`);
    });

    await group('downloads', async () => {
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

      const moved = await f.fetchPage(`http://shop.test:${port}/to-ip`, local);
      check('host change on redirect is flagged', moved.hostChanged === true);

      const www = await f.fetchPage(`http://shop.test:${port}/to-www`, local);
      check('www redirect is not a host change', www.hostChanged === false && www.finalUrl === `http://www.shop.test:${port}/page`, www.finalUrl);

      const big = await f.fetchPage(`${base}/big`, { ...local, maxBytes: 1000 });
      check('size cap truncates', big.body.length === 1000 && big.truncated === true, `len=${big.body.length}`);

      const missing = await f.fetchPage(`${base}/missing`, local);
      check('error status is reported, not hidden', missing.status === 404);
    });

    await group('cli', async () => {
      // End to end through the CLI, the way the skill runs it. The CLI has no
      // loopback bypass, so the local server is exactly what it must refuse.
      const cli = path.join(__dirname, 'fetch-page.js');
      const exitOf = async (args) => {
        try {
          await run(process.execPath, [cli, ...args]);
          return { code: 0, stderr: '' };
        } catch (e) {
          return { code: e.code, stderr: e.stderr };
        }
      };
      const loop = await exitOf([`${base}/page`]);
      check('cli refuses a loopback page with exit 2', loop.code === 2 && /private or local/.test(loop.stderr), JSON.stringify(loop));
      const mapped = await exitOf([`http://[::ffff:127.0.0.1]:${port}/page`]);
      check('cli refuses IPv4-mapped loopback with exit 2', mapped.code === 2, JSON.stringify(mapped));
      const scheme = await exitOf([FILE_URL]);
      check('cli exits 2 on a refused scheme', scheme.code === 2, JSON.stringify(scheme));
    });
  } finally {
    server.close();
  }

  // -------------------------------------------------------------------------
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const x of failures) console.log(`  FAIL ${x}`);
    process.exit(1);
  }
})().catch((e) => {
  console.log(`test harness crashed: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
