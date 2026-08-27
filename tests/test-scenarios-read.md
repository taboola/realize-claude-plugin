# Test Scenarios — Reads

Manual QA checklist for the plugin's read-only paths. These scenarios are safe against any account — no side effects, no state mutation. For destructive paths, see [`test-scenarios-write.md`](./test-scenarios-write.md), which requires the team's designated test account.

Scenarios are roughly ordered from simplest to most involved; later ones depend on state established by earlier ones (a resolved `account_id`, a known campaign, etc.).

---

## 1. Fresh install + OAuth

**Setup:** No prior Realize MCP configured. Fresh Claude Code session.

**User prompt:**
> "List my Realize accounts."

**Expected behavior:**
1. Claude detects the `realize-mcp` server in `.mcp.json`, attempts to connect.
2. Browser opens to Taboola SSO login.
3. After successful login, Claude calls `search_accounts` and returns a list of matching accounts with the opaque `account_id` string (e.g., `advertiser_12345_prod`) for each.

**Pass criteria:** OAuth browser flow completes without manual intervention; at least one account is returned.

---

## 2. Account selection with pagination

**User prompt:**
> "Find all accounts with 'test' in the name."

**Expected behavior:**
1. `search_accounts(query="test", page_size=10, page=1)`.
2. If results exceed 10, Claude offers to fetch additional pages (`page=2, 3, ...`) rather than bumping `page_size` beyond the hard cap of 10.
3. Claude lists account names + opaque `account_id` strings, asks which to use.

**Pass criteria:** Hard cap of `page_size=10` is respected; pagination is offered, not forced.

---

## 3. List campaigns for an account

**Prerequisite:** `account_id` resolved from scenario 1 or 2.

**User prompt:**
> "Show me my active campaigns."

**Expected behavior:**
1. Claude reuses the cached `account_id` (does not re-run `search_accounts`).
2. Calls `list_campaigns(account_id=...)`.
3. Filters to running/active campaigns by inspecting the `status` field (exact enum from the API response) and summarizes: count, combined spend, names of top few.

**Pass criteria:** No duplicate `search_accounts` call; summary is prose, not raw JSON dump.

---

## 4. Inspect a single campaign + its items

**Prerequisite:** Know one `campaign_id` from scenario 3.

**User prompt:**
> "Tell me about campaign <ID> and what creatives it's running."

**Expected behavior:**
1. `get_campaign(account_id=..., campaign_id=<ID>)`.
2. `list_items(account_id=..., campaign_id=<ID>)`.
3. Summary includes: objective, budget, status, creative count, any paused/rejected items flagged.

**Pass criteria:** Both tools are called; item-level status anomalies (if any) are surfaced.

---

## 5. Top-content report (sort by spend)

**User prompt:**
> "Which pieces of content drove the most spend in the last 7 days?"

**Expected behavior:**
1. Claude translates "last 7 days" to explicit ISO dates and echoes the range back.
2. Calls `get_top_campaign_content_report` with `sort_field="spent"`, `sort_direction="DESC"`, appropriate date params.
3. Parses the CSV, cites `Total` in the summary, lists the top 3–5 items with spend, clicks, CTR.

**Pass criteria:** Date window is explicit; output is prose with numbers (not CSV dumped verbatim); `Total` is cited.

---

## 6. Campaign breakdown report with filters

**User prompt:**
> "Break down spend by campaign for the last 30 days, only running campaigns."

**Expected behavior:**
1. `get_campaign_breakdown_report` with `account_id`, date range, and `filters={"campaign_status": "RUNNING"}` (or whatever key the upstream API uses for status — Claude may try a couple and verify `Total` changes).
2. Returns CSV, summarized as a ranked list with spend per campaign.

**Pass criteria:** `filters` param is used in the tool call (not post-hoc filtering alone) and `Total` reflects a narrowed scope vs. an unfiltered call. If upstream silently ignores the filter key, Claude falls back to post-processing and discloses the fallback to the user.

---

## 7. Campaign history report — no sort/filter

**User prompt:**
> "Give me campaign <ID>'s history for the last 2 weeks, sorted by spend descending."

**Expected behavior:**
1. Claude recognizes `get_campaign_history_report` does **not** accept sort/filter.
2. Calls the tool without sort, returns API default order (usually ascending by date).
3. Explains the limitation: "History comes back in date order — I can't sort it server-side. Would you like me to re-pull via the breakdown report, or reorder the rows locally in my summary?"

**Pass criteria:** Claude does not attempt an unsupported sort; it explains the limitation and offers an alternative.

---

## 8. Site/day breakdown with pagination

**User prompt:**
> "Show me the top 50 site/day rows for campaign <ID> this week."

**Expected behavior:**
1. `get_campaign_site_day_breakdown_report` with `page_size=50`, `sort_field="spent"`.
2. Summary cites `Total` and pages correctly if needed.
3. If further pages needed, `page_size` stays at 50 (not changed mid-flow).

