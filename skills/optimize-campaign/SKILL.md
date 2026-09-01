---
name: optimize-campaign
description: Diagnose a Realize campaign that's underperforming or had a discrete performance event, and prescribe fixes. Walks 5 mandatory pre-checks then routes to RCA (when something broke on a specific date) or general optimization (ongoing review). Activates on questions like "why is this campaign underperforming?", "CPA spiked yesterday", "what should I pause?", "how do I improve CPA?", "campaign isn't spending", "lead quality is bad", "performance has plateaued".
allowed-tools: ["Read", "Bash", "AskUserQuestion"]
---

# Optimize Campaign

Data-driven diagnosis and recommendation loop for a Realize campaign. Pulls performance data via the MCP, applies mandatory pre-checks, then routes to one of two diagnostic paths and prescribes concrete next actions.

## Internal vs user-facing terminology — never leak the framework names

The framework labels in this file (*"pre-checks P1–P5"*, *"RCA — 6-signal framework"*, *"Signal 1 / Signal 2 / Signal 6"*, *"residual signal"*, *"creative restructure shock"*) are **internal scaffolding** for the model. **Never surface them in user-facing output.** Per `os/guardrails.md`, do the work and describe the actual finding in plain English.

| Internal label (this file uses) | What to say to the user |
|---|---|
| *"mandatory pre-checks"* / *"running P1–P5"* | Just do the checks silently. If a check matters to the answer, describe the finding ("the campaign has no conversion goal attached"). |
| *"RCA — root cause analysis"* (without expansion) | Either say *"root cause analysis"* in full, or just present the analysis. Don't label the process. |
| *"Signal 1 (config change) → Signal 2 (supply concentration) chain"* | Describe the actual sequence: *"The Feb 13 block redirected spend to Yahoo Homepage, which then served lower-engagement slots — that's what shows up as the CTR drop."* |
| *"silent failure mode"* / *"silent diagnostic-quality killer"* | Describe what's wrong factually: *"The campaign doesn't have a conversion goal attached, so the optimizer doesn't know what to bid toward."* No "silent" anything. |
| *"residual signal — never the default"* | Don't surface the framework hierarchy. Just present the conclusion. |

The framework helps you think; the user needs the conclusion, not the framework.

**Depth:** The substantive depth (dimensional drill-down rules, supply-side eligibility, creative-fatigue tiers, bid-lever matrix, symptom-class branches, common-mistake table, output discipline) lives in `references/optimization-flow.md`. Read it when a branch fires that needs operational specifics.

## When to use

Trigger on any of these — across the two paths below:

**RCA (something broke on a specific date)**
- "CPA spiked yesterday" / "conversions dropped this week" / "it broke on date X"
- "Why isn't my campaign spending today / since [date]?"
- "What happened to the campaign after I made [change]?"

**General optimization (no specific event)**
- "Why is this campaign underperforming?" / "How do I improve CPA?"
- "What should I pause / cut / scale up?"
- "Performance has plateaued — what's next?"
- "Lead quality is bad" / "Which sites should I block?"

If the user asks to *create* a new campaign — or to apply any of the prescriptions below (pause an item, bump a budget, change a bid, edit targeting) — route to the `manage-campaigns` skill, which calls the MCP write tools behind a preview-then-confirm gate.

## Prerequisites

- `account_id` resolved via the `accounts` skill.
- A specific `campaign_id` in scope, or the user asking "across my whole account". For single-campaign questions, identify the campaign first via the `campaigns` skill if needed.

## Pre-checks (mandatory — never skip)

Before any analysis, run all five. Skipping leads to wrong conclusions.

