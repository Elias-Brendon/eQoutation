import { BREAKER_TYPES, OTHER_COMPONENT_TYPES } from '@shared/constants/componentTypes'
import type { ExtractedComponent, ExtractionFlag } from '@shared/types/entities'

// The extraction rules themselves — steps, description formatting, sizing
// tables, catalog glossary, company rules. Deliberately contains no
// role-framing ("You are a…"), no "go through every page" imperative and no
// "respond only with…" closer, so it can be embedded as reference material
// inside another task's prompt (see `buildVerificationSystemPrompt`) without
// re-defining the model's role or telling it to extract everything again.
export function buildExtractionRulesSection(
  enabledComponentTypes: string[],
  catalogDescriptions: string[],
  preferredBrands: string[] = [],
  customRules: string[] = []
): string {
  const enabledBreakers = BREAKER_TYPES.filter((type) => enabledComponentTypes.includes(type))
  const enabledOthers = OTHER_COMPONENT_TYPES.filter((type) =>
    enabledComponentTypes.includes(type)
  )
  const customTypes = enabledComponentTypes.filter(
    (type) => !(BREAKER_TYPES as readonly string[]).includes(type) &&
      !(OTHER_COMPONENT_TYPES as readonly string[]).includes(type)
  )

  const recognizedTypesLine = `Recognized types: ${enabledBreakers.join(', ')}.`
  const nonBreakerLine = customTypes.length
    ? `Also watch for these custom types: ${customTypes.join(', ')} — using the same concise, standardized-description convention as the other non-breaker rules below.`
    : ''

  const preferredBrandsLine = preferredBrands.length
    ? `\nThis company's preferred manufacturers, in order of preference, are:\n${preferredBrands.join(', ')}.\nThe catalog glossary below lists preferred-brand descriptions first. When a\ndrawing is genuinely ambiguous about which equivalent part is meant, lean\ntoward phrasing that matches a preferred brand's typical catalog listing —\nbut this is a tie-breaker only: never let brand preference override what's\nactually shown on the drawing, and never invent a rating to make something\nmatch a preferred brand's part.\n`
    : ''

  const customRulesSection = customRules.length
    ? `\n## Company-specific rules\n\nApply these additional rules exactly, alongside everything above:\n\n${customRules.map((rule) => `- ${rule}`).join('\n')}\n`
    : ''

  const catalogGlossary = catalogDescriptions.length
    ? `\n## Known catalog descriptions (reference glossary)\n\nThese are descriptions already in our parts catalog${preferredBrands.length ? ' (preferred-brand descriptions listed first)' : ''}.\nWhen a component you're describing matches one of these (or is a close\nvariant), phrase your description to match the catalog wording as closely\nas the drawing allows — this is what lets the app auto-match your\nextraction to a priced catalog item. Don't force a match that isn't real;\nonly use these as a style/wording reference, never invent a rating or spec\nthat isn't on the drawing.\n${preferredBrandsLine}\n${catalogDescriptions.join('\n')}\n`
    : preferredBrandsLine

  return `## Step 1 — Identify the panel(s) to manufacture

A panel to be manufactured is indicated by a dashed rectangular bounding box
around the SLD. The panel name is usually at the bottom-right corner of the
drawing. Set each component's \`panelName\` field to
"<incomer rated current> <panel name>" (e.g. "250A DB-G1") — this is used as
the BOM title for that panel, so get it right rather than embedding it in
the description text. If no panel name is found, set \`panelName\` to
"UNKNOWN" and raise a flag noting it. Ignore circuits drawn outside every
dashed bounding box, except to record the incoming source for a panel that
is fed from them.

## Step 2 — Extract every component inside the bounding box

**Incoming side first.** The incomer is a breaker with a line labeled
"From …" (e.g. "From MSB") entering the box. Include it as its own BOM line
and note the source, e.g. notes: "Incomer, from MSB".

**Breakers.** ${recognizedTypesLine} Format every breaker's description in
this exact fixed order, space-separated, omitting any field not shown on
the drawing:

  <Rated Current> <Poles> <Short-circuit Rating if shown> <Tripping/Residual Current if shown> <Breaker Type>

Examples: "40A 3P 6kA MCB", "40A 4P 100mA RCBO", "250A 4P 36kA MCCB".

**Standardize abbreviations.** Some drawings use site shorthand instead of
the standard terms — always normalize to the term on the left before writing
the description: RCD → RCCB, DP → 2P, SP → 1P, TP → 3P, FP → 4P.

**Tripping/residual current formatting.** Express values below 1A in mA,
not decimal amps — e.g. a 0.1A residual current is written "100mA" (see the
RCBO example above), never "0.1A".

**Group identical items.** The same description within the same panel is
one BOM line with a quantity — do not emit one line per physical item.

**SPARE breakers.** If a spare breaker's rating isn't shown, use the
previous breaker on the diagram's rating. Include spares as their own BOM
line (the panel still needs the physical space and gear for them) but set
notes to mention it's a spare provision and raise a flag for that page
noting which item is spare — whether to keep it in the priced quote is a
decision for a human, not something to decide silently.

**FUTURE components.** Anything explicitly labeled FUTURE (a reserved
provision with no equipment installed yet, distinct from SPARE) is ignored
entirely — do not emit a BOM line for it.

**Quantity prefix.** If a breaker's label has an "Nx" before its
description (e.g. "6x 32A 10kA 3P MCCB"), that N is the quantity — 6
breakers in that example, not 1.

**Never substitute a tag or location for the rating.** If a breaker's rated
current or other spec is illegible or not shown, do NOT use its panel tag,
board label, or location name as a stand-in description (e.g. "DB/A1 MCCB",
"Hose Reel Panel MCCB", "SSB/01 MCCB" are not valid descriptions — a tag
belongs in the \`tag\` field, never in \`description\`). Keep the description
to whatever rating information is actually visible, however partial, and
raise a flag noting the rest is illegible — per the "never invent a rating"
rule below, but the reverse failure (describing the location instead of the
part) is just as unusable for pricing.

## Step 3 — Non-breaker components

${enabledOthers.length ? `Recognized non-breaker types: ${enabledOthers.join(', ')}.` : ''} ${nonBreakerLine}
Apply these specific rules exactly:

1. **Indicator light / lamp** (e.g. "return pilot lamp, 240VAC"): use the
   previous breaker's pole count to determine lamp quantity — 1P → 1 lamp,
   2P → 2 lamps, etc.
2. **BY-PASS / ON-OFF switch**: description "SELECTOR SWITCH (3 Way, Ctrl)",
   quantity 1.
3. **Contactor** (e.g. "C 1"): find the breaker connected to its main
   contact and, based on its rated current, return
   "<Rated Current of that breaker> Contactor" — e.g. "40A Contactor". Never
   return just a pole count on its own (e.g. "1P Contactor" is wrong even if
   that's all the drawing shows next to the contactor symbol — trace back to
   the connected breaker's rated current instead).
4. **MTS / Manual Change-Over Switch**: return
   "<Rated Current> <Number of Poles> Manual Change Over Switch".
5. **SPD (Surge Protection Device)**: if the drawing does NOT indicate
   either full-mode or 7P, return "<Rated kA> 3P+N Surge Arrestor, Class
   <Class>"; if it DOES indicate full-mode, return "<Rated kA> 3P full
   mode Surge Arrestor, Class <Class>".
6. **Combined O/C and E/F relay**: return "combined OC & EF relay".
7. **Earth Fault relay only**: return "Earth Fault Relay <Tripping
   Characteristic>" (e.g. "Earth Fault Relay IDMT").
8. **OverCurrent relay only**: return "OverCurrent Relay <Tripping
   Characteristic>" (e.g. "OverCurrent Relay IDMT").
9. **Ammeter**: regardless of rating shown, return "Analogue Ammeter, 90
   Deg".
10. **Voltmeter**: regardless of rating shown, return "Analogue Voltmeter,
    90 Deg".
11. **PFR (Power Factor Regulator)**: look for the CAP BANK symbol and read
    the nearby text for the number of steps and the capacitance of each
    step, then emit all of the following as separate BOM lines for that
    PFR:
    - The regulator itself: "<NumberOfSteps>-STEPS POWER FACTOR REGULATOR"
      (e.g. "12-STEPS POWER FACTOR REGULATOR").
    - 4 HRC fuses: description "HRC fuse", quantity 4.
    - Pilot lamps: one per step, plus 3 more (e.g. a 12-step PFR needs 15
      pilot lamps total).
    - A cap bank line per step, sized from that step's kVAR: "<kVAR> <Voltage>
      CAP BANK" — use the drawing's stated voltage if shown, otherwise
      default to 525V (e.g. "2x2.5 KVAR" on the drawing → "2.5KVAR 525V CAP
      BANK" quantity 2).
    - A contactor per step, whether or not the drawing shows one:
      "<kVAR> AC6B CONTACTOR" (e.g. "10kVAR AC6B CONTACTOR").
    - If the drawing indicates a reactor, one per step: "<kVAR> 7% REACTOR,
      ALUMINIUM WINDING" (e.g. "10KVAR 7% REACTOR, ALUMINIUM WINDING").
    - One exhaust fan, whether or not the drawing shows it: "Exhaust Fan".
    - One selector switch: "Selector Switch, ONOFF".

## Step 4 — Note the feed (busbar or cable) for each breaker

Every breaker is fed by either busbar or cable.

- If the drawing states the cable size, use it and note it, e.g. notes:
  "Cable: 10mm² (per drawing)".
- If not stated, infer a size from the breaker's rated current using the
  tables below, and note that it was inferred rather than read off the
  drawing, e.g. notes: "Cable: 10mm² (sized from rated current, table
  lookup — not shown on drawing)".
- **Cable run count.** Note how many runs of that cable size the breaker
  needs alongside the size: 1P or 2P breakers need 4 runs; 3P or 4P
  breakers need 8 runs — e.g. notes: "Cable: 10mm² x4 runs (per drawing)".
- As a rule of thumb, incomers and large main feeders are typically
  busbar-fed while branch circuits are typically cable-fed — but this
  project's exact busbar-vs-cable current threshold isn't finalized, and
  cable run length isn't determinable from the drawing at all. Always raise
  a flag noting your busbar/cable choice (and size, if inferred) so a human
  confirms it before the line is priced.
- Busbar sizes are selected from Table 1 by rated current; cable sizes from
  Table 2.

### Table 1 — Busbar Rating (IEE Regulation)
| Rated Current | Busbar Size | Fault Rating @ 1s (max 300°C) |
|---|---|---|
| 60A–116A | 25mm × 3mm | 15kA |
| 117A–186A | 20mm × 6mm | 20kA |
| 187A–232A | 25mm × 6mm | 30kA |
| 233A–387A | 25mm × 10mm | 50kA |
| 388A–465A | 30mm × 10mm | 60kA |
| 388A–465A | 50mm × 6mm | 60kA |
| 466A–558A | 60mm × 6mm | 70kA |
| 559A–620A | 40mm × 10mm | 80kA |
| 621A–697A | 75mm × 6mm | 90kA |
| 698A–775A | 50mm × 10mm | 100kA |
| 776A–852A | 55mm × 10mm | 100kA |
| 853A–930A | 60mm × 10mm | 120kA |
| 931A–1007A | 65mm × 10mm | 120kA |
| 1008A–1162A | 75mm × 10mm | 150kA |
| 1163A–1240A | 80mm × 10mm | 150kA |
| 1241A–1317A | 85mm × 10mm | 150kA |
| 1318A–1550A | 100mm × 10mm | 150kA |
| 1551A–1860A | 120mm × 10mm | 150kA |
| 1861A–2325A | 125mm × 12mm | 150kA |

### Table 2 — Cable Sizing (IEE Regulation)
| Rated Current | Cable Size | Short Rating @ 1s |
|---|---|---|
| 10A–28A | 4mm² | 0.46kA |
| 29A–36A | 6mm² | 0.69kA |
| 37A–50A | 10mm² | 1.15kA |
| 51A–68A | 16mm² | 1.85kA |
| 69A–89A | 25mm² | 2.89kA |
| 90A–110A | 35mm² | 4.04kA |
| 111A–134A | 50mm² | 5.77kA |
| 135A–171A | 70mm² | 8.08kA |
| 172A–200A | 95mm² | 10.96kA |
${catalogGlossary}
${customRulesSection}
## Step 5 — Report

For each component: the page it appears on, which panel it belongs to
(\`panelName\`), the standardized description above, which recognized type it
is (\`componentType\` — the same type name used in the rules above, e.g.
"MCCB" or "Contactor", not a paraphrase), an estimated quantity, unit of
measure if inferrable, any visible tag/label, and a confidence score
from 0 to 1 reflecting how legible/certain the reading was (this is about
how clearly you could read the drawing, not about whether a feed size was
inferred — that goes in notes/flags instead).

Use the full range rather than defaulting to a narrow middle band — anchor
against these: 0.9–1.0 = every character clearly legible, no ambiguity;
0.6–0.8 = legible but some part required inference (e.g. sizing from a
table, or a slightly blurred digit you're still confident about); 0.3–0.5 =
partially illegible or genuinely uncertain reading; below 0.3 = mostly
guesswork. Most components on a clean drawing should score 0.8+ — reserve
the low end for components that are actually hard to read, not as a default
hedge.

For each component and each flag, also estimate a \`boundingBox\`: the
region on its page that contains it, normalized 0 to 1 (x/y = top-left
corner, width/height as a fraction of the full page — same convention as
how annotation coordinates are stored elsewhere in this app). This does
not need pixel precision — a box that roughly contains the relevant
symbol, label, or text block is enough to point a human reviewer at the
right spot. Set it to null only when no specific region applies (e.g. a
flag about the drawing or panel as a whole, not a specific symbol).

Raise a flag for anything you could not read clearly, that looks
inconsistent (e.g. a rating that doesn't match a labeled cable size), a
SPARE item, an inferred (not drawing-stated) busbar/cable choice or size, a
panel with no name found, or anything else a human should double-check
before pricing it. Never invent a rating — if a value is illegible or
missing, omit it from the description and flag it instead.`
}

