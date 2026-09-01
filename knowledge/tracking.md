# Tracking

## Overview

Setting up tracking properly is the **highest priority** during account creation. Accounts that follow tracking best practices are significantly more likely to see value and keep spending on Realize. This file covers tracking methods, conversion events, ROAS tracking, parameters, and debugging.

> **Attribution note:** Tracking setup directly determines which attribution model you see — Click-Through (CT), View-Through (VT), or Total (CT+VT). Always name the model explicitly when reporting conversion metrics: `CPA (CT only)`, `CVR (Click-Through)`, `Leads (Total CT+VT)`.

### What this file covers, and what it doesn't

This file is the **strategy and interpretation** layer: which tracking method to choose, how to structure conversion events, how to read event status, how to debug mismatches. Two neighbouring things live elsewhere:

- **Live rule state and rule changes go through the MCP.** Reading an account's conversion rules, creating one, changing an attribution window, or retiring a rule are tool-backed operations, not documentation questions. Never answer "what rules do I have?" or "what's my attribution window?" from this file — read the account.
- **Platform install mechanics are not here.** Installing the pixel via the Shopify app, the WordPress plugin, the WooCommerce integration, a Google Tag Manager template, or manual base code — plus codeless-conversion setup and pixel test-firing — are Realize-UI operations, and the step-by-step lives in Taboola's public help documentation rather than in this file. Those questions are a genuine gap here, not something to improvise around.
- **Live pixel diagnosis is not here either.** "Is my pixel firing on this page?", "why aren't conversions tracking?", "purchases are double-counted" — those are answered from the user's actual page and browser evidence by the `diagnose-tracking` skill, not from documentation. This file's debugging sections cover *interpreting* statuses and mismatches; the skill owns the evidence-gathering workflow.

The exception worth stating: this file **does** cover the Funnelish edge case, network- vs account-level pixel choice, and validation, because those are decisions rather than button-clicking.

---

## Tracking Setup

### Tracking Method Decision

For optimal performance, implement the **Taboola Pixel** to map your conversion funnel. Where needed, combine with **Server-to-Server (S2S)** for end-to-end funnel coverage (e.g., when the conversion funnel includes offline conversions).

| Tracking Method | Role | When to Use | Value | Limitations |
|---|---|---|---|---|
| **Taboola Pixel** | Primary | You can implement JavaScript on-site and map key funnel steps | Rich behavioural data, strongest optimisation signals, accurate attribution | Dependent on dev resources; implementation may take longer |
| **S2S** | Secondary / Complementary | Offline, in-app, CRM-driven, or system-based conversions | Precise event control, enables offline and complex funnels | Fewer behavioural signals if used alone |
| **Others** (Image Pixel, 3rd-Party Tags, UTMs, Floodlight) | Fallback | Pixel or S2S not possible, or measurement is mandated externally | Enables tracking in privacy-restricted or ecosystem-locked setups | Limited optimisation, weaker attribution, data gaps |

### Decision Rule

- If JavaScript can be implemented on-site → Taboola Pixel first.
- If conversions happen offline or in-app → add S2S.
- If privacy or technical constraints block both → other tracking methods.

### When Pixel or S2S Isn't an Option

Alternative methods — sub-optimal for algorithm performance but offer highest privacy.

| Method | Use Case | Limitations |
|---|---|---|
| **Image pixel** | Sensitive verticals (finance, healthcare) with strict privacy constraints | Cookie-based; no Safari / iOS tracking, weaker deduplication and attribution |
| **Third-party tags** | External measurement, attribution, or MMP requirements | Implemented on publisher pages; does not replace first-party tracking |
| **URL parameters (UTMs)** | Analytics platforms like GA | Click-level only; no post-click behavioural insight |
| **Floodlight** | GMP / DV360 / CM360 advertisers | Required for Google ecosystem reporting; pair with Taboola Pixel or S2S |

### Network-Level vs. Account-Level Pixel

| Dimension | Network-Level | Account-Level |
|---|---|---|
| **Pixel requirement** | Single Network Base Pixel, implemented once | Account Base Pixel required per account |
| **Tracking scope** | Cross-account: captures interactions and conversions across all accounts under the network | Single-account: captures interactions and conversions only within that account |
| **S2S support** | Not supported | Supported — must be implemented at account level |
| **Identification** | Tracking tab → "Network Pixel-Active" | Tracking tab → "Account Pixel-Active" |

### When to Use Account-Level Tracking