| # | Pre-check | Action | Why |
|---|---|---|---|
| **P1** | **Tracking health** | Pull `get_campaign_history_report` over the date window. Confirm conversions > 0 if clicks > 0. | A broken pixel makes every downstream metric meaningless. |
| **P2** | **Campaign-level conversion goal verified** | Use `get_campaign` to read the campaign's `conversion_rules` / goal mapping. If no campaign-level goal is set, the campaign is **inheriting the account default** — the optimizer targets the most frequent conversion marked "include in total" at the account level. This is a **valid configuration when the include-in-total settings are sensible**, not a failure mode. Surface to the user what the campaign is actually optimizing toward (read it from the account's conversion-rules list) — don't assume the KPI from spend volume. | Wrong KPI = wrong diagnosis. Account-default routing is fine when configured deliberately; only flag it as a problem if the account's include-in-total events don't match what the user is trying to optimize for. |
| **P3** | **Active conversion events only** | Filter out archived / disabled conversions when reading conversion data. | Dead events inflate the apparent drop and produce phantom CPA values. |
| **P4** | **Bid-strategy cross-check** | Read the campaign's `bid_strategy` + `pricing_model`. Map every proposed action against the bid-lever matrix in `references/optimization-flow.md`. If the action is not valid for the strategy, reframe before delivering. | Per-publisher bid moves don't exist on Maximize Conversions / Target CPA / Maximize Value. Per-item bids don't exist on any strategy. Recommending them is a credibility failure. |
| **P5** | **Learning-period guard** | See "When P5 fires" below for the full rule + the user-facing message. | The Realize algorithm hasn't stabilised yet — recommendations made during learning reset the timer. |

### When P5 fires

A campaign satisfies the Learning-Period guard when ALL three hold:

1. Created within the **last 7 calendar days**, AND
2. Fewer than **30 conversions** on its goal in lifetime, AND
3. Has not completed its bid-strategy learning window (5-7 days for Maximize Conversions / Target CPA / Maximize Value — a sub-window inside the broader 7-14 day campaign learning phase).

If the guard fires:

- **Label** the campaign as **"Learning period"** — never "Underperforming," "Failed," or "Bad performance."
- **Do NOT recommend** bid changes, Target CPA changes, or daily-cap changes.
- **Do NOT use** the campaign's metrics in cross-campaign benchmarks or reallocation math.
- **Acceptable actions:** Hold (do nothing), Pause (only if account-wide damage is severe), or Wait.
- **Re-evaluate** after 7 days + 30 conversions.

**Message the user in plain language first** (before the operator-facing label):

> "This campaign is in its learning phase — the first 7 days where Realize's algorithm is figuring out which audiences, sites, and times convert best for you. CPA often looks high during this period because the algorithm is testing. Making changes (pausing, adjusting budget, swapping creatives) during learning resets the timer and starts the process over. The recommended action is to **wait** until the campaign has had at least 7 days AND 30 conversions, then re-evaluate."

**Special learning cases:**
- A duplicate of an existing campaign inherits learning from its source within ~24h. Treat as mature after Day 2.
- A campaign re-launched after > 14 days of no spend is effectively learning again — treat as Learning even if `start_date` is old.
- A conversion-goal swap restarts learning even on a mature campaign.

**Exit criteria from pre-checks:** Do not advance past the pre-checks if tracking is broken (P1) or the campaign is in Learning period (P5).

## Two paths — pick by user framing

| Use this path when | Framework |
|---|---|
| User reports a discrete event: "it broke on date X" / "CPA spiked yesterday" / "conversions dropped this week" | **RCA — 6-signal framework** (below) |
| Ongoing review, no specific drop: "optimize this campaign" / "what should I change" / "performance has plateaued" | **General optimization — 7-point framework** (below) |

Both paths share the dimensional drill-down, supply-side eligibility check, and creative-fatigue check — all in `references/optimization-flow.md`.

## RCA path — 6-signal framework

When the user reports a discrete drop, walk these 6 signals in order. The first match usually wins. Run signals 1-5 in parallel against the same campaign; signal 6 is a coordinated-restructure check that runs alongside.

