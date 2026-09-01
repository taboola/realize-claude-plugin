# Diagnostic Checklist — Symptom → Cause → Fix

Symptom-first decision tree. Find the row matching what was reported / what the evidence shows, then work
it. **Confirm the "Look for" column before asserting a cause** — every fix below is wasted (and
credibility-burning) when applied to the wrong layer.

The four layers, in the order to rule them out:

1. **Not implemented** — the code isn't on the page.
2. **Implemented but blocked** — the code is there; a consent tool, ad-blocker, or the site's own security
   policy (CSP) stops it from running.
3. **Fires but wrong data** — events go out with missing or malformed fields.
4. **Fires fine — the gap is downstream** — client side is healthy; the issue is rule configuration,
   attribution, or Taboola-side processing.

## A. Base pixel / `tfa.js` not loading

| Symptom | Look for | Likely cause | Fix |
|---|---|---|---|
| No `tfa.js` request in the HAR at all | Base code absent from page source **and** no runtime request | Base code not installed — or installed on a different page/path than the one tested | Install the base code in `<head>` ([pixel-reference.md](pixel-reference.md)); confirm the tested URL is one where it should run |
| `tfa.js` returns **404** | The account ID inside `//cdn.taboola.com/libtrc/unip/<id>/tfa.js` | Wrong or mistyped account ID — or the account isn't set up for the pixel | Correct the ID; if it's correct, verify the account via `search_accounts` and the Realize UI's pixel page |
| Base code present in source but no runtime `tfa.js` request | Browser-console errors; a consent banner; a `Refused to load` CSP line | The consent tool blocks the script until opt-in, or the site's CSP blocks `cdn.taboola.com` | Consent: categorize the pixel correctly in the consent tool ([consent-basics.md](consent-basics.md)). CSP: add `cdn.taboola.com` and `trc.taboola.com` to the site's allowlist |
| Loads only after a long delay | Pixel placed low in `<body>`, or behind a heavy synchronous script | Late placement | Move the base code high in `<head>` |

## B. `page_view` issues

| Symptom | Look for | Likely cause | Fix |
|---|---|---|---|
| Pixel shows "inactive" in Realize; no `page_view` on the wire | The `trc/<n>/json` page-view request missing | The `page_view` push is missing, or `tfa.js` never loaded (see §A) | Restore the `page_view` push in the base code |
| `page_view` fires **2+ times** per load, same account ID | Two `page_view` pushes / two `trc/<n>/json` requests for the same ID — **not** two `tb_tfa_script` tags (the snippet's `getElementById` guard means the second copy inserts no tag); also GTM + hardcoded install of the same ID | Duplicate base pixel | Remove one install |
| `page_view` fires once per account but two account IDs appear | Two distinct `libtrc/unip/<id>/tfa.js` loaders | Dual install (brand + agency, or a migration) — **not** a bug by itself | Confirm which account the campaigns run under; diagnose each separately |
| The on-page account ID isn't the user's account | Whether that ID is the user's **parent network** (`search_accounts`; rule ownership via `advertiser_id`) | Network-level pixel — one pixel for the whole network, fired across its advertisers' sites; rules owned at network level | Valid setup, not a wrong-ID install. Verify the network relationship before "fixing" the ID; conversions and rules may deliberately live at network level |
| No `page_view` on navigation within the site | Only the first page fires; later navigations don't | Single-page app that doesn't re-push on route change | Re-push `page_view` on each route change |
| `page_view` arrives as a legacy `unip?en=page_view` beacon | Response `Content-Type`; the `cv` library version | Image pixel, or stale cached `tfa.js` ([pixel-reference.md](pixel-reference.md)) | Image pixel: move to JS/GTM install. Stale library: escalate — refreshing Taboola's cached library isn't something the advertiser can do |

## C. Conversion / custom events not tracking

| Symptom | Look for | Likely cause | Fix |
|---|---|---|---|
| No `unip?en=<event>` after the action | The event request absent from the HAR after the trigger was performed | Event not implemented, or its trigger (e.g. a GTM tag) never fires | Implement the `_tfa.push` on the correct trigger; check GTM trigger conditions and that the tag is published |
| Event fires but conversion value is 0 / blank | `revenue` / `currency` missing or malformed in the request | Missing fields, or `revenue` contains `$` or commas | Send numeric `revenue` (no symbols) + ISO `currency` |
| Purchases double-counted | The same purchase produces two `make_purchase` requests; `orderid` missing or repeated | Event fires again on page refresh / re-render, or no `orderid` to de-duplicate | Add a unique `orderid`; fire once per completed order |
| Event fires on pages it shouldn't | `en=<event>` on unrelated pages | Trigger too broad (e.g. an all-pages GTM tag) | Tighten the trigger to the specific action/page |
| Event fires but Realize shows nothing for it | The on-wire `en=` value vs the account's conversion rules | The fired name doesn't match any rule's `event_name` (typo, casing is fine — spelling isn't), or no rule exists for it | Compare with `get_conversion_rules` (case-insensitive). Fix the pushed name, or create/fix the rule — a gated write via the write path |
| Conversions counted but rule recently stopped | The rule's `status` in `get_conversion_rules` | Rule was disabled or archived | Re-enabling is a gated write (account-level consequences — the write path previews them). Never assume; confirm the status first |

