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
 *   node fetch-page.js --url-file <path>
 *   node fetch-page.js <url>            (trivial ASCII URLs only)
 *
 * Prints `key: value` lines: status, final_url, host_changed, bytes,
 * truncated, saved_to. Exit 0 when a response was received (any status — the
 * caller decides whether to trust it), 1 on a network failure, 2 on bad input.
 *
 * Why a script and not a curl one-liner (DEV-240750):
 *  - The skill can pre-approve exactly this file instead of bare `Bash`
 *    (ALLOWED_TOOLS_BROAD), and no download-then-run shape exists anywhere
 *    (RUNTIME_FETCH_EXEC).
 *  - The trust boundary lives in code, not in flags the model must remember:
 *    http/https only on every hop, at most MAX_REDIRECTS redirects, a hard
 *    timeout, a size cap, no credentials in the URL, no cookies sent.
 *  - The URL comes in by file for the same reason the support bundle takes
 *    user text by file: inside double quotes the shell expands `$` and `$(…)`,
 *    and URLs are user-supplied.
 *
 * Why not WebFetch: it converts pages to readable text and strips every
 * <script> tag, so it can never see a pixel install.
 *
 * Node ships with Claude Code, so it is always available. No dependencies.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const USER_AGENT = 'Mozilla/5.0 (compatible; RealizePluginPixelCheck/1.0)';

class InputError extends Error {}

/** Parse and vet a user-supplied URL. Throws InputError on anything unsafe. */
function vetUrl(raw, base) {
  let u;
  try {
    u = base ? new URL(raw, base) : new URL(String(raw).trim());
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

function parseArgs(argv) {
  const out = { url: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url-file') {
      const p = argv[++i];
      if (!p) throw new InputError('--url-file needs a path');
      let text;
      try {
        text = fs.readFileSync(p, 'utf8');
      } catch (e) {
        throw new InputError(`cannot read --url-file: ${e.message}`);
      }
      out.url = text.trim();
    } else if (a.startsWith('--')) {
      throw new InputError(`unknown option ${a}`);
    } else if (out.url === null) {
      out.url = a;
    } else {
      throw new InputError('exactly one URL, please');
    }
  }
  if (!out.url) throw new InputError('no URL given (use --url-file <path>)');
  return out;
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
 * Follow redirects by hand so every hop is vetted. `fetchImpl` is injectable
 * for tests.
 */
async function fetchPage(startUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);

  const first = vetUrl(startUrl);
  let current = first;
  for (let hop = 0; ; hop++) {
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
      hostChanged: current.hostname !== first.hostname,
      body,
      truncated,
    };
  }
}

async function main() {
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
    console.error(`error: ${e.name === 'TimeoutError' ? 'timed out' : e.message}`);
    process.exit(e instanceof InputError ? 2 : 1);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realize-pixel-check-'));
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(file, result.body);

  console.log(`status: ${result.status}`);
  console.log(`final_url: ${result.finalUrl}`);
  console.log(`host_changed: ${result.hostChanged ? 'yes' : 'no'}`);
  console.log(`bytes: ${result.body.length}`);
  console.log(`truncated: ${result.truncated ? 'yes' : 'no'}`);
  console.log(`saved_to: ${file}`);
}

module.exports = { vetUrl, parseArgs, fetchPage, InputError, MAX_REDIRECTS, MAX_BYTES };

if (require.main === module) {
  main();
}
