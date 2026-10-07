# CSV Examples

Sample outputs with **fictional data**, but the **shape is real** — banners, header rows and value formatting below were taken from live calls on 2026-10-02 and only the names and numbers were replaced. Column *names* you pass in `columns` must still come from a live `get_dynamic_report_settings` call, never from here.

Two formatting facts that catch people out, both verified live:

- **The header row uses friendly labels, not the fully-qualified names you requested.** You ask for `PERFORMANCE_REPORT.METRICS.CLICKS`; the CSV header says `Clicks`. Match columns by the **header name** you got back — never by column position, and never by the fully-qualified name you sent.
- **`Impressions` and `Served Ads` are swapped relative to intuition.** `PERFORMANCE_REPORT.METRICS.VISIBLE_IMPRESSIONS` prints as **`Impressions`**, and `PERFORMANCE_REPORT.METRICS.IMPRESSIONS` prints as **`Served Ads`**. So the dynamic report's "Impressions" *is* visible impressions — which is why its CTR differs from the classic report's `ctr`. Request `METRICS.IMPRESSIONS` expecting impressions and you silently get served ads.

## `get_dynamic_report_data` — campaign grain

Query: `columns=[CAMPAIGN_NAME, CLICKS, IMPRESSIONS, VISIBLE_IMPRESSIONS, CTR]`, custom range, `page_size=3`.

```
📊 **Dynamic Report Data** - Account: advertiser_12345_prod

Grain: (Campaign Name) | Records: 3 | Page: 1 | Size: 3
Row key: (Campaign Name) — these columns together uniquely identify each row; the same value in one key column can recur across rows, so never merge or dedupe by a subset.
metrics ctr/cpc/cpm/cpa/cvr/roas are pre-computed per row — do not recompute or average them across rows
This page returned a full 3 rows (page 1) — more rows likely exist; request the next page (increment `page`) to continue.

Campaign Name,Clicks,Served Ads,Impressions,CTR
Band Awareness 1,16,"105,898","27,066",0.06%
Landing Page B,505,"361,544","35,088",1.44%
Perf Video Desktop Test,0,"3,411",920,0.00%
```

Four things to read off this:

- **`CTR` arrives pre-formatted as a percentage string** — `1.44%`, `%` sign included. It is not a number; print it as-is rather than scaling it. *(This is the opposite of `get_campaign_breakdown_report`, whose `ctr` is a bare number already in percent units — see that example below. Never carry a convention from one tool to the other.)*
- **CTR is computed on `Impressions`, i.e. visible impressions** — 505 ÷ 35,088 = 1.44%, not 505 ÷ 361,544 (Served Ads) = 0.14%. That single fact explains every "the dynamic report's CTR doesn't match" report.
- **Large numbers are comma-grouped and quoted** — `"105,898"`. Strip the commas before any arithmetic; a naive parse yields `105`.
- **No grand `Total` in the banner.** Here the page came back full (`Records: 3` = `Size: 3`) and the banner says so outright — page until a short page before quoting any aggregate.

## `get_dynamic_report_data` — top-N pattern (site grain, filtered to one campaign)

Query: `columns=[SITE.DESCRIPTION, SPENT, CLICKS]`, campaign filter, sort by spend DESC, `page_size=5`.

```
📊 **Dynamic Report Data** - Account: advertiser_12345_prod

Grain: (Site) | Records: 5 | Page: 1 | Size: 5
Row key: (Site) — these columns together uniquely identify each row; …
metrics ctr/cpc/cpm/cpa/cvr/roas are pre-computed per row — do not recompute or average them across rows

Site,Spent,Clicks
News Daily,812.40,"8,104"
Sports Hub,620.30,"6,203"
Weather Now,341.80,"3,010"
Tech Review,298.55,"2,540"
Local Times,244.10,"2,077"
```

The top-N pattern: the ranking column is in `columns`, sorted DESC, `page_size=N`. Say "top 5 by spend" — not "the 5 sites" — since rows beyond page 1 may exist.

## `get_campaign_breakdown_report` — campaign grain (GROUP / admin-network path)

Query: `start_date="2026-08-24"`, `end_date="2026-08-30"`, `sort_field="spent"`, `sort_direction="DESC"`, `page_size=2`.

