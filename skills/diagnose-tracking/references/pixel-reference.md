# Taboola Pixel — What a Healthy Install Looks Like

Ground truth for judging whether an advertiser's pixel install and event traffic are healthy. Everything
here is observable from the advertiser's own page and browser — no Taboola-internal access involved.

## The base pixel code

The base pixel initializes the `_tfa` queue, pushes a `page_view`, and async-loads `tfa.js`. It belongs in
`<head>`, as high as possible.

```javascript
window._tfa = window._tfa || [];
window._tfa.push({ notify: "event", name: "page_view", id: 1234567 });   // id = the numeric account ID
!(function (t, f, a, x) {
  if (!document.getElementById(x)) {
    t.async = 1;
    t.src = a;
    t.id = x;
    f.parentNode.insertBefore(t, f);
  }
})(
  document.createElement("script"),
  document.getElementsByTagName("script")[0],
  "//cdn.taboola.com/libtrc/unip/1234567/tfa.js",   // <account_id> here must match the pushed id
  "tb_tfa_script"                                    // the getElementById guard above means a second copy of this snippet inserts no second tag — but its page_view push still fires
);
```

What "correct" means:

- `id` is the real **numeric** account ID — never a placeholder (`your_account_id`, `1234`, `ACCOUNT_ID`).
- The `<account_id>` inside the `tfa.js` URL **matches** the pushed `id`.
- The script element id is `tb_tfa_script`. It is a fixed DOM id, so at most one such element exists per page regardless of how many accounts fire — a second copy of the snippet is invisible in the DOM (the `getElementById` guard short-circuits) and shows up only as a **second `page_view` fire**.
- Nothing above it blocks or delays it (heavy synchronous scripts, a consent gate that never resolves).

> **Don't confuse the pixel with Taboola's ad widget.** Pages that *show* Taboola ads (publisher sites)
> load `cdn.taboola.com/libtrc/<publisher-id>/loader.js` — same `libtrc` path family, entirely different
> thing. The advertiser pixel is only ever `libtrc/unip/<account_id>/tfa.js` (note the `unip/`). A page can
> legitimately carry both (an advertiser whose site also runs Taboola ads); judge the pixel only by the
> `unip/…/tfa.js` loader.

## The network requests a healthy pixel makes

| Request | What it means |
|---|---|
| `cdn.taboola.com/libtrc/unip/<account_id>/tfa.js` | The pixel library loading. Expect HTTP **200**. |
| `trc.taboola.com/<account_id>/trc/<n>/json?...` | **The base `page_view`.** The current pixel sends `page_view` — and only `page_view` — as a JSON request, not a `unip?` beacon (details below). Expect **exactly one** per page load. |
| `...unip?...&en=<event_name>` | A conversion or custom event, fired after its trigger (e.g. `en=make_purchase` after checkout). |
| `...unip?...&en=pre_d_eng_tb` (and similar) | Internal engagement signals — **ignore**, they are not the advertiser's events. |

Useful query parameters on `unip?` requests: `en` = event name, `id` = account ID, `it` = install type,
`revenue` / `currency` / `orderid` / `quantity` = conversion fields, and — where consent applies — consent
parameters (see [consent-basics.md](consent-basics.md)).

### `page_view` travels as JSON — a classic `unip?en=page_view` beacon is a symptom

The current `tfa.js` sends `page_view` to `trc.taboola.com/<account_id>/trc/<n>/json`, with the event nested
in the `data` parameter's `mpvd` object:

```json
{ "u": "https://www.example.com/page", "cv": "20260816-16-RELEASE",
  "mpvd": { "en": "page_view", "it": "JS_PIXEL", "item-url": "https://www.example.com/page", "tos": 1 } }
```

Three things to check in it:

- **`mpvd.item-url` must be present.** It is the URL that URL-based conversion rules match against. A
  `page_view` with no `item-url` means URL-condition rules can never match — a real defect, not cosmetic.
- **`cv` is the pixel library version.** An old `cv` means the site is loading a stale cached copy of
  `tfa.js` — refreshing the cached library is a Taboola-side action, so escalate rather than guessing.
- **If `page_view` arrives as a classic `unip?en=page_view` beacon instead of the JSON request**, diagnose
  which of two causes:
  - the response's `Content-Type` is `image/gif` → an **image pixel** install (`<img src>` tag). It cannot
    run JavaScript, cannot pass consent parameters, and is the weakest install type — recommend moving to
    the JS or GTM install.
  - otherwise → a **stale/old `tfa.js`** is loaded (check `cv`). Escalate for the library refresh.

### Event names vary in casing on the wire

