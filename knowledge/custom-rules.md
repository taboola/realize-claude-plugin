# Custom Rules

## Overview

Custom Rules automate campaign optimisation by setting conditions that trigger actions. They are powerful but dangerous — misconfigured rules can destroy performance. Allow campaigns to finish the learning phase before implementing Custom Rules. For new advertisers still testing, do not use Custom Rules from the start. This file covers rule types, SpendGuard, setup guidance, and critical do's and don'ts.

---

## When to Use Custom Rules

Allow a campaign to finish the **learning phase** before implementing Custom Rules. For new advertisers still testing, do not use Custom Rules from the start.

Once you have reached certain scale and understand which strategy works best, start using Custom Rules.

### Rule Dimensions

| Dimension | Use Case | Example |
|---|---|---|
| **Sites** | Block publishers almost in real-time, saving time and preventing wasted spend | IF impressions > 1000 AND vCTR > 10% THEN block sites. |
| **Ads** | Pause ads consuming budget without delivering results, allowing redistribution to better ads | IF CPA > $5 AND CVR < 10% THEN pause ads (for campaigns with multiple ads). |
| **Campaigns** | Scale profitable campaigns and limit unprofitable ones | IF CPA from 'Purchases' < $5 THEN increase budget by 20% but not exceeding $250/day. |

---

## Do's and Don'ts

### Do

| # | Action | Why |
|---|---|---|
| 1 | **Identify repetitive manual tasks** and replace with Custom Rules | Saves time and protects spend before you get to it manually. |
| 2 | **Leverage different conversion events** to optimise across the funnel | Rules can target different funnel stages. |
| 3 | **Use ROAS where possible** | Not every rule needs to be CPA-based. |
| 4 | **Use Scheduled Reports** to ensure transparency | Visibility into actions performed by Custom Rules. |
| 5 | **Review in Rules Preview carefully** before saving | Ensure you are comfortable with the actions the rule will take. |
| 6 | **Be realistic with your goals** | Base rules on average performance for similar advertisers. |

### Don't

| # | Action | Why |
|---|---|---|
| 1 | **Don't build account-level rules** when campaigns work toward different benchmarks / goals | Rules will conflict across campaigns. |
| 2 | **Don't create rules that are too simplistic** (result in aggressive / undesired blocks) | See guidance below. |
| 3 | **Don't rely on unblocking after rule activates** | If reversing actions, adapt the existing rule too — otherwise it will block again. |
| 4 | **Don't be too aggressive from the offset** | Monitor performance 1-2 weeks before creating rules for newer campaigns. |

### Avoiding Overly Simplistic Rules

Rules must include safeguards.

| Safeguard | How |
|---|---|
| **Include more than one condition** | e.g., block a site after 0 conversions AND $100 spent. |
| **Exclude recent time frames** using AND logic | Exclude last 3 days for conversions that are often delayed (offline sales, in-app purchases) or exclude "today" to look at historical data only. |
| **Exclude historically strong performers** | Consider excluding quality sites (Yahoo, MSN) that you would rarely block regardless of performance. |

### Always Double-Check

Always verify rules using the **preview tool** before saving.

---

## SpendGuard

Whether you use Custom Rules or not, **SpendGuard is always on by default** for your campaigns.

### How SpendGuard Works

- SpendGuard is a **predictive model** that automatically identifies underperforming sites.
- It will **cap or block** those sites accordingly.
- Visible and controllable within the site report and campaign setup page in Realize.
- Does not require direct action unless you want to disable it.
- Protects budget based on conversion metrics (CPA and CVR) aligned with the conversion rules measured in Realize.

---

## Scaling: Custom Rules for Growth

### Custom Rules for Scaling Campaigns

Set up automated Custom Rules for additional control.

| Rule Type | Example |
|---|---|
| **Block underperforming sites** | Block sites with CPA higher than $10 or sites with 0 conversions. |
| **Pause underperforming ads** | Pause ads with 0 conversions or CPA higher than $20. |
| **Change campaign budget** | Increase budget by 10% for campaigns with CVR > 4%, or decrease budget by 20% for campaigns with CPA > $25. |

### Scaling Rules Best Practices

| Practice | Details |
|---|---|
| Start with broad rules | Avoid significant performance impact. Example: block sites with spend but no conversions over 7 days. |
| Monitor rules action | Keep monitoring under the "Rules" tab to track impact. |
| Build specific rules for select campaigns | Don't over-apply — different campaigns may need different thresholds. |

---

## Account-Level vs. Network-Level Rules

Custom Rules can exist at two levels.

| Level | Scope | Important Note |
|---|---|---|
| **Account-level** | Applies to campaigns in that account only | Default level for most rules. |
| **Network-level** | Applies across all accounts in the network | May override or supplement account-level rules. |

- Always check **both** account-level and network-level rules before making changes.
- A rule that appears disabled at account level may have an active replacement at network level.

---

## Guardrails

- Never enable Custom Rules while the campaign is still learning — check `cvr_learning_status`, don't assume from age. (Typically ~7-10 days, but a low-volume campaign can report `CVR_LEARNING` for months.) **If that field is empty**, an empty value does **not** mean "not learning". Follow P5 Step 1: it is only *not applicable* on a Fixed-bid campaign, a non-conversion objective, `MOBILE_APP_INSTALL`, or a campaign with no conversion rule attached — and **on any other campaign an empty status means still learning, so the guard fires and Custom Rules stay off-limits.** Only in the genuinely not-applicable cases fall back to the volume floor: nothing under ~500 campaign clicks or in the first ~7-10 days.
- Never create rules for newer campaigns without monitoring for 1-2 weeks first.
- Never create overly simplistic rules with only one condition — always include safeguards.
- Never build account-level rules when campaigns work toward different benchmarks.
- Never forget to adapt existing rules when you reverse their actions (unblocking sites / ads).
- Never create rules without previewing them first.
- Always check both account-level and network-level rules.
- Always include spend or volume thresholds before rules evaluate.
- Always use Scheduled Reports for transparency into rule actions.
- Always exclude recent time frames for delayed conversions (offline, in-app).
- Always consider excluding historically strong sites (Yahoo, MSN) from blocking rules.

## Common Mistakes

1. **Rules during learning phase.** Fights the algorithm. Wait until `cvr_learning_status` reads `CVR_LEARNING_COMPLETE` — not a fixed number of days.
2. **Single-condition rules.** Too aggressive. Always multiple conditions (e.g., 0 conversions AND $100+ spent).
3. **Not excluding recent data.** Blocks sites for delayed conversions. Exclude last 3 days for offline / in-app.
4. **Unblocking without updating rule.** Same site gets blocked again. Adapt the rule when reversing actions.
5. **Account-level rules across different campaigns.** Conflicting benchmarks. Use campaign-specific rules.
6. **Not previewing before saving.** Unintended actions. Always use the preview tool.

## Pro Tips

- SpendGuard is on by default — a safety net even without Custom Rules. It uses a predictive model to cap / block underperforming sites based on CPA and CVR.
- Replace your manual daily review process with Custom Rules. If you check campaigns daily and block sites / ads / adjust budgets based on criteria, automate those exact criteria.
- ROAS-based rules are powerful but underused — not everything needs to be CPA-based.
- Start with **broad rules** (e.g., "block sites with spend but no conversions over 7 days") before creating aggressive rules. This is the safest entry point.
- The **preview tool** is your best friend — it shows exactly what the rule would have done historically.