```
**Campaign Breakdown Report CSV** - Account: advertiser_12345_prod | Period: 2026-08-24 to 2026-08-30

Grain: campaign | Records: 2 | Total: 7 | Page: 1 | Size: 2 | More data available - use pagination
Row key: campaign — these columns together uniquely identify each row; the same value in one key column can recur across rows, so never merge or dedupe by a subset.
metrics ctr/cpc/cpm/cpa/cvr/roas are pre-computed per row — do not recompute or average them across rows

campaign_name,campaign,clicks,impressions,visible_impressions,spent,ctr,vctr,cpm,vcpm,cpc,cpa,currency,
"Headphones - Retargeting",48054135,207,1023778,132465,54.86,0.020219,0.156268,0.05,0.41,0.265,18.287,USD,
"Sleep Products - Q2 Prospecting",50011514,185,198519,36430,36.99,0.093190,0.507823,0.19,1.02,0.200,12.329,USD,
```

The real column list is much wider than this excerpt (traffic-allocation, demand type, learning state, the `roas_*` / `cpa_*` families). **Identify columns by name, never by position.**

Three things to read off this banner:

- **`Total: 7` is a record count** — seven campaigns matched — and `More data available` says you are not done. It tells you *how many rows exist*, never what they add up to. To report total spend you still page through and sum `spent` yourself.
  > The tool's own description says "rely on the `Total` in the summary line (authoritative) — never sum rows across pages." That phrasing is about the **record count**, which `Total` genuinely is authoritative for. **It does not mean a spend total is available without paging — it isn't.** This is the one documented place the plugin deliberately reads the upstream wording more narrowly than it scans.
- **`Row key: campaign`** states what makes a row unique — do not merge or dedupe on a subset of it.
- **Rate columns are percentages already, not 0–1 fractions.** `ctr` of `0.020219` is **0.0202%** (207 ÷ 1,023,778), not 2.02%. Multiplying by 100 again overstates it by 100×. The same holds for `vctr` and the `cpa_conversion_rate*` columns.

Note also that `ctr` and `vctr` are **separate columns** here — `ctr` is clicks ÷ impressions, `vctr` is clicks ÷ *visible* impressions. That is different from the dynamic report, whose single CTR is computed on visible impressions. If a user compares a CTR across the two reports, this is the first thing to check.

Interpretation pattern:
> "7 campaigns had spend in Aug 24–30; showing the top 2 by spend. *Headphones - Retargeting* leads at $54.86 on 207 clicks (0.020% CTR, $0.27 CPC, $18.29 CPA)."

## `get_campaign_history_report` — change/audit log

```
**Campaign History Report CSV** - Account: advertiser_12345_prod | Period: 2026-04-17 to 2026-04-23

Grain: (campaign_id, change_time, id) | Records: 2 | Total: 39 | Page: 1 | Size: 2 | More data available - use pagination
Row key: (campaign_id, change_time, id) — these columns together uniquely identify each row; …
this is a change/audit log — one row per change event (change_time, change_type, old_value→new_value, performer); not performance metrics

id,account_id,account_name,campaign_group_id,campaign_group_name,campaign_id,campaign_name,change_type,activity_code,activity_code_description,activity_details_code,activity_details_description,old_value,new_value,performer,change_time,parameters_details,
368873,12345,advertiser_12345_prod,,,,,UPDATE,creativeDescription,Creative Description,creativeDescriptionDesc,Creative ID: 4357516786,myDescription,People are saying it's a great deal,someone@example.com,09/30/2026,,
5794395668,12345,advertiser_12345_prod,39937,AutoGen - Q3 test,48699419,Q3 test,UPDATE,adDescription,Ad Description,,Ad ID: 4357516787,myDescription,People are saying it's a great deal,someone@example.com,09/30/2026,Ad_Id=4357516787,
```

The change log, not performance data. Three things the shape tells you:

- **It carries `Grain` and a `Row key:` line** like the other reports — the key is the triple `(campaign_id, change_time, id)`, so never dedupe on `campaign_id` alone.
- **`change_time` is `MM/DD/YYYY`**, not ISO, and has no time component — don't parse it as `YYYY-MM-DD`.
- **Campaign fields can be blank** on account-level changes (row 1 here is a creative edit with no `campaign_id`), so client-side filtering to one campaign silently drops them. Say what you filtered.

## Empty result

```
📊 **Dynamic Report Data** - Account: advertiser_12345_prod

Grain: (Campaign Name) | Records: 0 | Page: 1 | Size: 20
```

Never fabricate narrative from an empty report. Say so explicitly:
> "No records returned for that account between Apr 17 and Apr 23 — either nothing was running in that window or no data has been ingested yet."
