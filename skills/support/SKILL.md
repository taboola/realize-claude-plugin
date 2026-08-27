---
name: support
description: Package the current conversation into a single Markdown file the user can email to Taboola Support so Professional Services can debug what happened. Activates on /realize-plugin:support, and whenever the user wants to escalate to a human, report that the plugin gave a wrong or suspicious answer, or file a bug. Writes one local file after an explicit confirmation — never transmits anything.
allowed-tools: ["Read", "Bash", "AskUserQuestion"]
---

# Support Bundle

Turns the current session into a support case file for Taboola Professional Services (PS).

Users run the plugin in their own terminal, so PS has no visibility into these conversations. When someone says "the plugin gave me the wrong number", PS currently has only that sentence. This skill hands them the actual transcript instead.

## When to use

- The user runs `/realize-plugin:support` — plugin components are namespaced, so a bare `/support` is not a valid invocation.
- The user says the plugin gave wrong, stale, or suspicious information and wants it looked at.
- The user asks to talk to a person, open a ticket, or escalate.
- The user hit an error they can't get past and wants help.

**Not** for answering product questions or diagnosing campaign performance — those belong to the normal skills. This skill only packages evidence.

## The one rule that matters

**The transcript is the deliverable.** Everything above it in the file is mechanically extracted from the transcript by the script — never written from your own recollection of the conversation.

This is deliberate. If the plugin misread the user, a summary written by the plugin carries that same misreading into the bug report. Only the raw exchange is independent of the bug. So: do not editorialize, do not explain away what happened, and do not "clean up" the user's complaint.

**Section 1 (Summary) is not an exception.** It exists because PS pastes it into the case Description, but every line in it is a count, a tool name, or a file path pulled from the log — never a narrative. It reports *which* Realize tools ran, *which* skills were invoked, and *which* knowledge files were read, so PS can tell "the plugin had the right guidance and still got it wrong" apart from "the plugin never read the guidance". Those are different bugs. Do not add a prose account of what went wrong to that section.

**You write nothing into this bundle.** The case subject is now the user's own complaint text, so there is no field left for your judgment.

## Workflow

### Step 1 — Preview (never skip)

```bash
node skills/support/scripts/build-bundle.js --preview
```

Writes nothing. Prints what would be captured: session ID, time window, turn counts, Realize actions attempted and how many failed, account/campaign IDs involved, local paths, and estimated file size.

### Step 2 — Show the user what's about to leave their machine

This file contains their real campaign data — budgets, spend, account IDs — plus their local folder paths. They must see that before a file exists.

Present the preview in plain language:

> This will save a file containing our whole conversation — **28 messages**, covering **account 1721090**, about **95 KB**.
> It includes the campaign data shown in this session and your local folder path. Credentials and tokens are removed automatically.
> Nothing is sent anywhere — the file is saved to your Desktop and you choose whether to email it.

Then confirm with `AskUserQuestion`: create the file, or cancel.

If the preview says match confidence is **guessed**, tell the user plainly: the exact session couldn't be identified and this may be the wrong conversation. Let them cancel.

### Step 3 — The case subject writes itself

**Do not compose a title.** The script uses the user's own complaint as the email subject, collapsed to one line, capped for a subject header, with the account ID appended for triage. Case intake copies that subject into the case Subject field, and the user's sentence is the most faithful description of their own problem available.

`--title-file` still exists, but only as the fallback for a run where the user gave no description at all. If they described the problem, the description is the subject.

### Step 4 — Write the file

**Never pass the complaint or title as a quoted shell argument.** Write them to files first, then point the script at the files:

1. `Write` the user's description verbatim to `complaint.txt` (use the session scratchpad or the system temp folder — never the plugin repo).
2. Run:

```bash
node skills/support/scripts/build-bundle.js --write \
  --complaint-file <path>/complaint.txt
```

This is not a style preference. The shell rewrites this text: `$12.40` arrives as `2.40`, `$500` arrives as `00`, and backticks or `$(…)` **execute**. Complaints in this domain are full of currency amounts, and users paste error text they didn't write. The whole point of the bundle is that the evidence reaches PS unaltered, so it must not pass through the shell.

`--complaint` / `--title` still exist for trivial ASCII with no `$`, backticks, or quotes. When in doubt, use the file form.

The complaint is the user's own description — use their words. If they ran the command with no description, ask one short question ("In one line, what went wrong?") and pass the answer through unedited. Don't write it for them.

