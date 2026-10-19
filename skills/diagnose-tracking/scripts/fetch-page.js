#!/usr/bin/env node
'use strict';

/**
 * Realize Plugin — raw page download for the pixel static check.
 *
 * Downloads the raw HTML of the ONE page the user asked to have diagnosed and
 * saves it to a fresh temp file, so the skill can Grep it for pixel markers.
 * The file is only ever read as text. Nothing downloaded is executed.
 *
 * Usage:
 *   node fetch-page.js '<url>'
 *
 * Pass the URL in single quotes: nothing inside them is expanded by the shell.
 * A URL that itself contains a single quote is passed with it encoded as %27.
 * There is deliberately no --url-file: the URL belongs on the command line,
 * where the user's permission prompt shows it (this script is not
 * pre-approved), and a file-reading option would let the script read and echo
 * any local file.
 *
 * Prints `key: value` lines: status, final_url, host_changed, bytes,
 * truncated, saved_to. Exit 0 when a response was received (any status — the
 * caller decides whether to trust it), 1 on a network failure, 2 on a refused
 * or invalid URL.
 *
 * Why a script and not a one-line download command (DEV-240750): the trust
 * boundary lives in code, not in flags the model must remember — http/https
 * only on every hop, no private/loopback/link-local addresses on any hop, at
 * most MAX_REDIRECTS redirects, a hard timeout, a size cap, no credentials in
 * the URL, no cookies sent.
 *
 * The private-address check runs inside the connection's own DNS lookup, so
 * the address that was checked is the address connected to — a name that
 * answers "public" once and "127.0.0.1" the next time (DNS rebinding) is
 * caught. That needs a per-connection `lookup` hook: Node's built-in fetch
 * only offers one through undici, which Node does not expose without a
 * dependency, so direct connections use the http/https modules instead.
 *
 * Why not WebFetch: it converts pages to readable text and strips every
 * <script> tag, so it can never see a pixel install.
 *
 * Requires Node 18+ on PATH. Claude Code's native and desktop installs do not
 * provide one; when `node` is missing the skill skips the static check.
 * No dependencies.
 */

const dns = require('dns');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const USER_AGENT = 'Mozilla/5.0 (compatible; RealizePluginPixelCheck/1.0)';
const HEADERS = { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.8' };
// Each run saves into its own fresh temp folder; folders from earlier runs are
// pruned once they are an hour old, so a diagnosis leaves no pile behind.
const SAVE_PREFIX = 'realize-pixel-';
const KEEP_SAVED_MS = 60 * 60 * 1000;
// Errors that mean "couldn't reach it" rather than "no such host" or "bad
// certificate" — the only ones a missing proxy can explain.
const CONNECTION_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT',
]);

class InputError extends Error {}

/**
 * Parse and vet a user-supplied URL. Throws InputError on anything unsafe.
 * A bare `shop.com/p` gets https:// — users paste addresses without a scheme.
 */
function vetUrl(raw, base) {
  let u;
  try {
    if (base) {
      u = new URL(raw, base);
    } else {
      const text = String(raw).trim();
      u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^[a-z]+:[^0-9]/i.test(text) ? text : `https://${text}`);
    }
  } catch {
    throw new InputError(`not a valid URL: ${JSON.stringify(String(raw).slice(0, 200))}`);
  }
  if (!ALLOWED_PROTOCOLS.has(u.protocol)) {
    throw new InputError(`only http and https are allowed, got ${u.protocol}`);
  }
  if (u.username || u.password) {
    throw new InputError('URLs with embedded credentials (user:pass@host) are refused');
  }
  return u;
}

function isPrivateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast and reserved
  );
}

/**
 * Expand an IPv6 address to its 8 16-bit words, or null if it isn't one.
 * Handles `::` and a dotted IPv4 tail (`::ffff:1.2.3.4`).
 */
function parseIPv6(text) {
  let s = String(text).toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  let tail = [];
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    if (!net.isIPv4(dotted[2])) return null;
    const o = dotted[2].split('.').map(Number);
    tail = [(o[0] << 8) | o[1], (o[2] << 8) | o[3]];
    s = dotted[1].endsWith('::') ? dotted[1] : dotted[1].slice(0, -1);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const words = (part) => (part === '' ? [] : part.split(':').map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)));
  const head = words(halves[0]);
  const rest = halves.length === 2 ? words(halves[1]) : [];
  const used = head.length + rest.length + tail.length;
  let all;
  if (halves.length === 2) {
    if (used > 7) return null;
    all = [...head, ...new Array(8 - used).fill(0), ...rest, ...tail];
  } else {
    all = [...head, ...tail];
  }
  if (all.length !== 8 || all.some(Number.isNaN)) return null;
  return all;
}