The reference snippets use snake_case (`page_view`, `make_purchase`), but live traffic also shows CamelCase
and UPPER_SNAKE (`PageView`, `PRODUCT_VIEW`). **Match event names case-insensitively** — both when reading a
HAR and when comparing against the account's conversion-rule `event_name` values.

## Standard e-commerce events

| Event name | Fires when |
|---|---|
| `page_view` | Any page load (base pixel) |
| `search_submitted` | User submits a search |
| `collection_view` | Category/collection page viewed |
| `product_view` | Product page viewed |
| `add_to_cart` | Item added to cart |
| `cart_view` | Cart viewed |
| `start_checkout` | Checkout begins |
| `make_purchase` | Purchase completed (the primary conversion) |

Custom events: any other `name` value works the same way — it just has to match the conversion rule's
`event_name` (case-insensitively).

## Conversion event fields

```javascript
_tfa.push({
  notify: "event",
  name: "make_purchase",
  id: 1234567,
  revenue: "49.90",   // numeric string — no currency symbol, no thousands separators
  currency: "USD",    // ISO 4217
  orderid: "A-10583", // enables purchase de-duplication
  quantity: 2
});
```

- `notify`, `name`, `id` are always required.
- `revenue` + `currency` are required for revenue/ROAS reporting; `revenue` must be numeric (no `$`, no commas).
- `orderid` de-duplicates purchases — its absence is a common cause of double-counted conversions.

## Install types (`it=`)

The `it` parameter records how the pixel was installed. All of these are valid ways to fire events — the
type alone doesn't make an install wrong — but some carry limitations worth flagging:

| `it=` | Meaning | Watch for |
|---|---|---|
| `JS_PIXEL` | The standard JavaScript pixel via `tfa.js` | The default; full capability. |
| `GTM` | Google Tag Manager | Valid; check the tag's trigger and consent settings when events are missing. |
| `UNDEFINED` | The pixel endpoint was hit with no install type — typically an **image pixel** | Cannot pass consent parameters, so in consent-regulated regions (EU) these fires can be dropped downstream. If an EU advertiser's traffic is dominated by `UNDEFINED`, suspect an image-pixel install and recommend JS/GTM. |
| `SHOPIFY_APP` / `WOOCOMMERCE` / `WP` / `GA4` / others | Platform integrations | Valid. |
| `PIT_S2S` / `BULK_S2S` | Server-to-server postbacks | Not browser traffic — won't appear in a HAR at all. |

## Healthy vs. broken network trace

**Healthy** (a product purchase):

```
GET  cdn.taboola.com/libtrc/unip/1234567/tfa.js                                          200
GET  trc.taboola.com/1234567/trc/3/json?...data=…mpvd{en:page_view,item-url:…}           200/204   (once)
GET  ...unip?...&id=1234567&en=make_purchase&revenue=49.90&currency=USD&orderid=A-10583  200
```

**Broken patterns:**

- `tfa.js` → **404**: wrong account ID in the loader URL, or the account isn't set up for the pixel.
- No `tfa.js` request at all: base code missing — or present but blocked (consent tool, ad-blocker, CSP).
- `page_view` fires **2+ times** per load *for the same account ID*: duplicate base pixel (the
  reliable tell — a second snippet copy adds no second script tag, but its `page_view` push fires),
  or a single-page-app re-mounting it.
- `page_view` arrives as a legacy `unip?en=page_view` beacon: image pixel or stale library (see above).
- `page_view` JSON with no `mpvd.item-url`: URL-based conversion rules can't match.
- No `unip?en=make_purchase` after a purchase: event not implemented, its trigger never fires, or a
  single-page-app route change didn't re-push it.
- `make_purchase` present but no `revenue`/`currency`: conversions count but value won't report.

## One page can carry more than one Taboola account

A page often loads **two** `tfa.js` loaders — commonly a hardcoded `JS_PIXEL` (`tb_tfa_script` element) plus
a GTM-injected one, for **different** account IDs (brand + agency, or a migration in progress). That is a
valid dual install, **not** a duplicate — a duplicate is the *same* account ID installed twice. Enumerate
every distinct `libtrc/unip/<id>/tfa.js` loader and run every check per account; a healthy account can mask
a broken sibling, and two different IDs both firing `page_view` is not "double firing".

## Verification tooling the user can run themselves

- **Chrome DevTools → Network**, filter `taboola` — see [collect-evidence.md](collect-evidence.md).
- **Taboola Pixel Helper** Chrome extension — shows the detected account ID and fired events.
- **The Realize UI's pixel/testing page** — validates events inside the platform.