## D. Environment / blocking

| Symptom | Look for | Likely cause | Fix |
|---|---|---|---|
| Works in your test, missing for some real users | Ad-blockers; privacy-focused browsers | Client-side blocking of tracking hosts | Expected partial loss; if material, discuss server-side tagging options with the account team |
| Intermittent across regions | Consent differences by geography | The consent tool blocks the pixel pre-consent in regulated regions | Confirm the consent setup — see [consent-basics.md](consent-basics.md) |
| GTM-managed and nothing fires | GTM container placement; tag status | Container not high in `<head>`, or the tag is paused / unpublished / consent-gated | Move the container up; publish the tag; check its consent settings |
| EU traffic and conversions rarely report | `it=UNDEFINED` dominating the requests; no consent parameters on `unip?` | Image-pixel install — cannot pass consent parameters, so regulated-region fires can be dropped downstream | Move to a JS or GTM install ([consent-basics.md](consent-basics.md)) |

## E. Client side looks healthy but Realize shows no conversions

The pixel loads (200), events fire with valid fields — and the account still reports nothing. Work this
order, and do not skip step 1:

1. **Is the conversion rule live and matching?** `get_conversion_rules` → the rule exists, `status` is
   ACTIVE, and its `event_name` matches the on-wire `en=` value case-insensitively. A disabled/archived
   rule or a name mismatch is the finding — fix via the write path (gated) or fix the pushed name (site-side).
2. **Is anything spending?** Conversions in Realize are attributed to Taboola-driven traffic. **A campaign
   with no active spend produces zero conversions by design — that is expected, not broken.** Pull a
   campaign-grain spend report (dynamic report) before calling anything a tracking failure. No spend → report the pixel and rule
   as healthy and stop.
3. **Rule live + campaigns spending + still zero?** Check the attribution windows on the rule
   (`look_back_window` in days; `view_through_look_back_window` in minutes) — a very short window explains
   few attributed conversions. Adjusting it is a gated write.
4. **All of the above healthy?** The remaining possibilities are on Taboola's side (event ingestion,
   attribution processing) — not visible from outside. Escalate with the evidence: the SKILL.md's
   escalation section packages exactly this case.

## F. Pages the pixel can never run on

An app store URL (`play.google.com`, `apps.apple.com`) — typical for mobile-app-install campaigns — cannot
carry the advertiser's code, so every row above is inapplicable: no base code, no HAR evidence, no fix on
the page. App conversions are measured server-to-server (usually via a mobile measurement partner).
"Pixel not installed" is a **false finding** on these URLs; the correct answer explains the S2S/MMP path
(method selection: `knowledge/tracking.md`).

## G. What this checklist never concludes

- **"The pixel doesn't fire" from page source alone.** Single-page apps and GTM inject the pixel at
  runtime; absence from fetched HTML proves nothing. Only a HAR / runtime evidence supports that claim.
- **"Tracking is broken" from zero conversions alone.** Rule status and campaign spend first — §E.
- **Anything about whether events landed inside Taboola's systems.** That data isn't visible to this
  plugin. The honest output for §E step 4 is "healthy on your side, escalate" — never an invented
  server-side fact.