**Pass criteria:** `page_size` is constant across pages; total scope is cited.

---

## 9. Optimization request — adequate data

**Prerequisite:** A campaign with at least two items, one with ≥500 clicks and clearly worse CVR than its siblings.

**User prompt:**
> "Campaign 12345 is underperforming. What should I do?"

**Expected behavior:**
1. The `optimize-campaign` skill activates.
2. Claude resolves `account_id`, then pulls `get_campaign_breakdown_report` and `get_campaign_site_day_breakdown_report` for the campaign, plus `get_top_campaign_content_report` at the account level for context. Date window is echoed in the summary.
3. Checks thresholds before prescribing: confirms daily spend ≥ 8× CPA goal and at least one item has ≥100 clicks. If either is missing, says so explicitly and does not prescribe.
4. Classifies the failure mode against the prescription rules (CTR × CVR × CPA) and names it (e.g., "High CTR, low conversion rate — this is typically a landing-page or creative-honesty issue, not a bid issue").
5. Prescribes a concrete UI action with the exact UI path (e.g., "Pause item 887003: Campaigns → open 12345 → Campaign Inventory → toggle item status").
6. Offers to re-verify via MCP after the user applies the change AND 3–7 days of fresh data have accrued.

**Pass criteria:** Classification cites at least two of CTR / CVR / CPA with real numbers. Prescription includes a specific UI path. Claude does **not** recommend simply "raise the bid" as the first response to high CPA.

---

## 9a. Optimization request — insufficient data (learning phase)

**Prerequisite:** A campaign <7 days old, or one with <500 total clicks.

**User prompt:**
> "Why is my brand-new campaign not getting conversions? Should I pause it?"

**Expected behavior:**
1. The `optimize-campaign` skill activates.
2. Claude pulls the campaign's history via MCP, sees the data is thin (either the age window or the click total is under threshold), and **refuses to prescribe**.
3. Surfaces the specific threshold that was missed: "the algorithm's learning phase is 7–10 days" or "the toolkit recommends at least 100 clicks per item before judging performance".
4. If daily spend is below 8× CPA goal, recommends **increasing the daily budget** before drawing any further conclusions.
5. Offers to revisit the diagnosis once the threshold is met.

**Pass criteria:** Claude does **not** recommend a pause, bid change, or targeting change on insufficient data. Names the exact threshold(s) that haven't been met.

---

## 10. Error handling — invalid account_id

**User prompt:** (after manually corrupting the cached `account_id`, or just passing a bogus one)
> "Pull campaigns for account bogus_account_xyz."

**Expected behavior:**
1. MCP returns an error (invalid account_id).
2. Claude surfaces the error verbatim.
3. Offers to re-run `search_accounts` to resolve a valid `account_id`.

**Pass criteria:** Error is not swallowed or hallucinated around; recovery path is offered.

---

## 11. Error handling — empty report window

**User prompt:** Pick a date range that predates the account's earliest data (e.g., 2015).
> "Show me top content from 2015."

**Expected behavior:**
1. CSV returns `Records: 0 | Total: 0 | ...`.
2. Claude does **not** fabricate a narrative. Says explicitly: "No records found for 2015 — either no campaigns ran in that window or the account is newer than that."

**Pass criteria:** Empty-result honesty; no hallucinated data.

---

## 12. Discovery — list audiences for an account

**Prerequisite:** `account_id` resolved.

**User prompt:**
> "What audiences are available for this account?"

**Expected behavior:**
1. The `discovery` skill activates.
2. Calls `search_audiences(account_id=...)` (no country filter unless the user supplied one).
3. Summarizes top results in prose with `audience_id` alongside display name so they can be pasted into a campaign-creation flow.

**Pass criteria:** `audience_id` values are surfaced verbatim (not coerced or re-cased); no `country_codes` filter is invented without the user asking for one.

---

## 13. Discovery — DMAs in a country

**User prompt:**
> "List all DMAs in the US."

**Expected behavior:**
1. The `discovery` skill activates.
2. Recognizes that `search_geos(dimension="dma", ...)` requires `country_code`.
3. Calls `search_geos(dimension="dma", country_code="US")`.
4. Returns the DMA list with codes + names.

**Pass criteria:** `country_code` is supplied as `US` (uppercase ISO-2), not `USA` or lowercase; tool is not called with `dimension="dma"` alone.

---

## 14. Discovery — publisher search with query

**Prerequisite:** `account_id` resolved.

**User prompt:**
> "Show me publishers matching 'news' on this account."

**Expected behavior:**
1. The `discovery` skill activates.
2. Calls `search_publishers(account_id=..., query="news")`.
3. Returns up to `page_size` (default 10, cap 50) publishers with `id`, `name`, `country`, `is_active`.
4. Offers pagination if the result is truncated.

