# Audiences

What the Realize MCP can read and write about audiences, and the traps that produce confidently wrong answers.

**Audience *strategy* — when to retarget, how wide to go, which segments to reach for — lives in `knowledge/targeting.md`.** This file is the tool surface.

## What exists, and what this plugin does with it

| Capability | Upstream tool | Wired here |
|---|---|---|
| List / read audiences | `search_audiences` | Yes |
| Predictive seeds available for targeting (the `lookalike` wire name) | `search_lookalike_audiences` | Yes — read-only discovery |
| Contextual segments | `search_contextual_segments` | Yes |
| Point a campaign at an audience | `audiences_targeting` on the campaign writes | Yes — a normal gated write |
| Create a pixel, combined or CRM audience | `create_audience` | **No — exists upstream, deliberately not enabled** |
| Edit or archive an audience | `update_audience` | **No — exists upstream, deliberately not enabled** |

And two facts about the platform rather than about this plugin:

| Capability | Upstream |
|---|---|
| Build a predictive audience (audience expansion) from a seed | **No tool at any level** |
| Delete an audience | **No endpoint exists anywhere, not even in the UI** |

Three different states, and they must not be collapsed into each other. *Not enabled here* is a decision this plugin made; say so, and never say Realize cannot do it. *No tool at any level* is a platform fact. *No endpoint exists* means not even the UI deletes — archiving is the only retirement. Upstream documents archiving as reversible for a pixel audience and says nothing either way for the others, so do not promise it reverses.

`create_audience` and `update_audience` may appear in the session's tool list, because no tool allowlist is set. Do not call them. A CRM upload puts customer records on the wire, so enabling it is a reviewed decision rather than something to infer from the tool being reachable.

## Reading an audience

`search_audiences` has **three modes**, and picking the wrong one returns a plausible, wrong result set.

1. **List** — omit `audience_id`. Every subtype at once (first-party, custom, combined, lookalike, third-party). Each row carries `id`, `audience_name`, `data_type`, `is_archived`. These ids are what `audiences_targeting` takes.
2. **By id** — `audience_id` **plus** `audience_type`, which routes the lookup. This is the only way to see the writable detail: `condition` / `effects` / `status` on a pixel audience, `combined_audience_components` on a combined one. **Only `PIXEL`, `COMBINED` and `CUSTOMER_LIST` are readable this way.** The listing covers five subtypes, so a lookalike or third-party row has *no* `audience_type` that will fetch it — its listing row is all there is.
   **Choosing `audience_type` is not something the data tells you.** `data_type` cannot do it (below), and a 404 does not identify the right one either, so there is no rule to derive it. Use what is known about how the audience was built — a CRM upload is `CUSTOMER_LIST`, a rule built on pixel events is `PIXEL`, one assembled from other audiences is `COMBINED` — and otherwise **ask the user**.
3. **Combinable** — `combinable=true` lists what may go *inside* a combined audience. This is a **different population**, dominated by third-party marketplace segments, and it contains only some of the account's own audiences. Only `audience_id` and `search_text` apply; `audience_type` and the country filters are **refused**, not ignored.

There is no `query` parameter on this tool, or on `search_lookalike_audiences`.

### The traps

- **`data_type` is not `audience_type`.** The listing reports `data_type: CUSTOM` for **both** pixel audiences and combined ones, so it cannot tell them apart and must never be used to choose `audience_type`.
- **A 404 by id does not mean you guessed the wrong subtype.** A newly created audience is often not readable by its own id **at all** — observed still unreadable after twelve minutes, and not known to recover on its own — while appearing in the plain listing immediately. Twelve minutes is a floor, not a wait: do not tell the user to retry later. An **archived** audience stops being readable by id altogether. Confirm from the listing rather than retrying with a different subtype.
- **`"Udd with id N doesn't exist"`** comes from using a listed id *inside a combined audience* and means the id has no segment behind it yet — typical of one created moments earlier. The fallback is the combinable listing, remembering it is a different population, not a membership test.
- **Archiving is the only retirement, and the listing keeps showing it** with `is_archived` true. That is where to confirm an archive, since the by-id read stops working. Archiving is itself a write this plugin does not perform — it happens in the **Audiences** area of Realize.

## Targeting a campaign at an audience

The envelope is the part that gets written wrong:

```
"audiences_targeting": {"state": "EXISTS", "value": [
  {"type": "INCLUDE", "value": [224820, 25287]},
  {"type": "EXCLUDE", "value": [19884]}
]}
```

`state` is **`ALL` or `EXISTS`** — never `INCLUDE` or `EXCLUDE`, which are the inner `type`. `{"state": "ALL", "value": []}` clears the block; `state: "ALL"` with a non-empty `value` is rejected outright. Audience ids are **integers inside the payload**, even though `search_audiences` takes `audience_id` as a string.

The `lookalike_audience_targeting` block takes `{rule_id, similarity_level}` objects instead of bare ids, is INCLUDE-only, and allows one outer block. **`similarity_level` is a closed set — 1, 2, 3, 4, 5, 10, 15, 20, 25 — and the valid values differ by seed:** a CRM seed takes 5/10/15/20/25, which upstream describes as percentages; a pixel seed takes 5 and nothing else; a PBP seed takes 1-5. **Upstream does not state what the PBP numbers mean**, so do not translate a user's percentage onto them.

This plugin's validation checks only membership of the combined set; the seed-specific resolution happens server-side. So a value that is wrong *for that seed* passes validation here untouched — nothing in this plugin will stop it, and what Realize then does with it is not documented. That is why a user asking for "a 1% lookalike", the vocabulary they bring from other platforms, must not simply become `similarity_level: 1`. **The listing does not label a seed's subtype** — `search_lookalike_audiences` returns rule ids, not types — so unless the user or the audience's own name makes it unambiguous, offer the valid values and let them choose rather than picking one. Those are wire names: to the user these are **predictive audiences / audience expansion**, never "lookalikes" — see the naming table in `os/guardrails.md`.

## Where the capability boundary actually sits

Predictive / lookalike creation is the one worth stating carefully, because upstream's own prose contradicts its enum — including in one tool description a caller can read. **The enum is the truth**, and the handler enforces it before the file is even fetched (upstream notes that its schema enums are advisory on their own): `crm_targeting_type` is `TARGETING_SUPPRESSION` and nothing else, so a customer list can be uploaded only to target or suppress the people in it. Building a predictive audience from that seed is refused outright.

A separate path fails far more quietly. A lookalike-subtype rule authored directly through the pixel route **is accepted** — and is then filtered out of every listing and reads back 403. It succeeds and is invisible, which is worse than an error. Neither path is a way in. Predictive audiences are built in the **Audiences** area of Realize; say that, and call them *predictive audiences* or *audience expansion* to the user, never "lookalikes".