/**
 * True for addresses a public web page must never send us to. IPv6 forms
 * that carry an IPv4 address inside them are judged by that IPv4 address:
 * the URL parser rewrites `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, so a
 * check that only knows the dotted form is bypassed.
 */
function isPrivateAddress(ip) {
  const host = String(ip).replace(/^\[|\]$/g, '').split('%')[0];
  if (net.isIPv4(host)) return isPrivateV4(host);
  const w = parseIPv6(host);
  if (!w) return true; // not an address we can classify: refuse rather than guess
  const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const zero = (from, to) => w.slice(from, to).every((x) => x === 0);
  if (zero(0, 8)) return true; // ::
  if (zero(0, 7) && w[7] === 1) return true; // ::1
  if (zero(0, 5) && w[5] === 0xffff) return isPrivateV4(v4(w[6], w[7])); // IPv4-mapped ::ffff:0:0/96
  if (zero(0, 6)) return isPrivateV4(v4(w[6], w[7])); // IPv4-compatible ::/96
  if (w[0] === 0x64 && w[1] === 0xff9b && zero(2, 6)) return isPrivateV4(v4(w[6], w[7])); // NAT64 64:ff9b::/96
  if (w[0] === 0x2002) return isPrivateV4(v4(w[1], w[2])); // 6to4 2002::/16
  return (
    (w[0] & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (w[0] & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (w[0] & 0xffc0) === 0xfec0 || // site-local fec0::/10 (deprecated, still routed internally)
    (w[0] & 0xff00) === 0xff00 // multicast
  );
}

/** A literal-IP host is checked before connecting; no DNS lookup happens for it. */
function checkLiteralHost(u, isBlocked = isPrivateAddress) {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlocked(host)) {
    throw new InputError(`refused: ${u.hostname} is a private or local address`);
  }
}

const systemResolve = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

/** Run a lookup, but give up when the request's timeout fires. */
function resolveWithin(resolve, hostname, signal) {
  return new Promise((ok, fail) => {
    if (signal.aborted) return fail(signal.reason);
    const onAbort = () => fail(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(() => resolve(hostname))
      .then(ok, fail)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * A `lookup` for http/https.request that refuses the connection if ANY
 * address the name resolves to is private, and otherwise hands back only
 * the addresses it just checked — so the socket connects to a vetted address.
 * `resolve` is injectable for tests.
 */
function makeLookup(resolve, isBlocked, signal) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    resolveWithin(resolve, hostname, signal).then((found) => {
      const addrs = found.map((a) => ({ address: a.address, family: a.family || net.isIP(a.address) }));
      const bad = addrs.find((a) => isBlocked(a.address));
      if (bad) {
        cb(new InputError(`refused: ${hostname} resolves to a private or local address (${bad.address})`));
        return;
      }
      const usable = options.family ? addrs.filter((a) => a.family === options.family) : addrs;
      if (usable.length === 0) {
        cb(Object.assign(new Error(`no address found for ${hostname}`), { code: 'ENOTFOUND' }));
        return;
      }
      if (options.all) cb(null, usable);
      else cb(null, usable[0].address, usable[0].family);
    }, cb);
  };
}

/**
 * The proxy Node's fetch would use for this URL, or null. Mirrors the
 * env-proxy rules: lowercase variables first, https falls back to the http
 * proxy, NO_PROXY entries match the host or any subdomain, `*` disables.
 */
function proxyFor(u, env = process.env) {
  const httpProxy = env.http_proxy || env.HTTP_PROXY;
  const proxy = u.protocol === 'https:' ? env.https_proxy || env.HTTPS_PROXY || httpProxy : httpProxy;
  if (!proxy) return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  for (const raw of String(env.no_proxy || env.NO_PROXY || '').split(/[\s,]+/).filter(Boolean)) {
    if (raw === '*') return null;
    const entry = raw.toLowerCase().replace(/:\d+$/, '').replace(/^\*?\./, '');
    if (host === entry || host.endsWith(`.${entry}`)) return null;
  }
  return proxy;
}

/** NODE_USE_ENV_PROXY is honored from Node 24.0, and from 22.21 on the 22 line. */
function supportsEnvProxy(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  return major >= 24 || (major === 22 && minor >= 21);
}

/** True when Node will actually send this request through an env proxy. */
function envProxyActive(u, env = process.env, version = process.versions.node) {
  return Boolean(proxyFor(u, env)) && env.NODE_USE_ENV_PROXY === '1' && supportsEnvProxy(version);
}

function directRequest(u, { signal, lookup }) {
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    // agent: false — a fresh connection per hop, so every hop goes through
    // the validating lookup instead of reusing a socket.
    const req = mod.request(u, { method: 'GET', headers: HEADERS, signal, lookup, agent: false }, (res) => {
      resolve({ status: res.statusCode, location: res.headers.location || null, body: res });
    });
    req.on('error', reject);
    req.end();
  });
}

async function proxiedRequest(u, { signal }) {
  const res = await fetch(u.href, { redirect: 'manual', signal, headers: HEADERS });
  return { status: res.status, location: res.headers.get('location'), body: res.body };
}

function discard(body) {
  if (!body) return;
  if (typeof body.destroy === 'function') body.destroy();
  else if (typeof body.cancel === 'function') body.cancel().catch(() => {});
}

/** Read a response body, stopping at maxBytes. */
async function readCapped(body, maxBytes) {
  const chunks = [];
  let total = 0;
  let truncated = false;
  if (body) {
    for await (const chunk of body) {
      const room = maxBytes - total;
      if (chunk.length > room) {
        chunks.push(Buffer.from(chunk).subarray(0, room));
        total += room;
        truncated = true;
        break;
      }
      chunks.push(Buffer.from(chunk));
      total += chunk.length;
    }
  }
  return { body: Buffer.concat(chunks, total), truncated };
}

/** `shop.com` and `www.shop.com` are the same site for this check. */
function siteHost(u) {
  return u.hostname.toLowerCase().replace(/^www\./, '');
}

/**
 * Follow redirects by hand so every hop is vetted.
 *
 * Through an env proxy the guarantee is weaker, by necessity: the proxy
 * resolves the name, so there is no lookup here to check, and a local
 * pre-resolve would fail on proxy-only networks that have no outside DNS.
 * Only literal-IP hosts are checked on that path; a name that resolves to an
 * internal address is reachable if the proxy itself allows it.
 *
 * `resolve`, `isBlocked`, `env` and `nodeVersion` are injectable for tests.
 */
async function fetchPage(startUrl, opts = {}) {
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const isBlocked = opts.isBlocked || isPrivateAddress;
  const resolve = opts.resolve || systemResolve;
  const env = opts.env || process.env;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);

  const first = vetUrl(startUrl);
  let current = first;
  try {
    for (let hop = 0; ; hop++) {
      checkLiteralHost(current, isBlocked);
      const res = envProxyActive(current, env, opts.nodeVersion)
        ? await proxiedRequest(current, { signal })
        : await directRequest(current, { signal, lookup: makeLookup(resolve, isBlocked, signal) });
      if (res.status >= 300 && res.status < 400 && res.location) {
        discard(res.body);
        if (hop >= maxRedirects) {
          throw new InputError(`more than ${maxRedirects} redirects`);
        }
        current = vetUrl(res.location, current);
        continue;
      }
      const { body, truncated } = await readCapped(res.body, maxBytes);
      return {
        status: res.status,
        finalUrl: current.href,
        hostChanged: siteHost(current) !== siteHost(first),
        body,
        truncated,
      };
    }
  } catch (e) {
    // An aborted request surfaces as a generic AbortError; report the timeout.
    if (signal.aborted && !(e instanceof InputError)) throw signal.reason;
    throw e;
  }
}

