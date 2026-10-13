# Audiences

What the Realize MCP can read and write about audiences, and the traps that produce confidently wrong answers.

**Audience *strategy* — when to retarget, how wide to go, which segments to reach for — lives in `knowledge/targeting.md`.** This file is the tool surface.

> **Editing note.** This file is canonical for the audience surface and is referenced as such by `agents/realize-analyst.md`, `skills/discovery/SKILL.md`, `skills/manage-campaigns/SKILL.md`, `skills/manage-campaigns/references/mcp-write-surface.md`, `knowledge/targeting.md`, `knowledge/reach-estimation.md` and `docs/realize-best-practices-gap.md`. Those carry short quick references; on any disagreement this file wins. Update them alongside any change here.

## What exists, and what this plugin does with it

> **MCP support status (updated 2026-10-14).** The audience reads have been upstream since 2026-04-30; `create_audience` / `update_audience` landed 2026-09-07.

| Capability | Upstream tool or field | Wired here |
|---|---|---|
| List / read audiences | `search_audiences` | Yes |
| Predictive audiences already built on the account (the `lookalike` wire name) | `search_lookalike_audiences` | Yes — read-only discovery |
| Contextual segments | `search_contextual_segments` | Yes |
| Point a campaign at an audience | `audiences_targeting` on the campaign writes | Yes — a normal gated write |
| Point a campaign at a predictive audience | `lookalike_audience_targeting` on the campaign writes | Yes — a normal gated write |
| Create a pixel, combined or CRM audience | `create_audience` | **No — exists upstream, deliberately not enabled here** |
| Edit or archive an audience | `update_audience` | **No — exists upstream, deliberately not enabled here** |

And two facts about the MCP and the API rather than about this plugin's choices:

| Capability | Upstream |
|---|---|
| Build a predictive audience (audience expansion) from a seed audience | **No tool at any level** — the Realize UI only |
| Delete an audience | **No endpoint exists anywhere, not even in the UI** |

**Four states, and they must not be collapsed into each other.** *Wired* is what this plugin does today. *Not enabled here* is a decision this plugin made; say so, and never say Realize cannot do it. *No tool at any level* is a platform fact. *No endpoint exists* means not even the UI deletes — archiving is the only retirement. Archiving reverses for every subtype — `status: ACTIVE` for a pixel audience, `is_archived: false` for the rest.

`create_audience` and `update_audience` may appear in the session's tool list, because no tool allowlist is set. Do not call them. A CRM upload puts customer records on the wire, so enabling it is a reviewed decision rather than something to infer from the tool being reachable.

## Reading an audience

`search_audiences` has **three modes**, and picking the wrong one returns a plausible, wrong result set.

1. **List** — `account_id` only; omit `audience_id`. Every subtype at once (first-party, custom, combined, lookalike, third-party). Each row carries `id`, `audience_name`, `data_type`, `is_archived`. These ids are what `audiences_targeting` takes. **It mixes the account's own audiences with third-party marketplace rows, and `data_type` does not separate them** — it is upstream's own vocabulary, not a provenance flag — so present the result as a catalogue of what is targetable, not as "your audiences".
2. **By id** — `audience_id` **plus** `audience_type`, which routes the lookup. This is the only way to see the writable detail: `condition` / `effects` / `status` on a pixel audience, `combined_audience_components` on a combined one. **Only `PIXEL`, `COMBINED` and `CUSTOMER_LIST` are readable this way.** The listing covers five subtypes, so a lookalike or third-party row has *no* `audience_type` that will fetch it — its listing row is all there is.
   **Choosing `audience_type` is not something the data tells you.** `data_type` cannot do it (below), and a 404 does not identify the right one either, so there is no rule to derive it. Use what is known about how the audience was built — a CRM upload is `CUSTOMER_LIST`, a rule built on pixel events is `PIXEL`, one assembled from other audiences is `COMBINED` — and otherwise **ask the user**. If they cannot say either, answer from the listing row and name what the full read would have added, rather than guessing a subtype or refusing.
3. **Combinable** — `combinable=true` lists what may go *inside* a combined audience. This is a **different population**, dominated by third-party marketplace segments, and it contains only some of the account's own audiences. Only `audience_id` and `search_text` apply; `audience_type` and the country filters (`country_codes`, `country_targeting_type`, which otherwise narrow the list by the countries an audience targets) are **refused** here, not ignored. `audience_id` still narrows the listing to one row, but without the subtype lookup.

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

The `lookalike_audience_targeting` block takes `{rule_id, similarity_level}` objects instead of bare ids, is INCLUDE-only, and allows one outer block. **`similarity_level` is a closed set — 1, 2, 3, 4, 5, 10, 15, 20, 25 — and the valid values differ by seed:** a CRM seed takes 5/10/15/20/25, a pixel seed takes 5 and nothing else, a PBP seed takes 1-5. Upstream calls the whole set percentages and does not distinguish the PBP values further, so confirm which seed is meant before mapping a user's percentage onto a number.

The MCP validates membership of the combined set only; the seed-specific resolution happens server-side. So a value that is wrong *for that seed* passes on the way in untouched — nothing will stop it before it reaches Realize, and what Realize then does with it is not documented. That is why a user asking for "a 1% lookalike", the vocabulary they bring from other platforms, must not simply become `similarity_level: 1`. **Upstream does not document the subtype as a field `search_lookalike_audiences` returns**, so do not assume the listing labels it — so unless the user or the audience's own name makes it unambiguous, offer the valid values and let them choose rather than picking one. Those are wire names: to the user these are **predictive audiences / audience expansion**, never "lookalikes" — see the naming table in `os/guardrails.md`.

## Why predictive-audience creation has no way in

Predictive / lookalike creation is the one worth stating carefully, because upstream's own prose contradicts its enum — including in one tool description a caller can read. **The enum is the truth**, and the handler enforces it before the file is even fetched (upstream notes that its schema enums are advisory on their own): `crm_targeting_type` is `TARGETING_SUPPRESSION` and nothing else, so a customer list can be uploaded only to target or suppress the people in it. Building a predictive audience from that seed is refused outright.

A second route looks open and is not: a lookalike-subtype rule authored through the pixel path is accepted, then filtered out of every listing and reads back 403 — it succeeds and is invisible, which is worse than an error. Neither path is a way in, and upstream's own prose is misleading on this in two places, so trust the enum. Predictive audiences are built in the **Audiences** area of Realize; say that, and call them *predictive audiences* or *audience expansion* to the user, never "lookalikes".
