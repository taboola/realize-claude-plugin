#!/usr/bin/env bash
# Realize ToolKit — brand and guardrail linter.
# Runs against the public-facing files in /knowledge, /docs, /os, README.md.
# Exits non-zero on any FAIL. WARN lines do not block.
#
# Usage:
#   scripts/brand-check.sh             # check the repo
#   scripts/brand-check.sh --verbose   # show every match line
#
# Aligned with the Apr 2026 Realize Brand Guardrails for LLM Outputs.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERBOSE=${1:-}

fail_count=0
warn_count=0

say() { printf '%s\n' "$*"; }

scan_fail() {
    local label="$1" ; shift
    local pattern="$1" ; shift
    local -a targets=("$@")
    local hits
    hits=$(grep -HniE "$pattern" "${targets[@]}" 2>/dev/null || true)
    if [ -n "$hits" ]; then
        fail_count=$((fail_count + 1))
        say "FAIL  [$label]"
        if [ "$VERBOSE" = "--verbose" ]; then
            printf '%s\n' "$hits" | sed 's/^/        /'
        else
            printf '%s\n' "$hits" | sed 's/^/        /' | head -n 3
            local extra
            extra=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
            if [ "$extra" -gt 3 ]; then
                say "        … and $((extra - 3)) more (run with --verbose to see all)"
            fi
        fi
    fi
}

scan_warn() {
    local label="$1" ; shift
    local pattern="$1" ; shift
    local -a targets=("$@")
    local hits
    hits=$(grep -HniE "$pattern" "${targets[@]}" 2>/dev/null || true)
    if [ -n "$hits" ]; then
        warn_count=$((warn_count + 1))
        say "WARN  [$label]"
        if [ "$VERBOSE" = "--verbose" ]; then
            printf '%s\n' "$hits" | sed 's/^/        /'
        else
            printf '%s\n' "$hits" | sed 's/^/        /' | head -n 3
        fi
    fi
}

# Files to lint — public and OS markdown, plus README.
TARGETS=()
while IFS= read -r line; do
    [ -n "$line" ] && TARGETS+=("$line")
done < <(find "$ROOT/knowledge" "$ROOT/docs" "$ROOT/os" -type f -name '*.md' 2>/dev/null)
[ -f "$ROOT/README.md" ] && TARGETS+=("$ROOT/README.md")

if [ "${#TARGETS[@]}" -eq 0 ]; then
    say "No files to scan."
    exit 1
fi

say "Realize ToolKit brand-check"
say "==========================="
say "Scanning ${#TARGETS[@]} file(s)."
say ""

# Targets that must pass on ALL files, including /os.
ALL=("${TARGETS[@]}")