| # | Signal | What to check | Evidence pattern |
|---|---|---|---|
| 1 | **Config change** | Campaign / targeting / tracking changelog over the 7 days before the drop. **If the MCP doesn't return a config changelog (today's `get_campaign_history_report` returns performance time-series, not change events), fall back to asking the user directly:** *"In the 7 days before the drop, did you change anything on the campaign — budget, bid strategy, targeting, blocks, creatives, conversion event? If yes, what and when?"* Use the answer as Signal 1 input. **Do NOT silently skip Signal 1.** | A change within 3 days of the drop = candidate. |
| 2 | **Supply shift** | Pre-drop vs post-drop publisher mix. Check for: top publisher losing ≥ 5% share, new competitive-filter / brand-safety blocks appearing, publishers manually blocked / paused. | Any top-3 publisher losing ≥ 10% combined share, or a CF block appearing for the first time. |
| 3 | **Creative fatigue / issue** | Top-5 active ads ranked by spend, CTR week-over-week, frequency trend. **Also check paused ads** — a top performer that was paused looks identical to fatigue in the aggregate. | Frequency > 4, CTR decay ≥ 30% from peak, or ad status changed to PAUSED. |
| 4 | **Tracking break** | Conversion-event fired / matched / attributed ratios, 14 days before drop vs after. | Any ratio shifted by > 20%. |
| 5 | **External / algo lifecycle** | Bid-strategy state — is the algo in learning, stable, underfunded? Auction insights. Market seasonality. | No config / supply / creative / tracking change AND the algo state matches a known lifecycle phase. **Residual signal — never the default.** |
| 6 | **Creative restructure shock** | Cluster item-level changes by hour. If ≥ 3 distinct campaigns had item-level changes in the same hour AND a CPA / ROAS break followed within 48h, flag as restructure shock. | Coordinated pause-old + launch-new on the same day → 24-48h CPA break, 5-7 day recovery. |

**Golden rule:** Only conclude "external / algo" AFTER ruling out signals 1-4 and 6. "External" is the residual, never the default.

**Ranking candidates within a signal:** each candidate has **weight × behavioural difference**. Weight = share of spend before the drop. Behavioural difference = how much this item diverged from campaign average. A 3%-share publisher with a 50% CVR delta is **not** the driver. A 25%-share publisher with a 30% CVR delta **is** the driver.

**Output shape (RCA):** the single strongest story, not a laundry list.

```
ROOT CAUSE: Publisher <name> (ID <id>) dropped from <X>% → <Y>% of spend
starting <date>, after <triggering event>. Post-event CPA rose from $<A> → $<B>
because spend redistributed to <N> lower-CVR publishers. No other changes detected.
```

Then **max 2 actions**: reverse the change (if reversible) or work around it (duplicate / expand supply / add creative).

## Optimization path — 7-point framework

When the user asks for an ongoing optimisation (no specific drop), walk this in order. Most issues resolve by point 4.

| # | Principle | Action | Read |
|---|---|---|---|
| 1 | **Average = outliers** | Identify outlier segments via the dimensional drill-down in `references/optimization-flow.md`. Consider excluding the worst. | `knowledge/site-management.md`, `knowledge/custom-rules.md` |
| 2 | **Don't be hasty** | Apply the data-sufficiency thresholds in `references/optimization-flow.md`. Use longer lookback windows. | `knowledge/custom-rules.md` |
| 3 | **Leverage tools** | SpendGuard (automated, on by default), Custom Rules (semi-automated — only AFTER the campaign has finished the learning phase; for newer advertisers, monitor 1-2 weeks before any rule), conditional filters (manual). | `knowledge/custom-rules.md` |
| 4 | **Tap into new supply** | Mail, predictive audiences, retargeting, Apple News, Lockscreen. | `knowledge/environments.md`, `knowledge/targeting.md` |
| 5 | **Refresh creatives** | Apply the fatigue tier check in `references/optimization-flow.md`. Refresh = new angle, not a word change. | `knowledge/creative.md` |
| 6 | **Check data volume** | Add a secondary conversion event if the signal is thin. | `knowledge/tracking.md` |
| 7 | **Scale top performers** | Pull the account-average CPA down by adding good-CPA volume. | `knowledge/budget.md` |

### Symptom-class branches

After the 7-point walk, the symptom usually maps to one of these branches — full text in `references/optimization-flow.md`:

