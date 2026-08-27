#!/usr/bin/env node
'use strict';

/**
 * Unit tests for the support-bundle builder.
 *
 * Run: node skills/support/scripts/test-build-bundle.js
 *
 * These exist as a file rather than an inline `node -e` because the rules under
 * test are full of backslashes, quotes, and dollar signs. Passing those through
 * a shell twice produced two false results during review — a "leak" and a
 * "failure" that were both artifacts of the harness, not the code. A file has
 * no shell layer.
 *
 * No dependencies, no framework: Node ships with Claude Code and that is the
 * only thing this may assume.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const b = require('./build-bundle.js');

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failures.push(detail ? `${name}\n      ${detail}` : name);
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// redaction — credentials out, business identifiers in
// ---------------------------------------------------------------------------

eq('JSON password scrubbed', b.redact('{"password": "dbadmin"}'), '{"password": "<redacted>"}');
eq('JSON access_token scrubbed', b.redact('{"access_token": "ya29.abcdef"}'), '{"access_token": "<redacted>"}');
eq('flat password= scrubbed', b.redact('password=hunter2supersecret'), 'password=<redacted>');
eq('flat client_secret= scrubbed', b.redact('client_secret=abcdef123456'), 'client_secret=<redacted>');
check('bearer token scrubbed', b.redact('Bearer sk-ant-api03-XXXXXXXXXXXX').includes('<redacted>'));
check('JWT scrubbed', b.redact('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig').includes('<redacted-jwt>'));

// Ad copy must survive. Over-redaction destroys the evidence the bundle exists
// to carry, which is worse than the leak it was guarding against.
eq('ad copy "Secret:" preserved', b.redact('title=Secret: Summer Sale'), 'title=Secret: Summer Sale');
eq('ad copy "Authorization:" preserved', b.redact('title=Authorization: How To Apply'), 'title=Authorization: How To Apply');
eq('ad copy "Password Manager" preserved', b.redact('name=Password Manager Review'), 'name=Password Manager Review');

// PS cannot reproduce an issue without these.
eq('account_id preserved', b.redactValue('account_id', 'advertiser_12345_prod'), 'advertiser_12345_prod');
eq('campaign_id preserved', b.redactValue('campaign_id', '98765'), '98765');
eq('structural redaction by key name', b.redactValue('password', 'anything at all'), '<redacted>');

// ---------------------------------------------------------------------------
// table-cell safety
// ---------------------------------------------------------------------------

check('newline collapsed for table cell', !/\n/.test(b.oneLine('a=Line one\nLine two')));
check(
  'object param serialized, not [object Object]',
  (() => {
    const v = { type: 'EXCLUDE', value: ['p1', 'p2'] };
    const raw = v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
    const cell = b.oneLine(`publisher_targeting=${b.redactValue('publisher_targeting', raw)}`);
    return cell.includes('EXCLUDE') && !cell.includes('[object Object]');
  })()
);

// ---------------------------------------------------------------------------
// truncation leaves valid markdown
// ---------------------------------------------------------------------------

{
  const src = `# H\n\n\`\`\`\n${'é'.repeat(400)}\nstill inside\n`;
  const out = b.truncateToBytes(src, 200, '[cut]');
  check('byte cap respected', Buffer.byteLength(out, 'utf8') < 400);
  check('code fence balanced', ((out.match(/^```/gm) || []).length) % 2 === 0);
  check('no replacement char left', !new RegExp('�').test(out));
  eq('under-cap input untouched', b.truncateToBytes('short', 200, '[cut]'), 'short');
}
{
  const src = '<details><summary>x</summary>\n\n```\ndata here that goes on\n';
  const out = b.truncateToBytes(src, 40, '[cut]');
  check('<details> closed on truncation', (out.match(/<\/details>/g) || []).length >= 1);
}

// ---------------------------------------------------------------------------
// destination safety
// ---------------------------------------------------------------------------

{
  // Build the fake root with path.join so no backslash literals are involved.
  const root = path.join('C:', 'Users', 'tester', 'OneDrive');
  const prev = process.env.OneDrive;
  process.env.OneDrive = root;

  check('OneDrive path flagged (native separators)', b.isCloudSynced(path.join(root, 'Desktop', 'f.md')));
  check(
    'OneDrive path flagged (forward slashes)',
    b.isCloudSynced(`${root.replace(/\\/g, '/')}/Desktop/f.md`)
  );
  check('non-OneDrive path not flagged', !b.isCloudSynced(path.join('C:', 'Users', 'tester', 'Downloads', 'f.md')));
  check('no false prefix match on OneDriveX', !b.isCloudSynced(path.join('C:', 'Users', 'tester', 'OneDriveX', 'f.md')));

  if (prev === undefined) delete process.env.OneDrive;
  else process.env.OneDrive = prev;
}

// Anchored to the checkout, not the caller's cwd, so the suite passes when run
// from anywhere.
check('this repo detected as a git work tree', b.findGitRoot(__dirname) !== null);
check('temp dir is not a git work tree', b.findGitRoot(os.tmpdir()) === null);
check('default destination is outside any git work tree', b.findGitRoot(path.dirname(b.defaultOutPath('abc12345'))) === null);

{
  const p = path.join(os.tmpdir(), `collide-${process.pid}.md`);
  fs.writeFileSync(p, 'x');
  const next = b.nextAvailablePath(p);
  check('collision yields a free name', next !== p && !fs.existsSync(next));
  fs.unlinkSync(p);
}

// ---------------------------------------------------------------------------
// result truncation is tiered by how diagnostic the output is
// ---------------------------------------------------------------------------

{
  const bigCsv = `Records: 250 | Total: 1830\n${Array.from({ length: 400 }, (_, i) => `itm_${i},creative ${i},1234.56,987,0.44,37,33.37`).join('\n')}`;

  const records = [
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', id: 'call_realize', name: 'mcp__realize-mcp__get_top_campaign_content_report', input: {} },
          { type: 'tool_use', id: 'call_bash', name: 'Bash', input: {} },
        ],
      },
    },
    {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'call_realize', content: [{ type: 'text', text: bigCsv }] },
          { type: 'tool_result', tool_use_id: 'call_bash', content: [{ type: 'text', text: bigCsv }] },
        ],
      },
    },
  ];

  const out = b.renderTranscript(records);
  const blocks = out.split('<details>').slice(1);
  check('two tool results rendered', blocks.length === 2);

  const realizeRows = (blocks[0].match(/^itm_/gm) || []).length;
  const bashRows = (blocks[1].match(/^itm_/gm) || []).length;

  check(
    'Realize result keeps far more rows than other output',
    realizeRows > bashRows * 5,
    `realize kept ${realizeRows} rows, bash kept ${bashRows}`
  );
  check(
    'Realize result keeps a diagnostically useful number of rows',
    realizeRows > 150,
    `only ${realizeRows} rows survived`
  );
  // ~42 chars per row against a 2,000-char cap lands near 47 rows.
  check('non-Realize output stays tightly capped', bashRows < 60, `bash kept ${bashRows} rows`);
  check('caps are actually different', b.MAX_REALIZE_RESULT_CHARS > b.MAX_RESULT_CHARS);
}

// ---------------------------------------------------------------------------
// tool matching
// ---------------------------------------------------------------------------

check('matches plugin MCP tools', b.REALIZE_TOOL.test('mcp__realize-mcp__search_accounts'));
check('matches claude.ai connector tools', b.REALIZE_TOOL.test('mcp__claude_ai_Realize_MCP__authenticate'));
check('does not match unrelated MCP tools', !b.REALIZE_TOOL.test('mcp__sage__assist'));
check('does not match plain tools', !b.REALIZE_TOOL.test('Bash'));

// ---------------------------------------------------------------------------
// email subject — the user's words become the case Subject
// ---------------------------------------------------------------------------

{
  const bare = { accountIds: new Set(), realizeCalls: [], firstUserText: '' };
  const withAcct = { accountIds: new Set(['advertiser_777_prod']), realizeCalls: [], firstUserText: '' };

  eq(
    'complaint used verbatim as subject',
    b.emailSubject('the CPA does not match the UI', bare),
    'the CPA does not match the UI'
  );

  // The whole reason user text is passed by file. If a subject ever shows
  // "2.40" the shell got hold of it again.
  check(
    'currency survives into the subject',
    b.emailSubject('reported $12.40, UI shows $18.90', bare).includes('$12.40')
  );

  eq(
    'account id appended for triage',
    b.emailSubject('spend is wrong', withAcct),
    'spend is wrong (account advertiser_777_prod)'
  );

  check(
    'newlines collapsed — a break truncates a real subject header',
    !/\n/.test(b.emailSubject('line one\nline two', bare))
  );

  check(
    'backticks stripped so the copy fence cannot close early',
    !b.emailSubject('the `spend` number is off', bare).includes('`')
  );

  {
    const long = 'x'.repeat(400);
    const s = b.emailSubject(long, withAcct);
    check('subject capped', s.length <= b.MAX_SUBJECT_CHARS, `got ${s.length}`);
    check('capped subject still carries the account', s.includes('advertiser_777_prod'));
  }

  // The complaint now travels into an email subject line, and users paste error
  // output they never read. Redaction runs before shortening.
  {
    const leaky = 'I got this error: Bearer sk-ant-api03-AAAAAAAAAAAAAAAAAAAA';
    check('token in a complaint never reaches the subject', !b.emailSubject(leaky, bare).includes('sk-ant-api03'));
    check('subject shows the redaction rather than dropping the line', b.emailSubject(leaky, bare).includes('<redacted>'));
  }

  // ...and the ad-copy rule still holds on the complaint: prose is not shredded.
  eq(
    'complaint prose with a colon keyword survives',
    b.emailSubject('the Secret: Summer Sale campaign is off', bare),
    'the Secret: Summer Sale campaign is off'
  );

  // Regression: account_id is an opaque API string with no length guarantee. A
  // naive `slice(0, MAX - suffix.length - 1)` goes negative and slices from the
  // end, which replaced the whole complaint with a bare "…" — deleting the user's
  // own words from the subject describing their own problem.
  {
    const huge = { accountIds: new Set(['a'.repeat(140)]), realizeCalls: [], firstUserText: '' };
    const s = b.emailSubject('spend is wrong for yesterday', huge);
    check('over-long account id does not blow the cap', s.length <= b.MAX_SUBJECT_CHARS, `got ${s.length}`);
    check('over-long account id does not eat the complaint', s.startsWith('spend is wrong'), `got ${JSON.stringify(s)}`);
  }

  // Review finding: with no complaint, emailSubject falls back to draftTitle,
  // which built the subject from raw chat text — a pasted token walked straight
  // into the email subject through the one door that skipped redaction.
  {
    const leakyChat = {
      accountIds: new Set(),
      realizeCalls: [],
      firstUserText: 'help, I get Bearer sk-ant-api03-BBBBBBBBBBBBBBBBBBBB when loading',
    };
    check('token in chat text never reaches a drafted title', !b.draftTitle(leakyChat).includes('sk-ant-api03'));
    check('drafted title shows the redaction instead', b.draftTitle(leakyChat).includes('<redacted>'));
    check(
      'backticks stripped from drafted title like the complaint path',
      !b.draftTitle({ accountIds: new Set(), realizeCalls: [], firstUserText: 'the `spend` is off' }).includes('`')
    );
  }

  // Review finding: --title / --title-file got oneLine() but neither the
  // MAX_SUBJECT_CHARS cap nor redaction — both only applied inside
  // emailSubject(), which the title path bypasses.
  {
    const long = b.parseArgs(['--title', 'y'.repeat(400)]);
    check('cli title clamped to the subject cap', long.title.length <= b.MAX_SUBJECT_CHARS, `got ${long.title.length}`);
    const leaky = b.parseArgs(['--title', 'crash log: api_key=sk-ant-api03-CCCCCCCCCCCCCCCCCCCC end']);
    check('token in a cli title never survives parsing', !leaky.title.includes('sk-ant-api03'));
  }

  // No complaint: must still be titled, never blank.
  check(
    'falls back to a drafted title with no complaint',
    b.emailSubject('', { accountIds: new Set(), realizeCalls: [], firstUserText: 'show me spend' }).length > 0
  );
}

// ---------------------------------------------------------------------------
// knowledge / skill attribution — which guidance was actually consulted
// ---------------------------------------------------------------------------

// The real checkout, so the default (root-less) call is exercised too.
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FAKE = path.join('C:', 'somewhere', 'plugin');

eq('knowledge file recognized', b.knowledgeRef(path.join(FAKE, 'knowledge', 'bidding.md'), FAKE), 'knowledge/bidding.md');
eq('guardrails recognized', b.knowledgeRef(path.join(FAKE, 'os', 'guardrails.md'), FAKE), 'os/guardrails.md');
eq('agent file recognized', b.knowledgeRef(path.join(FAKE, 'agents', 'realize-analyst.md'), FAKE), 'agents/realize-analyst.md');
eq('SKILL.md recognized', b.knowledgeRef(path.join(FAKE, 'skills', 'reports', 'SKILL.md'), FAKE), 'skills/reports/SKILL.md');
eq(
  'skill reference recognized',
  b.knowledgeRef(path.join(FAKE, 'skills', 'reports', 'references', 'csv-examples.md'), FAKE),
  'skills/reports/references/csv-examples.md'
);
eq('SKILL.md keeps its casing', b.knowledgeRef(path.join(FAKE, 'skills', 'x', 'SKILL.md'), FAKE), 'skills/x/SKILL.md');
eq('unrelated file in root ignored', b.knowledgeRef(path.join(FAKE, 'budget.md'), FAKE), '');
eq('non-markdown ignored', b.knowledgeRef(path.join(FAKE, 'knowledge', 'notes.txt'), FAKE), '');

// The false positive the root anchor exists to kill: a user's own directory that
// happens to be named like one of ours must not be reported to PS as guidance.
eq(
  'knowledge-shaped path outside the plugin root ignored',
  b.knowledgeRef(path.join('C:', 'Users', 'me', 'Documents', 'os', 'notes.md'), FAKE),
  ''
);
eq(
  'sibling directory sharing a prefix ignored',
  b.knowledgeRef(path.join('C:', 'somewhere', 'pluginX', 'knowledge', 'bidding.md'), FAKE),
  ''
);

// Default root: resolves against the actual checkout with no argument.
eq(
  'real plugin file resolves with no root argument',
  b.knowledgeRef(path.join(__dirname, '..', 'SKILL.md')),
  'skills/support/SKILL.md'
);
check('file outside the real checkout ignored', b.knowledgeRef(path.join(os.tmpdir(), 'knowledge', 'x.md')) === '');

// ---------------------------------------------------------------------------
// Summary section — mechanical, and says so
// ---------------------------------------------------------------------------

{
  const records = [
    {
      type: 'assistant',
      sessionId: 'sess-1',
      timestamp: '2026-08-10T10:00:00Z',
      message: {
        stop_reason: 'end_turn',
        content: [
          { type: 'text', text: 'working on it' },
          { type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'realize-plugin:reports' } },
          { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: path.join(ROOT, 'knowledge', 'bidding.md') } },
          { type: 'tool_use', id: 't2b', name: 'Read', input: { file_path: path.join('C:', 'Users', 'me', 'os', 'private.md') } },
          { type: 'tool_use', id: 't3', name: 'mcp__realize-mcp__get_campaign_breakdown_report', input: { account_id: 'acct_9' } },
          { type: 'tool_use', id: 't4', name: 'mcp__realize-mcp__search_accounts', input: { query: '123' } },
        ],
      },
    },
    {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 't3', is_error: true, content: [{ type: 'text', text: '403 Forbidden — not permitted' }] },
          { type: 'tool_result', tool_use_id: 't4', content: [{ type: 'text', text: 'ok' }] },
        ],
      },
    },
  ];

  const facts = b.analyze(records);
  eq('skill invocation captured', [...facts.skillsUsed].join(','), 'realize-plugin:reports');
  eq('knowledge read captured', [...facts.knowledgeFiles].join(','), 'knowledge/bidding.md');
  eq('two realize calls seen', facts.realizeCalls.length, 2);
  check('recorded Skill call not double-counted in otherTools', !facts.otherTools.has('Skill'));
  eq('Read still counted in otherTools', facts.otherTools.get('Read'), 2);

  const s = b.renderSummary(facts);
  check('summary opens with the PS prolog', s.includes(b.EMAIL_PROLOG));
  check('summary names the realize tools used', s.includes('get_campaign_breakdown_report') && s.includes('search_accounts'));
  check('summary names the skill used', s.includes('realize-plugin:reports'));
  check('summary names the knowledge read', s.includes('knowledge/bidding.md'));
  check('summary reports the account', s.includes('acct_9'));
  check('summary reports the failure count', /1 failed/.test(s));
  check('summary lists the failing action and its error', s.includes('403 Forbidden'));
  check('summary discloses that it is mechanical', /extracted mechanically/.test(s));
  check('summary points at the transcript', /Full transcript/.test(s));

  // Structural rather than keyword-based: prove the section contains no free
  // prose line at all, instead of hoping a blacklist anticipates the phrasing a
  // future edit would use.
  {
    const prose = s.split('\n').filter((ln) => {
      const t = ln.trim();
      if (!t) return false;                                    // blank
      if (t.startsWith('## ')) return false;                   // heading
      if (t.startsWith('- ')) return false;                    // fact bullet
      if (/^\*\*.+:\*\*$/.test(t)) return false;               // bold label
      if (t === b.EMAIL_PROLOG) return false;                  // PS-requested prolog
      if (t.startsWith('_') && t.endsWith('_')) return false;  // mechanical disclaimer
      return true;
    });
    check('summary contains no free prose lines', prose.length === 0, `unexpected: ${JSON.stringify(prose)}`);
  }

  // Empty session must still render a valid summary rather than throwing.
  const empty = b.analyze([]);
  const es = b.renderSummary(empty);
  check('empty session still summarizes', es.includes(b.EMAIL_PROLOG) && /none/.test(es));
}

// ---------------------------------------------------------------------------

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('');
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
