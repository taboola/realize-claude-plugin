# CSV Examples

Illustrative (fictional) sample outputs. Column names in the dynamic-report examples are the fully-qualified form the metamodel returns — always copy real names from a live `get_dynamic_report_settings` call rather than from here. The banner's exact wording is also illustrative: upstream specifies it carries Records, the row Grain, and pagination, but the precise layout should be read from real output, not from this file.

## `get_dynamic_report_data` — campaign grain

Query: `columns=[CAMPAIGN_NAME, SPENT, CLICKS, CTR]`, `date_preset="LAST_7_DAYS"`, sort by spend DESC.

```
🏆 **Dynamic Report CSV** - Account: advertiser_12345_prod | Period: LAST_7_DAYS

📊 Records: 2 | Grain: CAMPAIGN | Page: 1 | Size: 20

PERFORMANCE_REPORT.CAMPAIGN.CAMPAIGN_NAME,PERFORMANCE_REPORT.METRICS.SPENT,PERFORMANCE_REPORT.METRICS.CLICKS,PERFORMANCE_REPORT.METRICS.CTR
"Headphones - Retargeting",3164.20,19770,0.0241
"Sleep Products - Q2 Prospecting",2311.70,23117,0.0125
```

Interpretation pattern:
> "Two campaigns spent in the last 7 days (Aug 24–30). *Headphones - Retargeting* leads at $3,164 on 19,770 clicks (2.41% CTR); *Sleep Products - Q2 Prospecting* spent $2,312 on more clicks but a lower 1.25% CTR."

Note the banner: **Records + Grain + pagination, no grand `Total`.** Here `Records: 2 < Size: 20`, so this page is the full result. When `Records` equals `Size`, more pages may exist — page until a short page before quoting any aggregate.

## `get_dynamic_report_data` — top-N pattern (site grain, filtered to one campaign)

Query: `columns=[SITE.DESCRIPTION, SPENT, CLICKS]`, campaign filter, sort by spend DESC, `page_size=5`.

```
🏆 **Dynamic Report CSV** - Account: advertiser_12345_prod | Period: 2026-04-01 to 2026-04-23

📊 Records: 5 | Grain: SITE | Page: 1 | Size: 5

PERFORMANCE_REPORT.SITE.SITE_DESCRIPTION,PERFORMANCE_REPORT.METRICS.SPENT,PERFORMANCE_REPORT.METRICS.CLICKS
"News Daily",812.40,8104
"Sports Hub",620.30,6203
"Weather Now",341.80,3010
"Tech Review",298.55,2540
"Local Times",244.10,2077
```

The top-N pattern: the ranking column is in `columns`, sorted DESC, `page_size=N`. Say "top 5 by spend" — not "the 5 sites" — since rows beyond page 1 may exist.

## `get_campaign_history_report` — change/audit log

```
🏆 **Campaign History Report CSV** - Account: advertiser_12345_prod | Period: 2026-04-17 to 2026-04-23

📊 Records: 3 | Total: 3 | Page: 1 | Size: 20

<change-log rows: when a campaign setting changed, and what changed>
```

This is the change log, not performance data — columns should be verified against real output before quoting them. The legacy banner keeps the grand `Total`; cite it.

## Empty result

```
🏆 **Dynamic Report CSV** - Account: advertiser_12345_prod | Period: 2026-04-17 to 2026-04-23

📊 Records: 0 | Grain: CAMPAIGN | Page: 1 | Size: 20
```

Never fabricate narrative from an empty report. Say so explicitly:
> "No records returned for that account between Apr 17 and Apr 23 — either nothing was running in that window or no data has been ingested yet."
