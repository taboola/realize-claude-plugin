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
 * Why not WebFetch: it converts pages to readable text and strips every
 * <script> tag, so it can never see a pixel install.
 *
 * Requires Node 18+ on PATH. Claude Code's native and desktop installs do not
 * provide one; when `node` is missing the skill skips the static check.
 * No dependencies.
 */

const dns = require('dns').promises;
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const USER_AGENT = 'Mozilla/5.0 (compatible; RealizePluginPixelCheck/1.0)';
// Saved pages live under one folder and are pruned on the next run, so a
// diagnosis never leaves a pile of downloaded HTML behind.
const SAVE_ROOT = path.join(os.tmpdir(), 'realize-pixel-check');
const KEEP_SAVED_MS = 60 * 60 * 1000;

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

/** True for addresses a public web page must never send us to. */
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
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
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]);
  return (
    v6 === '::' || v6 === '::1' ||
    /^f[cd]/.test(v6) || // unique local
    /^fe[89ab]/.test(v6) || // link-local
    /^ff/.test(v6) // multicast
  );
}

/**
 * Refuse a host that is, or resolves to, a private address. Checked on every
 * hop, so a public page cannot redirect the fetch into the user's network.
 * `lookup` is injectable for tests.
 */
async function checkPublicHost(u, lookup = dns.lookup) {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  const bad = addrs.find((a) => isPrivateAddress(a.address));
  if (bad) {
    throw new InputError(`refused: ${u.hostname} is a private or local address (${bad.address})`);
  }
}

/** `shop.com` and `www.shop.com` are the same site for this check. */
function siteHost(u) {
  return u.hostname.toLowerCase().replace(/^www\./, '');
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

/** Read a response body, stopping at maxBytes. */
async function readCapped(res, maxBytes) {
  const chunks = [];
  let total = 0;
  let truncated = false;
  if (res.body) {
    for await (const chunk of res.body) {
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

/**
 * Follow redirects by hand so every hop is vetted. `fetchImpl` and
 * `checkHost` are injectable for tests.
 */
async function fetchPage(startUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const checkHost = opts.checkHost || checkPublicHost;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);

  const first = vetUrl(startUrl);
  let current = first;
  for (let hop = 0; ; hop++) {
    await checkHost(current);
    const res = await fetchImpl(current.href, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*;q=0.8' },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= maxRedirects) {
        throw new InputError(`more than ${maxRedirects} redirects`);
      }
      current = vetUrl(location, current);
      continue;
    }
    const { body, truncated } = await readCapped(res, maxBytes);
    return {
      status: res.status,
      finalUrl: current.href,
      hostChanged: siteHost(current) !== siteHost(first),
      body,
      truncated,
    };
  }
}

/**
 * Name the real network failure. Node's fetch reports every one of them as
 * "fetch failed" and hides the reason in `cause`.
 */
function describeError(e) {
  if (e.name === 'TimeoutError') return 'timed out';
  const cause = e.cause || {};
  const code = cause.code || '';
  let msg = code ? `${e.message} (${code}${cause.message ? `: ${cause.message}` : ''})` : e.message;
  if (/CERT|SSL|TLS/i.test(code)) {
    msg += ' — a TLS certificate problem; on a network with a TLS-inspecting proxy this Node version may not trust the company certificate';
  }
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  // NODE_USE_ENV_PROXY (set by the re-run below) is honored from Node 24.
  if (proxy && Number(process.versions.node.split('.')[0]) < 24) {
    msg += ' — a proxy is configured, and this Node version cannot route through it';
  }
  return msg;
}

/** Remove pages saved by earlier runs once they are an hour old. */
function pruneOldSaves(now = Date.now()) {
  let entries = [];
  try {
    entries = fs.readdirSync(SAVE_ROOT);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = path.join(SAVE_ROOT, name);
    try {
      if (now - fs.statSync(p).mtimeMs > KEEP_SAVED_MS) fs.rmSync(p, { recursive: true, force: true });
    } catch {
      // Another run may be removing it; nothing to do.
    }
  }
}

/**
 * Newer Node can use the OS certificate store and the HTTPS_PROXY variables,
 * but only when told at startup. Re-run once with those switched on, so users
 * behind a corporate proxy get the same reach a system download tool would.
 * Returns the child's exit code, or null when this Node can't do it.
 */
function rerunWithSystemNetworking() {
  if (process.env.REALIZE_FETCH_CHILD) return null;
  if (!process.allowedNodeEnvironmentFlags.has('--use-system-ca')) return null;
  const r = spawnSync(process.execPath, ['--use-system-ca', __filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, REALIZE_FETCH_CHILD: '1', NODE_USE_ENV_PROXY: '1' },
  });
  return r.status ?? 1;
}

async function main() {
  const rerun = rerunWithSystemNetworking();
  if (rerun !== null) process.exit(rerun);

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }

  let result;
  try {
    result = await fetchPage(args.url);
  } catch (e) {
    if (e instanceof InputError) {
      console.error(`error: ${e.message}`);
      process.exit(2);
    }
    console.error(`error: ${describeError(e)}`);
    process.exit(1);
  }

  pruneOldSaves();
  fs.mkdirSync(SAVE_ROOT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(SAVE_ROOT, 'page-'));
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(file, result.body);

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
  checkPublicHost,
  siteHost,
  describeError,
  InputError,
  MAX_REDIRECTS,
  MAX_BYTES,
};

if (require.main === module) {
  main();
}
