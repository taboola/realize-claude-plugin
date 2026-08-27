#!/usr/bin/env node
'use strict';

/**
 * Realize Plugin — support bundle builder.
 *
 * Reads the current Claude Code session transcript and renders a single
 * human-readable Markdown file for the Taboola Professional Services team.
 *
 * The transcript is the payload: PS needs the exact prompt, the exact call, and
 * the exact response. Everything above the transcript is mechanically derived
 * from it — never model-interpreted — so a plugin that misunderstood the user
 * cannot distort its own bug report.
 *
 * Usage:
 *   node build-bundle.js --preview
 *   node build-bundle.js --write --title-file <path> --complaint-file <path>
 *                        [--out <path>] [--force]
 *
 * Pass user-authored text by file, not as a quoted argument: the shell rewrites
 * it (`$12.40` becomes `2.40`) and `$(…)` executes. `--title` / `--complaint`
 * remain for trivial ASCII only.
 *
 * Node ships with Claude Code, so it is always available. No dependencies.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SUPPORT_EMAIL = 'Support@taboola.com';

// Prepended to the summary so the case opens with its own provenance. Requested
// by PS: a Description that starts mid-diagnostics reads like a forwarded stack
// trace, and the agent picking up the case has no idea what produced it.
const EMAIL_PROLOG =
  'This case has been created by the Realize Plugin, please find the interaction summary below.';

// Case intake puts the email subject into the case Subject field, which is a
// single short line. The user's own words are the subject (per PS), so they have
// to survive being cut to something a triage queue can read.
const MAX_SUBJECT_CHARS = 120;

// Floor on how much of the user's own sentence must survive in the subject. If
// the account suffix would leave less than this, the suffix is dropped instead.
const MIN_SUBJECT_TEXT_CHARS = 40;

const MAX_RESULT_CHARS = 2000;           // per non-Realize tool result (bulk output)
const MAX_REALIZE_RESULT_CHARS = 20000;  // per Realize result — this is the evidence
const MAX_THINKING_CHARS = 1200; // per thinking block
const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    preview: false,
    write: false,
    title: '',
    complaint: '',
    out: '',
    force: false,
    allowGit: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preview') out.preview = true;
    else if (a === '--write') out.write = true;
    else if (a === '--force') out.force = true;
    else if (a === '--allow-git') out.allowGit = true;
    else if (a === '--title') out.title = argv[++i] || '';
    else if (a === '--complaint') out.complaint = argv[++i] || '';
    else if (a === '--title-file') out.title = readTextFile(argv[++i]);
    else if (a === '--complaint-file') out.complaint = readTextFile(argv[++i]);
    else if (a === '--out') out.out = argv[++i] || '';
  }
  if (!out.preview && !out.write) out.preview = true;
  // A title spanning multiple lines splits the header and gives PS a broken
  // subject line. draftTitle() already collapses whitespace; do the same for
  // titles that arrive from a file or argument — and give them the same
  // redact-then-clamp treatment as the complaint, because the title becomes
  // the email subject when no complaint was supplied, so it leaves the machine.
  out.title = clampChars(redact(oneLine(out.title)), MAX_SUBJECT_CHARS);
  return out;
}

/**
 * Read user-authored text from a file rather than an argv string.
 *
 * The complaint is the user's own words and routinely contains characters the
 * shell rewrites — `$12.40` becomes `2.40` under double quotes, and `$(…)` or
 * backticks execute. Since this text is the evidence PS reads, it has to arrive
 * byte-for-byte. `--complaint` / `--title` remain for trivial ASCII, but the
 * file variants are the supported path.
 */
