# Reach Estimation

## Overview

Reach estimation answers two related questions: **what reach can a planned (not-yet-created) campaign expect?** and **is an existing campaign too narrowly targeted to deliver?** The Realize MCP exposes this directly via `mcp__realize-mcp__get_campaign_reach_estimate`.

---

## Realize's Constraint — Campaign-Level Only

Reach in Realize is computed per **campaign configuration**, not per **publisher**. There is no reliable path to "how many impressions can publisher X deliver at $Y CPC for audience Z." Even when a number exists in some internal report, it is a model output with strong assumptions, not a guarantee.

Always pitch reach at the campaign level. When the user asks for per-publisher reach, decline and explain why — see "Phrasing When the Request Asks for Per-Publisher Reach" below.

---

## Tool Contract — `mcp__realize-mcp__get_campaign_reach_estimate`

Description (verbatim from the MCP): *"Estimate the potential reach — audience size, how many users or impressions — of a hypothetical campaign before launch on a Realize account."*

### Inputs

| Field | Required | Description |
|---|---|---|
| `account_id` | Required | The account's string `account_id` (from `mcp__realize-mcp__search_accounts`). NOT the numeric `id`. |
| `campaign` | Required | Object mirroring the hypothetical campaign's targeting + bidding. See "Campaign block" below. |
| `estimation_types` | Required | Array. Supported values include `"IMPRESSIONS"` and `"MONTHLY_USERS"`. Minimum `["IMPRESSIONS"]`. |

### Campaign block — fields the estimator reads

Send the same targeting / bidding fields you would send to `create_campaign`. The estimator does NOT create anything; it only evaluates the hypothesis.

**The estimator is pass-through: it validates none of the targeting blocks below.** The campaign write does, so a payload the estimator accepts can still be rejected when you go to write it.

| Field | Notes |
|---|---|
| `country_targeting` | `{type: INCLUDE\|EXCLUDE\|ALL, value: [ISO-2 codes]}`. Resolve codes via `search_geos(dimension=countries)`. |
| `region_country_targeting` / `dma_country_targeting` / `city_targeting` / `postal_code_targeting` | Same shape as on `create_campaign`. Sub-dimension mutex applies (at most one). |
| `platform_targeting` | `{type: INCLUDE\|EXCLUDE\|ALL, value: [DESK\|PHON\|TBLT\|TV\|OTHR\|NA]}`. |
| `audiences_targeting` | `{state: ALL\|EXISTS, value: [{type: INCLUDE\|EXCLUDE, value: [int]}]}`. IDs from `search_audiences`. Envelope and traps: `knowledge/audiences.md`. |
| `contextual_segments_targeting` | `{state: ALL\|EXISTS, value: [{type: INCLUDE\|EXCLUDE, value: [int]}]}`. IDs from `search_contextual_segments`. |
| `lookalike_audience_targeting` | `{state: ALL\|EXISTS, value: [{type: INCLUDE, value: [{rule_id, similarity_level}]}]}`. IDs from `search_lookalike_audiences`; `similarity_level` is a closed set — see `knowledge/audiences.md`. |
| `pricing_model` | `"CPC"` or `"VCPM"`. CPC is the standard path; VCPM is the alternate pricing model used for Display campaigns priced on viewable-impression cost. |
| `bid_strategy` | `"FIXED"` is required when `pricing_model="VCPM"`. |
| `cpc` | The bid. With `VCPM` this is the per-1000-viewable-impression rate, NOT a click bid. |

### Outputs

The estimator returns one object per requested `estimation_type`:

| Field | Description |
|---|---|
| `lower_bound` | Conservative estimate. |
| `upper_bound` | Optimistic estimate. |

Empirical observations from session probes:
- **IMPRESSIONS cap ≈ 1,000,000,001.** Broad targeting (e.g. US-only, DESK-only, VCPM @ $5, no audience) returns `lower_bound: 1,000,000,000` and `upper_bound: 1,000,000,001`. Treat any upper at or near this value as a CAP, not a true ceiling.
- **MONTHLY_USERS** is unbounded by that cap (e.g. ~570M – ~592M on the same probe).

---

## Using the Estimator in a Pre-Launch Flow

For any planned campaign where the user needs an estimated reach (impressions, monthly users, or both):

1. **Resolve the targeting** via `search_audiences` / `search_contextual_segments` / `search_lookalike_audiences` → resolved IDs.
2. **Build the campaign block** mirroring the targeting + bidding the user intends to ship.
3. **Call `mcp__realize-mcp__get_campaign_reach_estimate`** with `estimation_types: ["IMPRESSIONS"]` (add `"MONTHLY_USERS"` if the user needs both).
4. **Report the result as a range:** `<lower_bound> – <upper_bound>` (e.g. `1,200,000 – 1,800,000`).
5. **Cap handling:** if `upper_bound ≈ 1,000,000,001`, render as `<lower> – 1,000,000,000+` and tell the user the upper is a system cap, not a true ceiling.
6. **Aggregating across multiple planned campaigns:** sum `lower_bound` values for the floor, sum `upper_bound` values for the ceiling. Report both endpoints; do not collapse to a single number.

### Narrow-targeting flag

When `lower_bound < 1,000` users (matches the Realize UI banner threshold), flag the targeting as too narrow and route diagnosis through the **6-dimension priority order** in `targeting.md` — geo → audience → publisher → bidding → language / quality → platform / OS. Produce a concrete broadening recommendation per identified dimension.

---

## When to Skip the Estimator

1. **User explicitly waives it** — "just budget÷CPM is fine here", "don't bother calling the estimator on this one".
2. **Estimator errors and one retry fails** — report `n/a (estimator unavailable)` and surface the failure to the user. **Do NOT silently fall back to Budget ÷ CPM × 1000** — that is the exact failure mode the estimator is there to prevent.

There is no third skip condition. Even broad demo / geo-only plans get an estimator call (and will hit the ~1B IMPRESSIONS cap, which is informative on its own).

---

## What Not to Promise

- **Per-publisher reach numbers** — structurally not how Realize is queried. Decline cleanly.
- **Reach guarantees on a flight** — model output, not a contract. Use "is expected to," "typically delivers," "is designed to."
- **Reach figures at audience-segment level** — overlap with other segments and impression caps make this unstable. Stick to campaign-level.

---

## Phrasing When the Request Asks for Per-Publisher Reach

> "Realize estimates reach at the campaign level, not per-publisher. I can model the campaign's expected reach for the proposed targeting via the Realize reach estimator, identify the top publishers expected to deliver against it, and revisit with delivery-side actuals after launch — typically week 2."

This is honest about the constraint, gives the user what they actually need (campaign-level reach + named top supply), and avoids inventing per-publisher numbers that won't hold up.

---

## Guardrails

- Never claim a per-publisher reach figure.
- Never present a reach number without saying its source (Realize MCP estimator, delivered actuals, UI estimator).
- Never use reach to justify recommendations on accounts in active onboarding (< 30 days) — there is no meaningful baseline.
- Always pair narrow-targeting alerts with the 6-dimension diagnostic and a concrete broadening recommendation.
- Never fall back to Budget ÷ CPM × 1000 when the estimator call fails silently.