function errorCode(e) {
  return (e.cause && e.cause.code) || e.code || '';
}

function isTlsError(e) {
  return /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_/i.test(errorCode(e));
}

/**
 * Name the real network failure. Node's fetch reports every one of them as
 * "fetch failed" and hides the reason in `cause`.
 */
function describeError(e, env = process.env, version = process.versions.node) {
  if (e.name === 'TimeoutError') return 'timed out';
  const code = errorCode(e);
  const reason = e.cause && e.cause.message ? e.cause.message : '';
  let msg = e.message;
  if (reason && !msg.includes(reason)) msg += ` (${reason})`;
  if (code && !msg.includes(code)) msg += ` [${code}]`;
  if (isTlsError(e)) {
    msg += ' — a TLS certificate problem; on a network with a TLS-inspecting proxy this Node version may not trust the company certificate';
  }
  const proxy = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (proxy && !supportsEnvProxy(version) && CONNECTION_CODES.has(code)) {
    msg += ' — a proxy is configured, and this Node version cannot route through it';
  }
  return msg;
}

/**
 * Remove save folders from earlier runs once they are an hour old. Only our
 * own: real directories (not symlinks) with our prefix, owned by this user —
 * the temp folder can be shared with other users.
 */
function pruneOldSaves(root = os.tmpdir(), now = Date.now()) {
  let entries = [];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return;
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  for (const name of entries) {
    if (!name.startsWith(SAVE_PREFIX)) continue;
    const p = path.join(root, name);
    try {
      const st = fs.lstatSync(p);
      if (!st.isDirectory() || (uid !== null && st.uid !== uid)) continue;
      if (now - st.mtimeMs > KEEP_SAVED_MS) fs.rmSync(p, { recursive: true, force: true });
    } catch {
      // Another run may be removing it; nothing to do.
    }
  }
}