function readTextFile(p) {
  if (!p) throw new Error('--complaint-file / --title-file was given without a path.');
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch (err) {
    // Fatal on purpose. Continuing would write a bundle whose "What the user
    // reported" section reads "The user did not add a description" — an
    // affirmative false statement to support about a user who did describe the
    // problem. Losing the complaint is worse than failing loudly.
    throw new Error(`could not read ${p} — ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// locating the transcript
// ---------------------------------------------------------------------------

/** Claude Code encodes the project path by replacing every non-alphanumeric char with '-'. */
function encodeProjectDir(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Resolve this session's transcript.
 *
 * CLAUDE_CODE_SESSION_ID is the authoritative signal. Falling back to
 * "newest .jsonl" is a real coin flip — a project folder routinely holds
 * several sessions — so that path is a last resort and is reported as such.
 */
function findTranscript() {
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsRoot)) {
    return { error: `No Claude Code project data found at ${projectsRoot}.` };
  }

  const sessionId = process.env.CLAUDE_CODE_SESSION_ID || '';
  const cwd = process.cwd();

  if (sessionId) {
    // Preferred: derive the folder from cwd.
    const direct = path.join(projectsRoot, encodeProjectDir(cwd), `${sessionId}.jsonl`);
    if (fs.existsSync(direct)) {
      return { file: direct, sessionId, confidence: 'exact' };
    }
    // The session may have started in a different cwd — scan every project folder.
    for (const dir of safeReaddir(projectsRoot)) {
      const candidate = path.join(projectsRoot, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) {
        return { file: candidate, sessionId, confidence: 'exact' };
      }
    }
  }

  // Last resort.
  const dirPath = path.join(projectsRoot, encodeProjectDir(cwd));
  const candidates = safeReaddir(dirPath)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = path.join(dirPath, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (!candidates.length) {
    return { error: `No session transcript found for this project (looked in ${dirPath}).` };
  }
  return {
    file: candidates[0].full,
    sessionId: path.basename(candidates[0].full, '.jsonl'),
    confidence: 'guessed',
    siblings: candidates.length,
  };
}

function safeReaddir(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// redaction
// ---------------------------------------------------------------------------

/**
 * Strip credentials only. Account, campaign, and item IDs are deliberately
 * preserved — PS cannot reproduce the issue without them.
 */
const SECRET_KEYS =
  'password|passwd|client[-_]?secret|clientSecret|access[-_]?token|refresh[-_]?token|id[-_]?token|auth[-_]?token|api[-_]?key|apiKey|x-api-key|authorization|secret';

const REDACTIONS = [
  [/(Bearer\s+)[A-Za-z0-9._\-]{12,}/gi, '$1<redacted>'],
  // JSON form: "password": "value"
  [new RegExp(`("(?:${SECRET_KEYS})"\\s*:\\s*")[^"]*(")`, 'gi'), '$1<redacted>$2'],
  // Flat `key=value` form, for text that is not JSON (error strings, logs).
  //
  // Deliberately `=` only, not `[:=]`. The colon form is already covered by the
  // JSON rule above, and matching bare `secret:` / `authorization:` in prose
  // shredded legitimate ad copy — "Secret: Summer Sale" became
  // "Secret: <redacted> Sale". Destroying creative text in a bundle whose whole
  // purpose is evidence fidelity is worse than the leak it was guarding.
  //
  // The value must also be whitespace-free and reasonably long, so ordinary
  // prose after an equals sign is left alone.
  [
    new RegExp(`((?:${SECRET_KEYS})\\s*=\\s*)(?!<redacted)[^\\s,;&|"']{6,}`, 'gi'),
    '$1<redacted>',
  ],
  [/(eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})\.[A-Za-z0-9_\-]+/g, '<redacted-jwt>'],
];

/** Key names whose value is always a credential, matched structurally. */
const SECRET_KEY_TEST = new RegExp(`^(?:${SECRET_KEYS})$`, 'i');

function redact(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}

/**
 * Redact a single parameter where the key is known.
 *
 * Preferred over running `redact()` across a rendered string: the key is
 * structural data, so there is no need to guess at prose. Callers that have an
 * object should use this.
 */
function redactValue(key, value) {
  if (SECRET_KEY_TEST.test(String(key))) return '<redacted>';
  return redact(String(value));
}

/** Collapse whitespace so a value can sit safely inside a Markdown table cell. */
function oneLine(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

function truncate(s, max) {
  if (typeof s !== 'string') s = String(s);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… [truncated ${s.length - max} more characters]`;
}

/**
 * Cap by bytes, not characters, and leave valid Markdown behind.
 *
 * A character-based slice under a byte-based limit can overshoot on multi-byte
 * content, and cutting inside a fenced block leaves every line below it
 * rendering as code.
 */
function truncateToBytes(s, maxBytes, note) {
  const buf = Buffer.from(s, 'utf8');
  if (buf.length <= maxBytes) return s;

  // Written as an escape, not the literal character: a raw replacement char in
  // source is invisible in most editors and won't survive an encoding change.
  let out = buf.subarray(0, maxBytes).toString('utf8').replace(new RegExp('\uFFFD+$'), '');

  // Close anything the cut left open, or every line below it renders wrong.
  if (((out.match(/^```/gm) || []).length) % 2 === 1) out += '\n```';
  const opened = (out.match(/<details>/g) || []).length;
  const closed = (out.match(/<\/details>/g) || []).length;
  for (let i = 0; i < opened - closed; i++) out += '\n</details>';

  return `${out}\n\n${note}\n`;
}

// ---------------------------------------------------------------------------
// parsing
// ---------------------------------------------------------------------------

const MAX_TRANSCRIPT_BYTES = 256 * 1024 * 1024;

function parseTranscript(file) {
  // The whole transcript is read and rendered before the output cap applies, so
  // guard the input too — otherwise a pathologically long session fails as an
  // out-of-memory crash rather than a message anyone can act on.
  const size = fs.statSync(file).size;
  if (size > MAX_TRANSCRIPT_BYTES) {
    throw new Error(
      `this session's transcript is ${Math.round(size / 1024 / 1024)} MB, ` +
        `above the ${MAX_TRANSCRIPT_BYTES / 1024 / 1024} MB limit. ` +
        `Start a fresh session and reproduce the issue there, then run /support again.`
    );
  }

  const raw = fs.readFileSync(file, 'utf8');
  const records = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      /* tolerate partial trailing writes */
    }
  }
  return records;
}