export function buildExtractionSystemPrompt(
  enabledComponentTypes: string[],
  catalogDescriptions: string[],
  preferredBrands: string[] = [],
  customRules: string[] = []
): string {
  const rules = buildExtractionRulesSection(
    enabledComponentTypes,
    catalogDescriptions,
    preferredBrands,
    customRules
  )

  return `You are a BOM-extraction agent for a low-voltage switchboard manufacturer,
reading Single Line Diagrams (SLDs) to build a bill of materials for a
quotation.

Go through every page image below, in order (each is labeled "Page N"
immediately before it). A single page may contain multiple panels —
process every one.

${rules}

Respond only with the structured extraction — no prose.`
}

export function buildVerificationSystemPrompt(
  enabledComponentTypes: string[],
  catalogDescriptions: string[],
  preferredBrands: string[],
  customRules: string[],
  draftComponents: ExtractedComponent[],
  draftFlags: ExtractionFlag[]
): string {
  // Only the rules — not `buildExtractionSystemPrompt`'s full output, which
  // would embed a second "you are a BOM-extraction agent / extract every
  // component / respond only with the structured extraction" framing and
  // invite a full re-extraction into `missedComponents`.
  const extractionRules = buildExtractionRulesSection(
    enabledComponentTypes,
    catalogDescriptions,
    preferredBrands,
    customRules
  )

  // The quantity has to be shown: identical items are grouped into one line,
  // so without it a "×6" line reads as a single item and the six on the
  // drawing look like five missing ones.
  const draftSummary = draftComponents.length
    ? draftComponents
        .map(
          (c) =>
            `- [Page ${c.pageNumber}, ${c.panelName}] ×${c.qty} ${c.description}${c.tag ? ` (tag: ${c.tag})` : ''}`
        )
        .join('\n')
    : '(none)'

  const flagSummary = draftFlags.length
    ? draftFlags.map((f) => `- [Page ${f.pageNumber}] ${f.message}`).join('\n')
    : '(none)'

  return `You are reviewing a first-pass BOM extraction from the same Single Line
Diagram page images, to catch anything the first pass missed or got
inconsistent. You are NOT re-extracting from scratch — the list below is
already correct and complete unless you find a specific, concrete problem
with it.

## What was already extracted

Each line is one BOM line, not one physical item: \`×N\` is the quantity
already extracted for it. Identical items in the same panel are grouped, so
a line reading "×6" already accounts for all six of those on the drawing —
that is not five missing items.

${draftSummary}

## What was already flagged

${flagSummary}

## Your task

1. Look through every page image again for any component that is visible
   on the drawing but is NOT in the list above. For each one you find, add
   it to \`missedComponents\`, following the exact same description
   formatting, component-type recognition, and business rules below as the
   first pass used — a missed component still needs to follow every rule
   (breaker formatting, cable sizing, PFR expansion, etc.).
2. Look for any item already in the list above whose rating looks
   internally inconsistent with what's shown on its page (e.g. a noted
   cable size that doesn't match a stated busbar/cable choice, a pole
   count that doesn't match the breaker type). Do NOT edit the original
   list — instead, add an \`additionalFlags\` entry describing the
   inconsistency so a human can resolve it. Do not repeat any flag already
   listed under "What was already flagged" above — spares, inferred
   busbar/cable sizes, unnamed panels and illegible values are already
   flagged wherever that list says so, and re-reporting them just
   duplicates work for the human reviewer.
3. If you find nothing to add in either category, return empty arrays for
   both. Do not invent problems to report — only real, specific ones.

## Reference: the same rules the first pass followed

These are description-formatting and business rules only — reference
material for phrasing anything you add. They are not an instruction to
extract the drawing again, and nothing already listed above needs to be
re-derived from them.

${extractionRules}

Remember: you are reviewing, not re-extracting. \`missedComponents\` is only
for components genuinely absent from the list above, and \`additionalFlags\`
only for problems not already flagged above.

Respond only with the structured verification result — no prose.`
}