| Symptom | Depth-file branch |
|---|---|
| CPA fluctuating (not a single drop) | §7.1 CPA fluctuating — by bid strategy |
| Low CVR (CPA acceptable) | §7.2 Low CVR (CPA acceptable) |
| Underspending / not delivering | §7.3 Underspending / not delivering |
| Lead quality bad (performance acceptable) | §7.4 Lead quality |
| Plateau / gradual decline | §7.5 Plateau |
| CPA + CVR both underperforming | §7.6 Combined (CPA + CVR both underperforming) |

## Common action prescriptions

For each prescription below, hand off to `manage-campaigns` for application (it owns the MCP write tools and the preview-then-confirm gate). After the user confirms the write completed, re-verify via the MCP read tools (`get_campaign` / `list_items` / `get_campaign_history_report`) and re-pull the relevant report after a data window (typically 3–7 days, accounting for the change-class lag in `references/optimization-flow.md`). For prescriptions still UI-only (Custom Rules, audience uploads, pixel installation, codeless-conversion setup, pixel test-fire), `manage-campaigns` walks the user through the Realize UI fallback. **Conversion-rule changes are no longer UI-only** — creating a rule, adjusting an attribution window, or retiring a rule are MCP writes that go through the same gate.

- **Pause an underperforming item** — Campaigns → open campaign → Campaign Inventory → toggle item status.
- **Block a site** — Campaigns → open campaign → Advanced Options → Block Sites. Run the historical-top-N guard (in `knowledge/site-management.md`) before recommending.
- **Adjust daily budget** — Campaigns → open campaign → Budget. Per-change cap: 20%. Per cadence: every 2-3 days.
- **Add a Target CPA** — Campaigns → open campaign → Bid Strategy → Target CPA. **Last-resort lever only** (see `knowledge/bidding.md`). Set within 10-20% of stable CPA after 3-4 days of delivery — never at launch, never aspirational.
- **Refresh creatives significantly** — Campaigns → Campaign Inventory → +New Item. Recommended: 3 distinct titles + 3 unique images per campaign; 4–6 items per campaign for algorithm testing, never more than 10.
- **Tighten / broaden targeting** — Campaigns → open campaign → Location / Platform / Audiences.
- **Isolate a top performer** — create a new campaign containing only the winning item(s) at a fresh learning state.

## Output discipline — the two gates

**Gate 1 — Chat output by default.** This skill answers in the terminal/chat. Concrete, scannable, lead with the action.

**Gate 2 — Actions-only filter.** Output lists ACTIONS the user should take — not a narrative of what was analysed. Data and context appear ONLY when they explain *why* an action was recommended. Every bullet must answer: *"What do I do differently because of this?"* If a line doesn't recommend a change, it doesn't belong in the output.

## Hand-off to the depth file

Read `references/optimization-flow.md` when:

- A dimensional drill-down or supply-side eligibility check is needed (statistical-volume tiers, auction insights, blockers, narrow-targeting routing, concentration risk).
- A symptom-class branch fires (CPA fluctuation, low CVR, underspending, lead quality, plateau, combined).
- The bid-lever quick-reference / lag-effect table / signal-interpretation tables / common-mistake patterns are needed.

## Guardrails (high-level — full list in `references/optimization-flow.md`)

- Never skip pre-checks P1-P5.
- Never label a Learning-period campaign as "underperforming."
- Never conclude "external / algo" without ruling out signals 1-4 + 6 in the RCA path.
- Never recommend per-item bid changes (don't exist on any strategy) or per-publisher bid moves on Maximize Conversions / Target CPA / Maximize Value (only block / unblock / whitelist).
- Never recommend a budget reduction *as an optimisation lever* for high CPA. Budget corrections for stated user errors (e.g., "I set my daily budget to $10,000 by mistake, should be $100") are fine.
- Never recommend switching TO Fixed Bid as a "fix" — it disables algorithmic optimisation.
- Never set Target CPA at launch or aspirationally — it is a last-resort lever (see `knowledge/bidding.md`).
- Never recommend a creative refresh that's a word change — refresh = new angle.
- Always pair every observation with a concrete action item.
- Always label the attribution model on every CPA / CVR / Lead / ROAS figure.
- Always state the source of every claim (which MCP report, which date window, which row count).