// Matches the plugin's own server (`mcp__realize-mcp__*`) and the claude.ai
// connector variant (`mcp__claude_ai_Realize_MCP__*`), which otherwise fell
// through to "other tools" and reported zero Realize activity.
const REALIZE_TOOL = /^mcp__(?:.*[-_])?realize[-_]?mcp__(.+)$/i;

function analyze(records) {
  const facts = {
    sessionId: '',
    claudeCodeVersion: '',
    gitBranch: '',
    cwd: '',
    models: new Set(),
    firstTs: '',
    lastTs: '',
    userTurns: 0,       // messages the human actually typed
    assistantTurns: 0,  // replies containing prose, not tool-call-only records
    toolResults: 0,     // tool results, which the transcript also stores as "user" records
    realizeCalls: [],   // {name, input, ok, error, ts}
    otherTools: new Map(),
    // What guidance the plugin actually consulted before answering. PS needs
    // this to separate two different bugs that look identical from outside:
    // the plugin read the right guidance and still got it wrong, versus the
    // plugin never read it. Extracted from tool calls, not self-reported.
    knowledgeFiles: new Set(),
    skillsUsed: new Set(),
    accountIds: new Set(),
    campaignIds: new Set(),
    itemIds: new Set(),
    firstUserText: '',
    lastUserText: '',
  };

  // tool_use id -> call, so results can be matched back to their call
  const callsById = new Map();

  for (const r of records) {
    if (r.sessionId && !facts.sessionId) facts.sessionId = r.sessionId;
    if (r.version) facts.claudeCodeVersion = r.version;
    if (r.gitBranch) facts.gitBranch = r.gitBranch;
    if (r.cwd) facts.cwd = r.cwd;
    if (r.timestamp) {
      if (!facts.firstTs) facts.firstTs = r.timestamp;
      facts.lastTs = r.timestamp;
    }
    if (r.message && r.message.model) facts.models.add(r.message.model);

    const content = r.message && r.message.content;

    // The transcript stores tool results as `type: "user"` records too, so a
    // raw count of user records overstates what the human typed by ~10x.
    // Count only records carrying actual text.
    if (r.type === 'user') {
      const text = extractText(content);
      if (text) {
        facts.userTurns++;
        if (!facts.firstUserText) facts.firstUserText = text;
        facts.lastUserText = text;
      }
      if (Array.isArray(content) && content.some((b) => b && b.type === 'tool_result')) {
        facts.toolResults++;
      }
    }
    // One reply spans many assistant records (one per tool call), so counting
    // records — even records carrying text — overstates replies ~7x.
    // `stop_reason: "end_turn"` marks a reply the user actually saw finish.
    if (r.type === 'assistant' && r.message && r.message.stop_reason === 'end_turn') {
      facts.assistantTurns++;
    }

    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block.type === 'tool_use') {
        const m = REALIZE_TOOL.exec(block.name || '');
        const input = block.input || {};
        collectIds(input, facts);
        if (m) {
          const call = { name: m[1], input, ok: null, error: '', ts: r.timestamp || '', id: block.id };
          facts.realizeCalls.push(call);
          if (block.id) callsById.set(block.id, call);
        } else if (block.name) {
          // A recorded `Skill` call is already surfaced by name under "Skills
          // invoked"; counting it here as well double-reports the same call.
          if (!(block.name === 'Skill' && input.skill)) {
            facts.otherTools.set(block.name, (facts.otherTools.get(block.name) || 0) + 1);
          }
        }

        if (block.name === 'Skill' && input.skill) facts.skillsUsed.add(String(input.skill));
        const fp = input.file_path || input.path || input.notebook_path;
        const ref = typeof fp === 'string' ? knowledgeRef(fp) : '';
        if (ref) facts.knowledgeFiles.add(ref);
      }

      if (block.type === 'tool_result') {
        const call = block.tool_use_id ? callsById.get(block.tool_use_id) : null;
        if (call) {
          call.ok = !block.is_error;
          if (block.is_error) call.error = truncate(redact(extractText(block.content)), 600);
        }
      }
    }
  }

  return facts;
}

function collectIds(obj, facts) {
  const json = JSON.stringify(obj || {});
  for (const m of json.matchAll(/"account_id"\s*:\s*"?([^",}]+)"?/g)) facts.accountIds.add(m[1]);
  for (const m of json.matchAll(/"campaign_id"\s*:\s*"?([^",}]+)"?/g)) facts.campaignIds.add(m[1]);
  for (const m of json.matchAll(/"item_id"\s*:\s*"?([^",}]+)"?/g)) facts.itemIds.add(m[1]);
}

// The plugin's own guidance directories, matched against a path already made
// relative to the plugin root. Deliberately narrow: the question is "which
// guidance did it consult", not "every file it touched". A session that read the
// user's own spreadsheet has not consulted knowledge.
const KNOWLEDGE_REF =
  /^(?:(?:knowledge|os|agents)\/[^/]+\.md|skills\/[^/]+\/(?:SKILL\.md|references\/[^/]+\.md))$/i;

let cachedPluginRoot = null;

/** This plugin's checkout root — `skills/support/scripts` is three levels down. */
function pluginRoot() {
  if (cachedPluginRoot === null) cachedPluginRoot = path.resolve(__dirname, '..', '..', '..');
  return cachedPluginRoot;
}