`--out <path>` overrides the destination. Default is Desktop, then Downloads, then home folder — skipping any that OneDrive has redirected to the cloud.

### Step 5 — Tell them how to send it

Three parts, because case intake maps each one to a different field. The file's own "How to send this to Support" section says the same thing — repeat it in chat so they don't have to open the file to know what to do:

> Saved to `C:\Users\you\Desktop\realize-support-2026-08-09-...md`
>
> Email it to **Support@taboola.com**:
> - **Subject:** *the CPA in the report doesn't match the UI (account 1721090)*
> - **Body:** copy **Section 1. Summary** from the file
> - **Attach the file** so Support has the failed actions and full transcript

Say plainly that nothing was sent automatically — sending is their decision.

Then delete the scratch `complaint.txt` you created in Step 4. It holds the user's description of their problem and serves no purpose once the bundle exists.

## What the bundle contains

| Section | Purpose |
|---|---|
| How to send this to Support | Copy-ready subject, which section is the email body, and the reminder to attach the file |
| 1. Summary | **Pasted into the case Description.** Opens with the PS-requested prolog, then session facts, Realize tools used, skills invoked, knowledge files read, and any failures. Mechanically extracted — no narrative |
| 2. At a glance | Session ID, timestamps, turn counts, accounts/campaigns/items involved, actions attempted, **failed count**, plugin + Claude Code version, platform |
| 3. What the user reported | The `--complaint` text, verbatim. Also the source of the email subject |
| 4. Failed actions | Every failed Realize action with parameters sent and the error returned |
| 5. Realize actions attempted, in order | Ordered table of every Realize action and its result |
| 6. Full transcript | Every message, tool call, and result — with internal reasoning in collapsible blocks |

## Privacy

- **Nothing is transmitted.** The script writes one local file. There is no upload path, by design.
- **Credentials are stripped**: bearer tokens, `access_token`, `refresh_token`, `api_key`, `password`, `client_secret`, and JWTs.
- **Business IDs are kept.** `account_id`, `campaign_id`, and `item_id` are preserved on purpose — PS cannot reproduce an issue without them.
- **Local paths are included** as diagnostics, and the preview says so.
- Never write the bundle into the plugin repo or any git working tree — it contains customer data. Default destinations are outside the repo; keep it that way.

## Gotchas

- **Session identification** comes from `CLAUDE_CODE_SESSION_ID`. A project folder usually holds several sessions, so the "newest file" fallback is genuinely unreliable — that's why the preview reports match confidence, and why `guessed` must be surfaced to the user.
- **The current turn is mid-write.** The transcript is complete up to roughly the user's command message; the assistant reply being composed right now isn't in it yet. Harmless, but don't promise it captured "everything including this reply".
- **Large sessions get truncated.** Tool results cap at 2,000 characters, user messages at 4,000, internal reasoning at 1,200, and the bundle at 8 MB to stay email-attachable. Truncation is marked inline and never leaves a code fence or `<details>` block unclosed. If a specific large CSV matters to the case, tell the user to attach it separately. Transcripts above 256 MB are refused outright with an explanation rather than crashing.
- **An unreadable `--complaint-file` is fatal, and that's deliberate.** It exits 1 without writing. Continuing would produce a bundle stating *"The user did not add a description"* about a user who did describe the problem — a false statement to support is worse than no bundle. It would also silently drop the email subject, since the subject is derived from the complaint. If you see that error, check the path you wrote to.
- **The script refuses to overwrite.** If `--out` points at an existing file it exits 1 rather than clobbering it. Pass `--force` only when the user has asked to replace that specific file. (An auto-generated default name that collides simply gets a `-1` suffix — no error.)
- **The script refuses to write inside a git repository**, including this one, and exits 1. The bundle holds customer campaign data and this plugin's repo is public, so a bundle committed by accident is a data leak. If you see that error, choose a path outside the repo — the default destination already is one.
- **Unit tests:** `node skills/support/scripts/test-build-bundle.js` covers the redaction rules, table-cell safety, truncation, and destination guards. Run it after touching the script; CI runs it too.
- **No Realize actions in the session** is normal and not an error — it usually means the complaint is about the *content* of an answer, not a failed call. The bundle says so explicitly.
- **Node is required** and always present, since Claude Code itself runs on Node. Do not add a Python path.

## Example prompts

```
/realize-plugin:support
/realize-plugin:support the CPA number doesn't match what I see in the UI
"This gave me the wrong budget — how do I report it?"
"Can I get a human to look at this?"
"I want to open a ticket about this."
```
