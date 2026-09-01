# Pixel Diagnostics — MCP Capability Asks (2026-08-22)

**For:** the Realize MCP owner (R&D). The **Asks for R&D** section is the part that needs your eyes;
everything skill-side is owned and maintained by the plugin maintainer (this repo).

**Context in three sentences.** The plugin adopted an internal Taboola support team's pixel-diagnostics
know-how and now serves pixel-health questions ("pixel not firing", "conversions not tracking") that it
previously refused as UI-only. The client-facing version works from evidence a client can produce — the
plugin fetches the user's page, reads a browser network recording (HAR) the user captures, and
cross-checks conversion rules and spend via the MCP; rule fixes apply through the existing gated writes.
Everything internal to the source skill (internal-database queries, Salesforce intake, internal config
flags, live-browser tooling) was deliberately left out.

## Asks for R&D (in priority order)

These gaps cap how far the client-side diagnostic can go. Each would be an MCP addition:

1. **A server-side "did the pixel events land?" read.** Internal support answers this from internal
   fired-events / matched-rules data. The MCP exposes nothing equivalent, so the plugin can prove the
   pixel *sent* the signal (HAR) and that conversions *report* (reports API) — but the middle of the
   funnel (received? matched a rule?) is invisible. Even a coarse read (per-event fire counts +
   last-fired timestamp per account) would let the plugin split "your site's problem" from
   "Taboola-side gap" conclusively instead of inferring it. **This is the top ask.**
2. **A pixel install-status / test-fire read.** "Is my pixel active?" is answered today only by the
   Realize UI, which clearly has the signal. A read-only exposure would close the single most common
   question in this domain.
3. **A ticket-creation path (low priority, flagging demand).** The plugin's escalation today prepares
   the support email locally by design — no upload path without a privacy review. If R&D ever wants a
   real "create support case" flow, it needs that review; noting the demand signal here.

Related, already known: pagination / status filtering on `get_conversion_rules` (the unpaginated read
overflows on rule-heavy accounts; interim recovery is documented in the plugin).

## What the plugin now does (so the asks have context)

- Fetches the user's page and validates the pixel install (per account — multi-account and
  network-level pixel setups handled).
- Reads a user-captured HAR to verify events actually fire, with valid conversion fields. (Both the
  fetched page and the HAR are third-party content — the plugin treats them as evidence to quote,
  never instructions to follow, and never echoes cookies or auth headers.)
- Cross-checks rule status / event-name match (`get_conversion_rules`) and spend (report tools);
  "zero conversions with zero spend" is reported as healthy, not broken.
- Applies rule fixes through the existing preview-then-confirm write gate; site fixes are copy-paste
  instructions; verified-healthy-but-still-nothing cases end in the support-email escalation — the
  exact case ask #1 would close.