/**
 * Label a read file as a knowledge resource, or '' if it isn't one.
 *
 * Anchored to the plugin root rather than matched anywhere in the path. Without
 * the anchor a user's own `~/Documents/os/notes.md` was reported to PS as plugin
 * guidance, which is worse than reporting nothing: the section exists so PS can
 * tell "read the right guidance and still got it wrong" from "never read it",
 * and a false entry answers that question incorrectly.
 *
 * `root` is injectable for tests; production always uses the real checkout.
 */
function knowledgeRef(p, root) {
  const baseFs = path.resolve(root === undefined ? pluginRoot() : String(root)).replace(/\\/g, '/');
  const fullFs = path.resolve(String(p)).replace(/\\/g, '/');

  // Compared case-insensitively because Windows paths routinely differ only in
  // case, but the label is sliced from the case-preserved path so `SKILL.md`
  // keeps its name.
  if (!fullFs.toLowerCase().startsWith(`${baseFs.toLowerCase()}/`)) return '';

  const rel = fullFs.slice(baseFs.length + 1);
  return KNOWLEDGE_REF.test(rel) ? rel : '';
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
    .map((b) => b.text || '')
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// derived title
// ---------------------------------------------------------------------------

/**
 * A mechanical fallback title. The skill normally passes a better one via
 * --title; this exists so the bundle is never untitled.
 */
function draftTitle(facts) {
  const failed = facts.realizeCalls.filter((c) => c.ok === false);
  if (failed.length) {
    return `Realize Plugin — "${failed[0].name}" failed${
      facts.accountIds.size ? ` (account ${[...facts.accountIds][0]})` : ''
    }`;
  }
  // firstUserText is raw chat text, and this drafted title becomes the email
  // subject whenever the run had no complaint (emailSubject falls back here) —
  // so it gets the same redact-first treatment as the complaint path, and the
  // same backtick strip so the copy fence cannot close early.
  const seed = redact(String(facts.firstUserText || ''))
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (seed) {
    return `Realize Plugin — ${seed.slice(0, 70)}${seed.length > 70 ? '…' : ''}`;
  }
  return 'Realize Plugin — support request';
}

/**
 * The email subject, and therefore the case Subject field.
 *
 * PS asked for the user's own words here rather than a title written about them.
 * That also removes the last model-authored field in the bundle, which is the
 * direction the rest of this file already goes: the user reported the problem,
 * so the user's sentence is the most faithful summary of it available.
 *
 * Collapsed to one line — a newline in a subject header truncates it at the
 * break in most mail clients, silently dropping the rest.
 */
function emailSubject(complaint, facts) {
  // Redacted first, then shortened — the ordering the rest of this file follows,
  // because slicing can cut a credential below the length its pattern matches on.
  // Users paste error output they did not author, and this string now travels
  // into an email subject line, so a token in it would leave the machine.
  // `redact` is safe on prose by construction: the flat rule is `=`-only with a
  // length floor, so ordinary sentences are untouched.
  //
  // Backticks are stripped, not escaped: the subject is rendered inside a fenced
  // block for copying, and a stray backtick there closes the fence early and
  // swallows the rest of the file's formatting.
  const text = redact(String(complaint || ''))
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return draftTitle(facts);

  // Account ID earns its place in the subject: PS triages by account, and it is
  // the one thing the user's sentence reliably omits.
  const suffix = facts.accountIds.size ? ` (account ${[...facts.accountIds][0]})` : '';

  // The user's words are the point of this subject, so they get the space first.
  // account_id is an opaque API-supplied string with no length guarantee; when
  // the suffix cannot fit, drop it rather than let it push the complaint out of
  // the subject line describing that complaint. (A naive
  // `slice(0, MAX - suffix.length - 1)` goes negative here and slices from the
  // end, which silently replaced the entire complaint with an ellipsis.)
  // Section 2 still lists every account acted on, so nothing is lost.
  const room = MAX_SUBJECT_CHARS - suffix.length;
  if (room < MIN_SUBJECT_TEXT_CHARS) return clampChars(text, MAX_SUBJECT_CHARS);
  return `${clampChars(text, room)}${suffix}`;
}

function clampChars(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * The Summary section, and the text the user pastes as the email body.
 *
 * Every line is derived from the session log. There is deliberately no written
 * account of what went wrong: this bundle exists for the cases where the plugin
 * misread the request, and a narrative composed by that same plugin reproduces
 * the misreading in the one document meant to expose it. Counts, tool names and
 * file paths cannot be wrong in that way, so those are what the summary carries.
 */
function renderSummary(facts) {
  const failed = facts.realizeCalls.filter((c) => c.ok === false);
  const succeeded = facts.realizeCalls.filter((c) => c.ok === true);
  const actionNames = [...new Set(facts.realizeCalls.map((c) => c.name))];
  const L = [];

  L.push('## 1. Summary');
  L.push('');
  L.push(EMAIL_PROLOG);
  L.push('');
  L.push(`- **Session:** \`${facts.sessionId || 'unknown'}\` — ${facts.firstTs || '?'} → ${facts.lastTs || '?'}`);
  L.push(`- **Exchange:** ${facts.userTurns} message(s) from the user, ${facts.assistantTurns} repl(y/ies) from the plugin.`);
  L.push(`- **Accounts acted on:** ${setOr(facts.accountIds, 'none')}`);
  if (facts.campaignIds.size) L.push(`- **Campaigns acted on:** ${setOr(facts.campaignIds, 'none')}`);
  if (facts.itemIds.size) L.push(`- **Items acted on:** ${setOr(facts.itemIds, 'none')}`);
  L.push(
    `- **Realize actions:** ${facts.realizeCalls.length} attempted — ` +
      `${succeeded.length} succeeded, **${failed.length} failed**.`
  );
  L.push(
    `- **Realize tools used:** ${
      actionNames.length ? actionNames.map((n) => `\`${n}\``).join(', ') : 'none'
    }`
  );
  L.push(
    `- **Skills invoked:** ${
      facts.skillsUsed.size ? [...facts.skillsUsed].map((s) => `\`${s}\``).join(', ') : 'none recorded'
    }`
  );
  L.push(
    `- **Knowledge resources read:** ${
      facts.knowledgeFiles.size
        ? [...facts.knowledgeFiles].map((k) => `\`${k}\``).join(', ')
        : 'none recorded'
    }`
  );
  if (facts.otherTools.size) {
    const others = [...facts.otherTools.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([n, c]) => `\`${n}\`×${c}`)
      .join(', ');
    L.push(`- **Other tools used:** ${others}`);
  }

  if (failed.length) {
    L.push('');
    L.push('**Actions that failed:**');
    L.push('');
    for (const f of failed) {
      const first = oneLine(f.error || '(no error text captured)');
      L.push(`- \`${f.name}\` — ${first.length > 160 ? `${first.slice(0, 160)}…` : first}`);
    }
  }

  L.push('');
  L.push(
    '_Every line above is extracted mechanically from the session log; nothing here is ' +
      'the plugin\'s own account of what happened. That is deliberate — if the plugin ' +
      'misread the request, a summary it wrote would repeat the misreading. The verbatim ' +
      'exchange is in the attached file under "Full transcript"._'
  );
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