**Pass criteria:** `page_size` is not pushed above 50; `query="news"` is passed through verbatim (no wildcard injection).

---

## 15. Discovery — list time zones

**User prompt:**
> "What time zones does Realize support?"

**Expected behavior:**
1. The `discovery` skill activates.
2. Calls `list_time_zones()` (no params).
3. Returns the IANA names. Claude offers to filter to a region if the list is long.

**Pass criteria:** No `account_id` is sent (this is a global catalog); output is summarized, not dumped raw.

---

## 16. Discovery — list CTA types

**User prompt:**
> "What CTA button options are available for native items?"

**Expected behavior:**
1. The `discovery` skill activates.
2. Calls `list_cta_types()` (no params).
3. Returns the enum values verbatim.

**Pass criteria:** No `account_id` is sent; values are presented as the exact enum strings the user would paste into a campaign setup.

---

## 17. Support bundle — capture a session for Professional Services

**Setup:** run at least one real Realize action first (e.g. scenario 5) so the bundle has actions to report.

**User prompt:**
> `/realize-plugin:support the CPA showed $12.40 but the Realize UI shows $18.90 for the same range`

The currency amounts are the point of this scenario, not decoration — see the pass criteria.

**Expected behavior:**
1. The `support` skill activates.
2. Runs the builder with `--preview`. **Nothing is written yet.**
3. Reports back in plain language: turn count, approximate file size, the account IDs involved, and that local folder paths are included. States that credentials are stripped and nothing is transmitted.
4. Asks for explicit confirmation via `AskUserQuestion`.
5. On confirm, writes the file and reports the path, the suggested case title, and `Support@taboola.com` as the destination.

**Pass criteria:**
- No file exists on disk before the user confirms.
- The text after the command appears **verbatim** in the bundle's "What the user reported" section — not paraphrased, not "improved".
- **`$12.40` and `$18.90` appear intact.** If they render as `2.40` / `8.90`, the complaint was passed as a quoted shell argument and the shell ate `$1` — the skill must write it to a file and use `--complaint-file`. Regression test for silent corruption of the exact figures the case is about.
- The counts are the conversation, not the log: "Messages from the user" matches what the human actually typed (a 7-message exchange reads 7, not 60+); tool results are counted separately.
- **Section 5's table is not broken.** Every row renders as one row. A creative title or description containing a newline must not split a row — that corrupts the table from that point down.
- **The email subject is the user's own sentence**, not a title written about it — `$12.40` / `$18.90` intact, one line, account ID appended. It appears in a copy-ready fenced block under "How to send this to Support".
- **Section 1 (Summary) opens with** *"This case has been created by the Realize Plugin…"* and lists the Realize tools called, skills invoked, and knowledge files read (e.g. `os/guardrails.md`, `skills/reports/SKILL.md`).
- **Section 1 contains no narrative** — no sentence describing what the plugin thought, intended, or got wrong. Counts, tool names, and file paths only, closing with the line stating it is mechanically extracted. A prose account here is a fail even if accurate: it's the one thing the bundle must not carry.
- **Ad copy survives redaction.** If the session touched a creative headed *"Secret: Summer Sale"* or similar, it appears intact. Redaction targets credentials, and mangling creative text defeats the purpose of the bundle.
- Re-running the command does not overwrite an earlier bundle; the second run either picks a new timestamped name or refuses.
- The suggested title names the symptom and includes the account ID; it does **not** assert a cause.
- Section 5 lists every Realize action attempted in order with its result.
- `grep -iE '"(access_token|refresh_token|password|client_secret)"\s*:\s*"[^<]' <file>` returns nothing.
- `account_id` / `campaign_id` values **are** present (PS needs them to reproduce).
- The file is written outside the plugin repo — it contains customer data and must never land in a git working tree.
- The preview reports match confidence `exact`. If it reports `guessed`, the skill must say so and offer to cancel.

---

## 18. Support escalation is offered on a failed action — but not otherwise

**Part A — offered.** Trigger a failing action (scenario 10's invalid `account_id` works).

**Expected behavior:** after explaining the failure and the retry path, the answer ends with a single italic line offering `/realize-plugin:support`.

**Pass criteria:**
- Exactly one sentence, offered **once**. Not repeated on the next answer.
- The scope footer is not also present on that answer — one or the other, never both.
- It does not describe what the bundle contains or list its sections.

**Part B — not offered.** Run a normal successful report (scenario 5) with no complaint.

**Pass criteria:** no support line appears. Offering escalation on an answer the user hasn't questioned reads as low confidence and is a fail.

**Part C — implicit intent.** After any answer, say *"can I talk to a real person about this?"*

**Pass criteria:** routes to `support` rather than replying that it can't connect the user to a human.