- **Varied conversion goals:** accounts have different conversion events or different landing pages. Example: one account tracks "Form Submit" while another tracks "App Install."
- **Agency management:** managing different brands or distinct clients under one network. Network tracking risks incorrectly attributing conversions between unrelated brands.

### When to Use Network-Level Tracking

- **Unified conversion goal:** the accounts share a domain and a single identical conversion goal.
- **Cross-account funnels:** need to attribute a conversion to the specific campaign that provided the last interaction, even if in a different account within the same network.
- **Simplified management:** prefer managing a single set of conversion rules across the network.

### Using Both Together

Network and Account Pixels together create synergy. The Network Pixel provides large-scale anonymous data for network-wide optimisation; the Account Pixel delivers precise immediate conversion feedback for specific campaign goals.

### Tracking Validation

Test tracking:

1. Right after finishing tracking setup.
2. Every time there's a concern about tracking on Realize.
3. Whenever investigating a discrepancy rate over 20% against your source of truth, or any performance issue.

**Tools:**

- **Test Tool in Realize** — the easiest way to validate that both S2S and Taboola Pixel are working correctly.
- **Taboola Pixel Helper** (Chrome extension) — to confirm specific pages have the Pixel implemented.

---

## Conversion Events

### Conversion Data Management

Once tracking is implemented and conversions are mapped, configure what the algorithm optimises toward.

### Total Conversions (Account-Level Goal)

The conversions included in **Total Conversions** are the primary optimisation goal for all campaigns in the account, unless a specific Campaign Conversion Goal is selected.

**Best practices for Total Conversions:**

1. **Limit the selection.** Include no more than **two** conversions in Total Conversions.
2. **Keep them close in the funnel.** The two included conversions should be adjacent in the funnel (e.g., Add-to-Cart and Purchase — not Product View and Purchase).
3. **Understand the optimisation logic.** The algorithm primarily optimises toward the event that is **higher up in the funnel** (e.g., Add-to-Cart), while still bringing lower-funnel conversions (e.g., Purchases) as a side product.
4. **Avoid confusing the algorithm.** Including too many conversions — especially those far apart in the funnel — directs the algorithm toward conflicting goals.

### Campaign Conversion Goal

Not every campaign should optimise toward the same conversions. Designate a specific conversion as the **Campaign Conversion Goal**.

**Best practices:**

- Select a conversion with sufficient volume — ideally **at least 50 conversions over the last 7 consecutive days** (recommended, not mandatory).
- Align the goal as closely as possible with the campaign's marketing objective (e.g., an Engagement campaign's conversion goal can be "Time on site").

### Total Conversion Value (for ROAS)

Conversions included in **Total Conversion Value** are used to calculate ROAS and for value-focused bidding strategies such as Maximize Value.

### Primary + Secondary (Soft) Conversion Strategy

For new campaigns, consider including both Primary and Secondary conversions in Total Conversions.

- **Primary Conversion** (CVR < 10% from clicks): e.g., Purchase or Qualified Lead.
- **Secondary (Soft) Conversion** (CVR 10-20% from clicks): e.g., Add-to-Cart or Form Completed.

Think of it as levels:

- **Level 1:** achieve 50+ conversions (soft and primary combined) per week for optimal Maximize Conversions performance — may be sub-optimal by your definition.
- **Level 2:** achieve 50+ conversions (primary only) per week for optimal Maximize Conversions **and** optimal advertiser performance.

**Important nuance:** 50 conversions per week is a best practice, not a hard limitation. The algorithm can work with fewer conversions. The threshold was established empirically.

### Considerations for Conversion Strategy

| Consideration | Explanation |
|---|---|
| Algorithm seeks the easiest conversion | Optimising toward Add-to-Cart + Purchase prioritises Add-to-Carts with purchases as a side product. For some advertisers, optimising toward Purchases directly is more beneficial. |
| Removing soft conversion too early | Challenges the algorithm — it must rebuild strategy for primary conversions. Best to remove only once high conversion volume is achieved. |
| Primary conversion is too costly or rare (>7 day sales cycle) | Only option: optimise toward both primary and secondary unless you have a 10× CPA daily budget. |
| Moving down the funnel | Expect 2-4 days of performance fluctuation as the algorithm rebuilds strategy. |
| Moving up the funnel | Lighter fluctuations — the optimisation task becomes easier. |

### Codeless Conversions

**When to use:**