function pluginVersion() {
  try {
    const p = path.join(__dirname, '..', '..', '..', '.claude-plugin', 'plugin.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function renderHeader(facts, subject, complaint, loc) {
  const failed = facts.realizeCalls.filter((c) => c.ok === false);
  const L = [];

  L.push(`# Realize Plugin — Support Bundle`);
  L.push('');
  L.push('## How to send this to Support');
  L.push('');
  L.push(`1. Start a new email to **${SUPPORT_EMAIL}**.`);
  L.push('2. **Subject** — copy this line (it becomes the case Subject):');
  L.push('');
  L.push('```');
  L.push(subject);
  L.push('```');
  L.push('');
  L.push('3. **Body** — copy all of **Section 1. Summary** below (it becomes the case Description).');
  L.push('4. **Attach this file**, so Support also has the failed actions and the full transcript.');
  L.push('');
  L.push('_Nothing has been sent anywhere. This file is on your machine and emailing it is your decision._');
  L.push('');
  L.push('---');
  L.push('');
  L.push(renderSummary(facts));
  L.push('## 2. At a glance');
  L.push('');
  L.push('| Field | Value |');
  L.push('|---|---|');
  L.push(`| Session ID | \`${facts.sessionId || 'unknown'}\` |`);
  L.push(`| Conversation start | ${facts.firstTs || 'unknown'} |`);
  L.push(`| Conversation end | ${facts.lastTs || 'unknown'} |`);
  L.push(`| Messages from the user | ${facts.userTurns} |`);
  L.push(`| Replies from the plugin | ${facts.assistantTurns} |`);
  L.push(`| Tool results exchanged | ${facts.toolResults} |`);
  // "acted on", not "involved": these come from the parameters of requests the
  // plugin sent. A session that only browsed search results without acting on
  // one correctly shows none here.
  L.push(`| Accounts acted on | ${setOr(facts.accountIds, 'none')} |`);
  L.push(`| Campaigns acted on | ${setOr(facts.campaignIds, 'none')} |`);
  L.push(`| Items acted on | ${setOr(facts.itemIds, 'none')} |`);
  L.push(`| Realize actions attempted | ${facts.realizeCalls.length} |`);
  L.push(`| **Failed actions** | **${failed.length}** |`);
  L.push(`| Plugin version | ${pluginVersion()} |`);
  L.push(`| Claude Code version | ${facts.claudeCodeVersion || 'unknown'} |`);
  L.push(`| Model(s) | ${setOr(facts.models, 'unknown')} |`);
  L.push(`| Platform | ${os.platform()} ${os.release()} |`);
  if (loc.confidence === 'guessed') {
    L.push(`| ⚠ Transcript match | best-guess (session ID unavailable; ${loc.siblings} sessions in folder) |`);
  }
  L.push('');

  L.push('## 3. What the user reported');
  L.push('');
  // Redacted, not paraphrased. The wording stays the user's own — `redact` only
  // removes credential-shaped values, and users paste error output containing
  // tokens they never looked at.
  L.push(complaint ? redact(complaint) : '_The user did not add a description when generating this bundle._');
  L.push('');

  L.push('## 4. Failed actions');
  L.push('');
  if (!failed.length) {
    L.push('_No Realize action returned an error in this session. The reported problem is likely about the **content** of an answer rather than a failed call — see the transcript below._');
  } else {
    for (const f of failed) {
      L.push(`### \`${f.name}\` — failed${f.ts ? ` at ${f.ts}` : ''}`);
      L.push('');
      L.push('Parameters sent:');
      L.push('```json');
      L.push(truncate(redact(JSON.stringify(f.input, null, 2)), 800));
      L.push('```');
      L.push('Error returned:');
      L.push('```');
      L.push(f.error || '(no error text captured)');
      L.push('```');
      L.push('');
    }
  }
  L.push('');

  L.push('## 5. Realize actions attempted, in order');
  L.push('');
  if (!facts.realizeCalls.length) {
    L.push('_No Realize actions were called in this session._');
  } else {
    L.push('| # | Action | Result | Key parameters |');
    L.push('|---|---|---|---|');
    facts.realizeCalls.forEach((c, i) => {
      const status = c.ok === false ? '❌ failed' : c.ok === true ? '✅ ok' : '– no result';
      // The key is known here, so redact structurally rather than pattern-match
      // the rendered string. Collapse whitespace too: a newline inside a value
      // (creative titles and descriptions routinely have them) would end the
      // table row early and corrupt every row below it.
      const keys = Object.entries(c.input || {})
        .slice(0, 4)
        .map(([k, v]) => {
          // Serialize objects rather than letting String() flatten them to
          // "[object Object]". Realize targeting parameters are objects, and
          // those are exactly the writes whose payload PS most needs to see —
          // a truncated {"type":"EXCLUDE","value":[...]} still carries meaning.
          const raw = v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
          const safe = oneLine(`${k}=${redactValue(k, raw)}`);
          return safe.length > 48 ? `${safe.slice(0, 48)}…` : safe;
        })
        .join(', ');
      L.push(`| ${i + 1} | \`${c.name}\` | ${status} | ${escapePipes(keys) || '–'} |`);
    });
  }
  L.push('');
  L.push('---');
  L.push('');
  return L.join('\n');
}

function escapePipes(s) {
  return String(s).replace(/\|/g, '\\|');
}

function setOr(set, fallback) {
  return set && set.size ? [...set].join(', ') : `_${fallback}_`;
}

function renderTranscript(records) {
  const L = [];
  L.push('## 6. Full transcript');
  L.push('');
  L.push('_Credentials are redacted. Long tool outputs are truncated — Realize responses far less aggressively than other output, since they are the evidence. Account, campaign, and item IDs are preserved so the issue can be reproduced._');
  L.push('');

  // tool_use id -> whether it was a Realize call, so the result can be capped
  // by how diagnostic it is rather than uniformly.
  const realizeCallIds = new Set();
  for (const r of records) {
    const c = r.message && r.message.content;
    if (!Array.isArray(c)) continue;
    for (const block of c) {
      if (block.type === 'tool_use' && block.id && REALIZE_TOOL.test(block.name || '')) {
        realizeCallIds.add(block.id);
      }
    }
  }

  let n = 0;
  for (const r of records) {
    if (r.type !== 'user' && r.type !== 'assistant') continue;
    const content = r.message && r.message.content;
    const side = r.isSidechain ? ' _(background task)_' : '';
    const ts = r.timestamp ? ` · ${r.timestamp}` : '';

    if (r.type === 'user') {
      const text = extractText(content);
      const results = Array.isArray(content) ? content.filter((b) => b.type === 'tool_result') : [];
      if (text) {
        n++;
        L.push(`### 👤 User${side}${ts}`);
        L.push('');
        L.push(quote(truncate(redact(text), 4000)));
        L.push('');
      }
      for (const res of results) {
        // A report CSV is usually the whole case — "the CPA here disagrees with
        // the UI" is answered by the rows that produced it. At the old uniform
        // 2,000 chars only ~13 of 250 rows survived, so the disputed row was
        // typically gone. Bulk output from other tools stays tightly capped.
        const isRealize = res.tool_use_id && realizeCallIds.has(res.tool_use_id);
        const cap = isRealize ? MAX_REALIZE_RESULT_CHARS : MAX_RESULT_CHARS;
        const body = truncate(redact(extractText(res.content) || JSON.stringify(res.content || '')), cap);
        L.push(`<details><summary>${res.is_error ? '❌ ' : ''}Tool result${res.is_error ? ' (error)' : ''}</summary>`);
        L.push('');
        L.push('```');
        L.push(body);
        L.push('```');
        L.push('');
        L.push('</details>');
        L.push('');
      }
      continue;
    }

    if (!Array.isArray(content)) continue;
    const header = `### 🤖 Assistant${side}${ts}`;
    let wrote = false;

    for (const block of content) {
      if (block.type === 'text' && block.text && block.text.trim()) {
        if (!wrote) { L.push(header); L.push(''); wrote = true; }
        L.push(truncate(redact(block.text), 6000));
        L.push('');
      } else if (block.type === 'thinking' && block.thinking) {
        if (!wrote) { L.push(header); L.push(''); wrote = true; }
        L.push('<details><summary>Internal reasoning (why the plugin did this)</summary>');
        L.push('');
        L.push('```');
        L.push(truncate(redact(block.thinking), MAX_THINKING_CHARS));
        L.push('```');
        L.push('');
        L.push('</details>');
        L.push('');
      } else if (block.type === 'tool_use') {
        if (!wrote) { L.push(header); L.push(''); wrote = true; }
        const m = REALIZE_TOOL.exec(block.name || '');
        const label = m ? `Realize action: \`${m[1]}\`` : `Tool: \`${block.name}\``;
        L.push(`**${label}**`);
        L.push('');
        L.push('```json');
        L.push(truncate(redact(JSON.stringify(block.input || {}, null, 2)), 1200));
        L.push('```');
        L.push('');
      }
    }
  }

  if (!n) L.push('_No user messages were found in this transcript._');
  return L.join('\n');
}

function quote(s) {
  return s.split('\n').map((l) => `> ${l}`).join('\n');
}

// ---------------------------------------------------------------------------
// output location
// ---------------------------------------------------------------------------

/**
 * Compare paths on a single canonical form.
 *
 * Windows mixes separators freely — `path.join` yields backslashes while a
 * hand-written `--out` usually has forward slashes — and a raw string compare
 * silently fails across the two, so the cloud-sync warning would not fire on
 * exactly the folder it exists to catch.
 */
function normalizePath(p) {
  return path.resolve(String(p)).replace(/\\/g, '/').toLowerCase();
}

/** Folders synced to a cloud provider, which would upload the bundle on write. */
function cloudSyncedRoots() {
  return [process.env.OneDrive, process.env.OneDriveCommercial, process.env.OneDriveConsumer]
    .filter(Boolean)
    .map(normalizePath);
}

function isCloudSynced(p) {
  const target = normalizePath(p);
  return cloudSyncedRoots().some((root) => target === root || target.startsWith(`${root}/`));
}

/**
 * Nearest enclosing git working tree, or null.
 *
 * The bundle holds customer campaign data. Landing it inside a repo — above all
 * this one, which is public — puts it one `git add -A` away from being
 * published. SKILL.md tells the model not to do that, but instructions are not
 * a control; this is.
 */
function findGitRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Pick a destination. Desktop is the most findable place for a user who has to
 * attach the file to an email, but it is often OneDrive-redirected on
 * enterprise Windows (silently syncing customer data to the cloud), and a home
 * directory is sometimes itself a git repo under a dotfiles setup. Prefer a
 * folder that is neither; fall back to the OS temp directory, which is always
 * safe on both counts, rather than knowingly choosing a bad one.
 */
function defaultOutPath(sessionId) {
  const home = os.homedir();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const name = `realize-support-${stamp}-${String(sessionId).slice(0, 8)}.md`;

  const candidates = ['Desktop', 'Downloads']
    .map((d) => path.join(home, d))
    .concat([home])
    .filter((d) => fs.existsSync(d));

  const safe = candidates.find((d) => !isCloudSynced(d) && !findGitRoot(d));
  if (safe) return path.join(safe, name);

  const unsynced = candidates.find((d) => !findGitRoot(d));
  if (unsynced) return path.join(unsynced, name);

  return path.join(os.tmpdir(), name);
}

/** Add a numeric suffix until the name is free. */
function nextAvailablePath(p) {
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  for (let i = 1; i < 1000; i++) {
    const candidate = path.join(dir, `${base}-${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`could not find a free filename next to ${p}.`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const loc = findTranscript();

  if (loc.error) {
    console.error(`ERROR: ${loc.error}`);
    process.exit(1);
  }

  const records = parseTranscript(loc.file);
  const facts = analyze(records);
  const failed = facts.realizeCalls.filter((c) => c.ok === false);

  // PS asked for the user's own words as the subject, since case intake copies
  // the subject into the case Subject field. When the user described the problem
  // that description *is* the most faithful title available, and preferring it
  // removes the last model-authored field in the bundle. `--title` stays as the
  // fallback for a run with no description.
  const subject = args.complaint
    ? emailSubject(args.complaint, facts)
    : args.title || draftTitle(facts);

  // Rendered once and reused, so --preview does not pay for a full render and
  // then throw it away.
  const body = truncateToBytes(
    `${renderHeader(facts, subject, args.complaint, loc)}\n${renderTranscript(records)}\n`,
    MAX_BUNDLE_BYTES,
    `… [bundle truncated at ${Math.round(MAX_BUNDLE_BYTES / 1024 / 1024)} MB to stay email-attachable]`
  );
  let outPath = args.out || defaultOutPath(facts.sessionId);

  // A bundle inside a repo is one `git add -A` from being published, and this
  // plugin's own repo is public. Refuse an explicit --out that lands in a work
  // tree; the auto-chosen default already avoids them.
  const gitRoot = findGitRoot(path.dirname(path.resolve(outPath)));
  if (gitRoot && !args.allowGit) {
    throw new Error(
      // Deliberately does not name the override flag. The model that hits this
      // error reads the message as its next instruction, and what it should do
      // is pick a different path — not reach for a bypass on the one control
      // standing between customer data and a public repository.
      `${outPath} is inside the git repository at ${gitRoot}. This bundle contains ` +
        `customer campaign data and must never be committed. Write it somewhere ` +
        `outside the repository — your Desktop is the default and is already safe.`
    );
  }

  if (args.preview) {
    console.log('PREVIEW — nothing has been written yet.');
    console.log('');
    console.log(`Transcript      : ${loc.file}`);
    console.log(`Match confidence: ${loc.confidence}${loc.confidence === 'guessed' ? ` (⚠ ${loc.siblings} sessions in folder)` : ''}`);
    console.log(`Session ID      : ${facts.sessionId}`);
    console.log(`Window          : ${facts.firstTs || '?'} → ${facts.lastTs || '?'}`);
    console.log(`Messages        : ${facts.userTurns} from you / ${facts.assistantTurns} replies`);
    console.log(`Tool results    : ${facts.toolResults}`);
    console.log(`Realize actions : ${facts.realizeCalls.length} (${failed.length} failed)`);
    console.log(`Accounts        : ${facts.accountIds.size ? [...facts.accountIds].join(', ') : '(none seen)'}`);
    console.log(`Campaigns       : ${facts.campaignIds.size ? [...facts.campaignIds].join(', ') : '(none seen)'}`);
    console.log(`Local paths     : ${facts.cwd || '(none)'}`);
    console.log(`Skills invoked  : ${facts.skillsUsed.size ? [...facts.skillsUsed].join(', ') : '(none recorded)'}`);
    console.log(`Knowledge read  : ${facts.knowledgeFiles.size ? [...facts.knowledgeFiles].join(', ') : '(none recorded)'}`);
    console.log(`Email subject   : ${subject}`);
    console.log(`Would write to  : ${outPath}`);
    console.log(`Size            : ${Math.round(Buffer.byteLength(body, 'utf8') / 1024)} KB`);
    if (isCloudSynced(outPath)) {
      console.log('');
      console.log('WARNING: that folder is synced to OneDrive, so the file would upload to the');
      console.log('         cloud on write. Pass --out <path> to choose a local-only folder.');
    }
    return;
  }

  // Never clobber an existing file without being told to. The default path is
  // timestamped so collisions are unlikely, but --out is user-supplied and a
  // silent overwrite destroys whatever was there.
  if (fs.existsSync(outPath) && !args.force) {
    if (args.out) {
      // Explicit path: the caller named this file, so silently replacing it
      // would destroy something they chose.
      throw new Error(
        `${outPath} already exists. Choose a different --out path, or pass --force to overwrite it.`
      );
    }
    // Auto-generated name (second-resolution timestamp): two runs in the same
    // second are a collision, not a conflict. Step aside rather than fail.
    outPath = nextAvailablePath(outPath);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, 'utf8');

  console.log('WROTE');
  console.log(`Path        : ${outPath}`);
  console.log(`Size        : ${Math.round(Buffer.byteLength(body, 'utf8') / 1024)} KB`);
  console.log(`Subject     : ${subject}`);
  console.log(`Send to     : ${SUPPORT_EMAIL}`);
  console.log('Email body  : copy Section 1. Summary from the file');
  if (isCloudSynced(outPath)) {
    console.log('');
    console.log('NOTE: this folder is synced to OneDrive, so a copy has gone to the cloud.');
  }
}

// Exported so the redaction and parsing rules can be exercised directly by
// tests rather than re-typed into a test harness, where an escaping difference
// would prove nothing about this file.
module.exports = {
  redact,
  redactValue,
  oneLine,
  parseArgs,
  analyze,
  truncateToBytes,
  REALIZE_TOOL,
  draftTitle,
  emailSubject,
  renderSummary,
  knowledgeRef,
  EMAIL_PROLOG,
  MAX_SUBJECT_CHARS,
  isCloudSynced,
  normalizePath,
  findGitRoot,
  defaultOutPath,
  nextAvailablePath,
  renderTranscript,
  MAX_RESULT_CHARS,
  MAX_REALIZE_RESULT_CHARS,
};

// Guarded with a conditional rather than a top-level `return`, which is valid
// in CommonJS only and would become a syntax error if this file is ever ESM.
if (require.main === module) {
  runCli();
}

function runCli() {
  try {
    main();
  } catch (err) {
    // The audience is a non-technical user already having a bad day; a raw
    // stack trace exposing internal paths is not an acceptable failure mode.
    console.error('ERROR: could not build the support bundle.');
    console.error(`Reason: ${err && err.message ? err.message : String(err)}`);
    console.error('');
    console.error(`If this keeps happening, email ${SUPPORT_EMAIL} and mention this message.`);
    process.exit(1);
  }
}