# Targets that must pass on PUBLIC files only (not /os, which is the rulebook
# and is allowed to cite banned strings to enforce them).
PUBLIC=()
for f in "${TARGETS[@]}"; do
    case "$f" in
        */os/*) ;;
        *) PUBLIC+=("$f") ;;
    esac
done

# ---- FAIL checks ----

# 1. Brand naming violations
scan_fail "Banned brand naming"             '\b(taboola realize|realize by taboola|realize ads|taboola ads)\b' "${PUBLIC[@]}"
scan_fail "Realize as a verb"               '(realize\s+your\s+(campaigns|goals|potential)|realize\s+more\s+conversions|help\s+advertisers\s+realize)' "${PUBLIC[@]}"

# 2. Privacy / safety absolute claims
scan_fail "Absolute privacy / safety claim" '(100%\s+brand\s+safe|gdpr\s+compliant|no\s+cookies\s+needed|we\s+don'\''t\s+collect\s+any\s+data|fully\s+anonymous\s+targeting|we\s+track\s+users\s+across\s+the\s+web|we\s+know\s+everything\s+about)' "${PUBLIC[@]}"

# 3. Banned codenames and schema (enforced as a defense-in-depth layer alongside guardrails.md → Banned brand variations / Internal field names)
scan_fail "Banned codename: Backstage"      '\bbackstage\b' "${PUBLIC[@]}"
scan_fail "Banned codename: blindspot"      '\bblindspot\b' "${PUBLIC[@]}"
scan_fail "Banned schema / column names"    '\b(syndicator_id|affiliate_id|unip_rules|campaign_history)\b' "${PUBLIC[@]}"
scan_fail "Internal data-store: Vertica"    '\bvertica\b' "${PUBLIC[@]}"
scan_fail "Internal data-store: trc schema" '\b(from\s+trc\.|trc\.(sp_|unip_|agg_))' "${PUBLIC[@]}"
# Match employee-shaped emails (first.last@taboola.com) but NOT support@/billing@ aliases.
# Requires at least one dot in the local part.
scan_fail "Internal Taboola employee email" '[a-z][a-z.-]*\.[a-z]+@taboola\.com' "${PUBLIC[@]}"
# Note: item_id removed from this list in the plugin's copy of the linter — it's a public MCP tool parameter name (clients pass it to get_item). It remains banned in the toolkit's linter where it refers to internal schema columns.

# 4. Repo / authorship leaks (always)
scan_fail "Inline Project Mastery citation" 'Source:\s*Project Mastery' "${ALL[@]}"
scan_fail "Internal team-member names"      '\b(amit|katherine|aviv|eyal|maayan|tzuf)\b' "${ALL[@]}"
scan_fail "Hannah as internal name"         '\bHannah\b' "${ALL[@]}"
scan_fail "Abby identity leak"              '\b(abby|i am abby)\b' "${ALL[@]}"

# 5. Legacy category framing and banned positioning
scan_fail "Legacy category framing"         '\b(content\s+discovery\s+platform|content\s+discovery\s+product|recommendation\s+engine|content\s+recommendation|moments\s+of\s+next|ltv\s+platform|full[- ]funnel\s+platform|full[- ]funnel|native[- ]only\s+(platform|network)|realize\s+feed)\b' "${PUBLIC[@]}"
scan_fail "Banned funnel framing"           '\b(top\s+of\s+funnel|upper\s+funnel|tofu)\b' "${PUBLIC[@]}"
scan_fail "Banned positioning"              '\b(brand\s+sentiment|cookie\s+deprecation|awareness\s+platform|branding\s+platform)\b' "${PUBLIC[@]}"

# 6. Legacy perceptions (the fear list)
scan_fail "Legacy perceptions"              '\b(chumbox|clickbait|scam\s+ads?|spam\s+ads?|low[- ]quality\s+(traffic|ads?)|low\s+visibility\s+ads?|questionable\s+ad\s+quality|old[- ]school\s+content)\b' "${PUBLIC[@]}"

# 6b. Publisher-character framing (see os/guardrails.md → Publisher and site framing).
# Catches qualitative judgments applied to publisher inventory in static content.
# Runtime is governed by the guardrail; this is build-time defense-in-depth.
scan_fail "Publisher-character framing"     '\b(junk|garbage|trash|crap|sketchy|shady|spammy|dodgy|dirty|rotten)\s+(site|sites|publisher|publishers|inventory|supply|placement|placements|traffic)\b' "${PUBLIC[@]}"
scan_fail "Publisher-character framing"     '\b(bad|poor|low[- ]quality|low[- ]grade|cheap|junky|garbage|trash(y)?)\s+(site|sites|publisher|publishers|inventory|supply)\b' "${PUBLIC[@]}"
scan_fail "Rescue / salvage framing"        '\b(rescue|salvage|write[- ]off|write[- ]offs?)\s+(this|the|some|those)?\s*(site|sites|publisher|publishers|inventory|supply|campaign|campaigns)\b' "${PUBLIC[@]}"

# 6c. Reader framing (see os/guardrails.md → Reader framing — the operator, not a relay through them).
# Catches AM-relay posture in static content. Runtime is governed by the guardrail;
# this is the build-time net. Possessive "your client" stays valid for agency context.
scan_fail "AM-relay framing — verbs at the advertiser"   '\b(ask|tell|warn|remind|advise|inform|push|instruct|encourage)\s+(the\s+)?(advertiser|client)\b' "${PUBLIC[@]}"
scan_fail "AM-relay framing — modal at the advertiser"   '\bthe\s+(advertiser|client)\s+(should|must|needs\s+to|has\s+to|will\s+need\s+to)\b' "${PUBLIC[@]}"
scan_fail "AM-relay framing — set expectations"          '\bset\s+(the\s+)?(advertiser|client)\s+expectations?\b' "${PUBLIC[@]}"
scan_fail "AM-relay framing — discuss with"              '\bdiscuss\s+(this\s+)?with\s+the\s+(advertiser|client)\b' "${PUBLIC[@]}"
scan_fail "AM-relay framing — communicate to clients"    '\b(how\s+to\s+)?communicate\s+this\s+to\s+(clients?|the\s+(advertiser|client))\b' "${PUBLIC[@]}"

# 7. Generic ad-tech flattening
scan_fail "Generic ad-tech framing"         '\b(adtech|martech|marketing\s+technology|omnichannel\s+platform|media\s+buying\s+software|marketing\s+solution|digital\s+advertising\s+tool|campaign\s+management\s+solution)\b' "${PUBLIC[@]}"

# 8. Deprioritized product names
scan_fail "Deprioritized product names"     '\b(taboola\s+select|pixel\s+predictive|moat|cpm\s+(buying|bidding)|pmp|private\s+marketplaces?|high\s+impact\s+placements?)\b' "${PUBLIC[@]}"

# 9. Competitor vocabulary
scan_fail "Competitor vocab — ad set"       '\bad\s+sets?\b' "${PUBLIC[@]}"
scan_fail "Competitor vocab — ad group"     '\bad\s+groups?\b' "${PUBLIC[@]}"
scan_fail "Competitor vocab — boost"        '\bboosted?\s+posts?\b' "${PUBLIC[@]}"
scan_fail "Competitor vocab — display network" '\bdisplay\s+network\b' "${PUBLIC[@]}"

# 10. Reversed feature names — old names must not appear (post Apr 2026 PDF)
scan_fail "Banned feature: Realize Pixel"   '\brealize\s+pixel\b' "${PUBLIC[@]}"
scan_fail "Banned feature: Realize Audiences" '\brealize\s+audiences\b' "${PUBLIC[@]}"
scan_fail "Banned feature: Realize 1P"      '\brealize\s+1p\b' "${PUBLIC[@]}"
scan_fail "Banned feature: Marketplace Audiences" '\bmarketplace\s+audiences\b' "${PUBLIC[@]}"

# 11. Other deprecated feature names
scan_fail "Banned: campaign cluster"        '\bcampaign\s+cluster\b' "${PUBLIC[@]}"
scan_fail "Banned: self-serve portal"       '\bself[- ]serve\s+portal\b' "${PUBLIC[@]}"
scan_fail "Banned: dashboard / console"     '\b(realize\s+(dashboard|console|backend|portal)|self[- ]serve\s+portal|backend\s+ui)\b' "${PUBLIC[@]}"

# ---- WARN checks (manual review) ----

# Deprecated abbreviations (positive replacements exist; flag for manual fix)
scan_warn "Deprecated feature name (tCPA)"       '\btCPA\b' "${PUBLIC[@]}"
scan_warn "Deprecated feature name (eCPC)"       '\beCPC\b' "${PUBLIC[@]}"
scan_warn "Deprecated feature name (Max Conv / MaxConv)" '\b(max\s+conv|maxconv)\b' "${PUBLIC[@]}"

# Bid / bidding language
scan_warn "Deprecated: bid algorithm / auto-bid" '\b(bid\s+algorithm|auto[- ]bid)\b' "${PUBLIC[@]}"
scan_warn "Deprecated: optimization event"       '\boptimi[sz]ation\s+event\b' "${PUBLIC[@]}"

# Competitor terms (soft — sometimes referenced for clarification)
scan_warn "Deprecated: lookalike as feature"     '\blookalike\s+(audience|segment|targeting|seed|rule)' "${PUBLIC[@]}"
scan_warn "Possible generic 'first-party segments'" '\bfirst[- ]party\s+segments\b' "${PUBLIC[@]}"

# Awareness — Brand Awareness is allowed as the objective name (Tier 2 product context).
# Standalone "awareness" as positioning ("awareness platform", "awareness goals") is banned.
scan_warn "Possible 'awareness' positioning"     '\bawareness\s+(platform|goals?|campaign\s+at\s+scale|focus)\b' "${PUBLIC[@]}"

# Attribution context near CPA / CVR / Leads / ROAS
scan_warn "Check attribution context near CPA"   '\bCPA\s+(is|was|of|=)\s*\$?[0-9]' "${PUBLIC[@]}"
scan_warn "Check attribution context near CVR"   '\bCVR\s+(is|was|of|=)\s*[0-9]' "${PUBLIC[@]}"
scan_warn "Check attribution context near ROAS"  '\bROAS\s+(is|was|of|=)' "${PUBLIC[@]}"

# Tone and overpromise
scan_warn "Overpromise language"                 '\b(guaranteed|guarantees|guarantee)\s+(cpa|roas|scale|improvement|results)' "${PUBLIC[@]}"
scan_warn "Hedging phrases"                      '\b(we\s+think|we\s+believe|we\s+try\s+to)\b' "${PUBLIC[@]}"
scan_warn "Fear-based framing"                   '\byou.{0,3}re\s+losing\s+money\b' "${PUBLIC[@]}"
scan_warn "Lecturing-tone framing"               '\b(wrong\s+frame|the\s+wrong\s+way\s+to\s+(look\s+at|think\s+about)|that\s+is\s+not\s+how)\b' "${PUBLIC[@]}"
scan_warn "Internal process callout"             '\b(mandatory\s+pre[- ]checks?|silent\s+(failure\s+mode|diagnostic[- ]quality\s+killer))\b' "${PUBLIC[@]}"
scan_warn "Unexpanded RCA acronym"               '\bRCA\b' "${PUBLIC[@]}"
scan_warn "Internal signal framework"            '\bSignal\s*[0-9]+\b' "${PUBLIC[@]}"
scan_warn "Raw enum in user-facing text"         '\b(EMPTY_DISPLAY|CVR_LEARNING_LIMITED|CVR_LEARNING_COMPLETE|MAX_CONVERSIONS|TARGET_CPA|MAX_VALUE|PENDING_APPROVAL)\b' "${PUBLIC[@]}"

# Programmatic-buying recommendation (PDF: Realize must be bought direct)
scan_warn "Programmatic / PMP / DSP recommendation" '\b(programmatic(ally)?|via\s+a?\s*(pmp|dsp))\b' "${PUBLIC[@]}"

# ---- Summary ----

say ""
say "---------------------------"
say "Summary: $fail_count FAIL, $warn_count WARN"
say "---------------------------"

if [ $fail_count -gt 0 ]; then
    say "Brand-check failed. Resolve FAIL items before publishing."
    exit 1
fi

if [ $warn_count -gt 0 ]; then
    say "Brand-check passed with warnings. Review WARN items manually."
    exit 0
fi

say "Brand-check clean."
exit 0