- Just began tracking implementation and want to create conversions without technical implementation or GTM.
- Already have some manually created conversions but want to add others (e.g., tracking Purchases but not Start Checkout or Add-to-Cart).

Verify in real time that tracking data is arriving using the **Tracking Test Tool**.

### Event Status — Critical Check

Always verify that conversion events are in the correct state.

| Status | Meaning | Action |
|---|---|---|
| **Active** | Receiving data, eligible for optimisation | None — healthy state. |
| **Inactive** | Created but no data received | Check Taboola Pixel installation. |
| **Archived** | Manually archived — excluded from optimisation | Do not use. Filter out archived events. |
| **Disabled** | Disabled — excluded from optimisation | Do not use. Filter out disabled events. |

---

## ROAS Setup

### When to Use Dynamic Conversion Value

If not all conversions are equal in value (e.g., Purchase where value = item cost, or Qualified Lead where value varies by quote cost), implement **Dynamic Conversion Value**. This enables:

- In-platform ROAS measurement.
- Optimisation toward high-value conversions with value-based bidding.

### Apple News Tracking Limitation

**Core issue:** When a user clicks an ad in Apple News, they are in a restricted web view. If they leave and return via Safari to finish their purchase, the tracking ID is stripped. The dashboard only sees about **40% of actual conversions** (those that happen immediately). The remaining 60% are invisible.

**What to plan for:**

- Apple News traffic is significantly under-reported.
- Should not be judged on a last-click basis alone.
- Recommend looking at blended ROAS or internal analytics to see full impact.
- An "expensive" CPA on paper is often highly profitable once you account for the 60% of missing post-click data.
- **Plan for this gap up front when forecasting CPA.**

### Funnelish Tracking

If using Funnelish to bypass standard Shopify checkout, the Shopify app **will not track sales**. The dashboard will incorrectly show zero sales.

**Fix:** Work with a Solutions Engineer to manually install Taboola Pixel events within Funnelish tracking settings for **every step of the funnel** (Initial Sale, Upsell, Thank You page).

---

## Tracking Parameters

### Setup Guidance

| Decision | Recommendation |
|---|---|
| Where to apply parameters | **Campaign-level tracking** is recommended for scalability and easier maintenance. |
| Item-level tracking | Use for specific exceptions only. Avoid duplicating parameters at both levels. |
| Standard UTMs | Include at minimum `utm_source`, `utm_medium`, and `utm_campaign` for cross-channel reporting consistency. |
| Before launch | **Test URLs** — confirm parameters append correctly and analytics systems capture them. |

---

## Guardrails

- Never assume tracking is working — always verify with the Test Tool or Taboola Pixel Helper.
- Never optimise a campaign toward an archived or disabled conversion event.
- Never include more than two conversions in Total Conversions.
- Never include conversions far apart in the funnel in the same Total Conversions set.
- Never remove the secondary (soft) conversion too early — wait until high conversion volume is achieved.
- Never judge Apple News CPA on a last-click basis — 60% of conversions are invisible due to the tracking gap.
- Always verify tracking after setup, when a tracking concern surfaces, and when discrepancy exceeds 20%.
- Always check both network-level and account-level pixel configuration.
- Always filter out archived and disabled conversion events in analysis.

## Common Mistakes

1. **Including too many conversions in Total Conversions.** Confuses the algorithm. Max two, close in funnel.
2. **Removing soft conversion too early.** Algorithm struggles to rebuild. Wait for high primary volume first.
3. **Not testing tracking after setup.** Silent failures. Use the Test Tool immediately after implementation.
4. **Network vs. account pixel confusion.** Conversions attributed incorrectly. Check which level the pixel operates at.
5. **Funnelish bypassing Shopify tracking.** Zero sales reported. Manually install Taboola Pixel events in Funnelish.
6. **Judging Apple News on last-click CPA.** Under-valuing a profitable channel. Use blended ROAS.

## Pro Tips

- Optimise toward a specific product or funnel per account. Do not mix different products and completely different funnels on the same account — each product has different relevant audiences, and mixing confuses the algorithm.
- Using **Gen AI AdMaker** significantly improves creative approval rate by approximately 50%. The model has built-in policies that reduce time to launch.
- The algorithm looks for the easiest conversion. When optimising toward Add-to-Cart + Purchase, it prioritises Add-to-Carts. For some advertisers, optimising toward Purchases directly is more beneficial — worth evaluating against your funnel.
- 50 conversions per week is a best-practice threshold, not a hard limitation. The algorithm can work with fewer conversions.
