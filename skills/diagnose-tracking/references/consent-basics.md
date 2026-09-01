# Consent & the Pixel — Why "It Fires for Me but Not in the EU"

In consent-regulated regions (EU/UK under GDPR; several US states), the pixel's behavior is shaped by the
site's consent tool (CMP — the cookie banner and the machinery behind it). "The pixel fires but EU
conversions don't report" is usually a **consent problem, not an install problem**. This file covers how to
recognize it and what to recommend.

## How consent shows up on the wire

When the pixel runs with a recognized consent setup, its requests carry consent parameters — visible in a
HAR on the `unip?` requests (parameter names like `cbp`, `tcs`, `gpp`). Their presence means the user's
consent decision traveled with the event; their **absence** on an EU visitor's traffic means downstream
processing may drop the event even though it reached Taboola.

Two patterns to check in the HAR:

1. **The pixel doesn't load at all until the banner is accepted.** That's the consent tool gating the
   script — correct behavior when configured per the advertiser's policy, but it means any capture taken
   *before* accepting the banner proves nothing. Always accept the banner, then capture.
2. **The pixel loads and fires, but no consent parameters appear on its requests.** The consent tool isn't
   one the pixel recognizes, or the install type can't pass parameters at all (see next section).

## Image pixels can't do consent

An image-pixel install (`<img>` tag; shows as `it=UNDEFINED` on the wire) cannot execute JavaScript, so it
can never pass consent parameters. For an EU advertiser this means fires that reach Taboola may be dropped
downstream — the classic signature is "traffic dominated by `UNDEFINED` install type + conversions that
never report in regulated regions". The fix is an install-type change: move to the JavaScript pixel or GTM.

## When the site's consent tool isn't recognized

The pixel auto-detects widely used consent platforms. If the site uses one it doesn't recognize (a
home-built banner, a regional niche tool), consent parameters won't be populated — and the advertiser
cannot fix that by hand-crafting the parameters themselves; that schema is internal to the pixel.

**The recommendation ladder for an unrecognized consent tool:**

1. **Enable IAB TCF 2.2 in the consent tool** (most CMPs can). TCF is the industry-standard consent API —
   once it's active, the pixel picks consent up through it regardless of which CMP brand is behind it.
   **Follow-up step that's easy to miss:** add **Taboola (IAB vendor ID 42)** to the CMP's vendor list,
   or consent can still read as not-granted for Taboola specifically.
2. If TCF isn't an option, raise it with the account team — deeper integrations are possible but are a
   Taboola-side decision, not self-serve.

## US state privacy (GPP)

There is no GDPR-style opt-in gate in the US; tracking is allowed by default and Taboola honors browser-sent
**opt-out** signals (the IAB GPP standard) automatically. Nothing to configure pixel-side — but a HAR from
an opted-out browser legitimately shows restricted behavior; capture with a clean profile when testing.

## When to reach for this file

- EU/regulated-region advertiser: pixel loads but no `page_view`, or fires but conversions never report →
  check for a consent gate on `tfa.js` and whether consent parameters appear on the `unip?` requests.
- Traffic dominated by `it=UNDEFINED` for an EU advertiser → suspect an image pixel; recommend JS/GTM.
- "Can we just add the consent parameters ourselves?" → no; recommend the TCF 2.2 path above.
- A CSP or consent block seen live: the browser console logs a line like
  `Refused to load the script '…tfa.js' because it violates … Content Security Policy` — direct evidence
  for the *implemented but blocked* layer; the fix is the site's CSP/consent config, not the pixel code.