function canUseSystemCa() {
  return process.allowedNodeEnvironmentFlags.has('--use-system-ca');
}

/**
 * Re-run this script with the OS certificate store and env-proxy support
 * switched on — both only take effect at startup. Used only when a proxy is
 * configured or a certificate error happened; otherwise one process is enough.
 */
function rerunWithSystemNetworking() {
  const flags = canUseSystemCa() ? ['--use-system-ca'] : [];
  const r = spawnSync(process.execPath, [...flags, __filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, REALIZE_FETCH_CHILD: '1', NODE_USE_ENV_PROXY: '1' },
  });
  if (r.error) {
    console.error(`error: could not re-run with system networking settings: ${r.error.message}`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
}

function parseArgs(argv) {
  const urls = [];
  for (const a of argv) {
    if (a.startsWith('--')) throw new InputError(`unknown option ${a}`);
    urls.push(a);
  }
  if (urls.length === 0) throw new InputError("no URL given (usage: node fetch-page.js '<url>')");
  if (urls.length > 1) throw new InputError('exactly one URL, please');
  return { url: urls[0] };
}

async function main() {
  let url;
  try {
    url = vetUrl(parseArgs(process.argv.slice(2)).url);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }

  const isChild = Boolean(process.env.REALIZE_FETCH_CHILD);
  if (!isChild && proxyFor(url) && (supportsEnvProxy() || canUseSystemCa())) {
    rerunWithSystemNetworking();
    return;
  }

  let result;
  try {
    result = await fetchPage(url.href);
  } catch (e) {
    if (e instanceof InputError) {
      console.error(`error: ${e.message}`);
      process.exit(2);
    }
    if (!isChild && isTlsError(e) && canUseSystemCa()) {
      rerunWithSystemNetworking();
      return;
    }
    console.error(`error: ${describeError(e)}`);
    process.exit(1);
  }

  let file;
  try {
    pruneOldSaves();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), SAVE_PREFIX));
    file = path.join(dir, 'page.html');
    fs.writeFileSync(file, result.body, { flag: 'wx' });
  } catch (e) {
    console.error(`error: the page downloaded but could not be saved to the temp folder: ${e.message}`);
    process.exit(1);
  }

  console.log(`status: ${result.status}`);
  console.log(`final_url: ${result.finalUrl}`);
  console.log(`host_changed: ${result.hostChanged ? 'yes' : 'no'}`);
  console.log(`bytes: ${result.body.length}`);
  console.log(`truncated: ${result.truncated ? 'yes' : 'no'}`);
  console.log(`saved_to: ${file}`);
}

module.exports = {
  vetUrl,
  parseArgs,
  fetchPage,
  isPrivateAddress,
  parseIPv6,
  checkLiteralHost,
  makeLookup,
  proxyFor,
  supportsEnvProxy,
  envProxyActive,
  siteHost,
  describeError,
  pruneOldSaves,
  InputError,
  MAX_REDIRECTS,
  MAX_BYTES,
  SAVE_PREFIX,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(`error: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}
