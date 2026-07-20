# Plan — Agent Enforcer Slick Sheet

## Goal
Build a two-page print-ready HTML document (`index.html` + `styles.css`) from `slicksheet.md`. Output a PDF via Chrome headless when done. The design should match the Agent Enforcer proposal aesthetic produced in `/Users/penn/Downloads/agent-enforcer-source-offer/` — that file is your single best reference for color, typography, spacing, component patterns, and PDF print CSS. Read it before you start.

---

## Reference Files

| File | Purpose |
|------|---------|
| `slicksheet.md` | Source copy and layout intent — all text content lives here |
| `/Users/penn/Downloads/agent-enforcer-source-offer/index.html` | Reference HTML structure and component patterns |
| `/Users/penn/Downloads/agent-enforcer-source-offer/styles.css` | Reference CSS — copy and adapt; do not start from scratch |
| `assets/` | Pre-copied logo and icon files (see below) |
| `graphics-prompts.md` | Prompts for the one image that needs AI generation |

### Available Assets
```
assets/alchemist-logo-spacing-fixed-transparent-cropped-white.png   ← header/footer (on navy bg)
assets/alchemist-logo-spacing-fixed-transparent-cropped-black.png   ← light-bg contexts
assets/agent-enforcer-icon-gold-white-brain.png                     ← product icon in header
```

---

## Design Language (from proposal — replicate this)

- **Colors:** navy `#0A1628`, navy-2 `#11243F`, gold `#C8A94A`, gold-dark `#9E8130`, white `#FFFFFF`, paper `#FBFCFE`, ink `#152033`, muted `#647084`, soft `#F1F4F8`, line `#D9DEE8`
- **Font:** Inter (Google Fonts), fallback Aptos / Segoe UI / Arial
- **Page size:** 8.5in × 11in, `@page { size: Letter; margin: 0; }`
- **Print:** `-webkit-print-color-adjust: exact; print-color-adjust: exact;` on body. In `@media print`: page width/height locked to 8.5in × 11in, `overflow: hidden`, no box-shadow.
- **Decorative circle fix:** If using a large border-radius circle positioned partially off-page, use `bottom: 0; right: 0; transform: translate(X%, Y%)` instead of negative `inset` values — negative insets break `overflow: hidden` in Chrome PDF export.
- **Eyebrow labels:** 9px, weight 800, letter-spacing 0.16em, uppercase, color `var(--gold-dark)`
- **H2:** 24px, weight 800, letter-spacing -0.03em, navy
- **H3:** 14px, weight 800, navy
- **Tables:** gold top border 2px, navy header row, alternating content rows with `var(--line)` bottom borders
- **Callout cards:** gold border, `#FFFDF5` background (light); navy background (dark variant)
- **Price cards:** light card = white bg; dark card = navy bg with gold headings

---

## IMAGE Blocks: What to Build vs. What to Generate

The slicksheet.md contains 11 `[IMAGE: ...]` blocks. Only **one** needs a generated image file. Everything else should be built as HTML/CSS.

### Needs generated image
| Section | Placeholder | Asset file | Notes |
|---------|-------------|-----------|-------|
| The Problem | Split illustration — chaotic vs. governed network | `assets/problem-illustration.png` | See `graphics-prompts.md`. If the image file doesn't exist yet, insert an `[IMAGE PENDING]` placeholder div styled in navy/muted so the layout holds. |

### Build in HTML/CSS (do NOT wait for generated images)

| Section | Placeholder description | How to build it |
|---------|------------------------|-----------------|
| Header bar | Logo left, product name + icon right on navy bar | CSS flexbox header div: white logo left, AE icon + "Agent Enforcer" text in gold right |
| The Solution — Architecture flow | Three columns: Policy Source → Distribution Engine → Enforcement Layer | CSS 3-column flex/grid with Font Awesome icons (cloud, cog/AI, monitor), arrows between columns, navy/gold color scheme |
| Security — Shield with badges | Shield icon with NIST/CMMC/FedRAMP/STIG badges | CSS/SVG: large Font Awesome `fa-shield` in gold on navy card, badge pills below it listing the frameworks |
| Token Cost — Bar chart | Two bars: unenforced vs. enforced, 20-35% savings annotation | CSS flex bars (same technique as ROI chart in proposal) |
| Coding Standards — Code panels | Before/after code snippets side by side | HTML `<pre><code>` blocks in two columns, dark background, red/green highlight spans |
| Gold rule divider (page 2 top) | Thin gold horizontal rule | CSS `<div>` with `height: 2px; background: var(--gold)` |
| How It Works — 4-step flow | Numbered gold circles connected horizontally | CSS flexbox: 4 items, each with a gold circle number, icon, title, description; connecting line via pseudo-elements |
| Pricing cards | 3 tier cards + add-on band | CSS card grid — same pattern as proposal pricing cards (light/dark variants) |
| Footer bar | Navy full-width bar, logo left, URL center, classification right | CSS footer div matching proposal `document-footer` pattern |

---

## Token Savings Numbers — Discrepancy Note

The slicksheet.md token table uses the **original** $1M/month ($400k developer spend) baseline. The proposal was updated to use a **$15M/year projected** baseline ($1.2M conservative annual savings). 

**Before building the token section, ask Penn which numbers to use** — or default to the slicksheet.md numbers ($1M/month basis, $960k/$1.44M/$1.68M) since this is a separate document and the slicksheet numbers are internally consistent.

---

## Build Order

1. **Read** the reference HTML and CSS files in `agent-enforcer-source-offer/` to internalize the design system before writing a line.
2. **Check** whether `assets/problem-illustration.png` exists. If not, render a placeholder block (dark panel with italic "Illustration — Governed vs. Ungoverned Network" centered in white text) so the layout is complete.
3. **Build `styles.css`** — adapt from the proposal CSS. Slicksheet is 2 pages vs. 5, so simplify; keep the `@page`, print rules, color variables, and typography verbatim.
4. **Build `index.html`** page by page, section by section, following the copy in `slicksheet.md`. All body text is in the markdown — do not paraphrase or rewrite copy.
5. **Verify math** — the token savings table numbers must be internally consistent (see discrepancy note above).
6. **Open in browser** and visually check both pages before generating the PDF.
7. **Generate PDF** using Chrome headless:
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless --disable-gpu \
     --print-to-pdf="/Users/penn/Downloads/agent-enforcer-slicksheet/agent-enforcer-slicksheet.pdf" \
     --print-to-pdf-no-header --no-margins \
     "file:///Users/penn/Downloads/agent-enforcer-slicksheet/index.html"
   ```
8. **Run QA review** — see section below before reporting the task complete.

---

## QA Review (Step 8 — Do This Before Reporting Done)

After the PDF is generated, re-read the built `index.html` and cross-reference both `slicksheet.md` and the proposal at `/Users/penn/Downloads/agent-enforcer-source-offer/index.html`. Check every item below and report any failures explicitly.

### Math checks — slicksheet internal consistency

| Item | What to verify |
|------|---------------|
| Token savings table | Each row derives correctly from the one above: `total spend × developer share = developer spend`, `developer spend × efficiency gain = savings`, `monthly savings × 12 = annual savings` |
| Conservative row | $1M/mo × 40% = $400k dev spend; $400k × 20% = $80k/mo; $80k × 12 = **$960k/yr** |
| Moderate row | $400k × 30% = $120k/mo × 12 = **$1.44M/yr** |
| Optimistic row | $400k × 35% = $140k/mo × 12 = **$1.68M/yr** |
| Pricing table totals | Division $750k / Agency $2M / Enterprise $4M / Unlimited $7.5M — these are tiers, not additive, so no sum to check; just confirm they're rendered correctly |
| Productivity claim | If the "5% productivity × 1,000 devs × $200k loaded cost = $10M" claim from the proposal appears anywhere in the slicksheet, verify it (1000 × $200k × 5% = $10M ✓) |

### Terminology alignment — slicksheet must match the updated proposal

| Term | Correct form (per updated proposal) | Check |
|------|-------------------------------------|-------|
| Product name | **Agent Enforcer** (two words, both capitalized) | Consistent throughout? |
| Specialist role | **Managed Enforcement Specialists** (plural) | `slicksheet.md` source uses singular — the built HTML must use the plural form |
| Company name | **Alchemist** | No "Alchemist Federal" or other variants crept in? |
| Propagation time | **15 minutes** | Slicksheet says "15-min sync" — matches proposal's "within 15 minutes" ✓ |
| Agency seat count | **1,000 seats** | Slicksheet Agency tier says "up to 1,000 seats" — matches proposal ✓ |

### Content alignment — cross-reference with proposal

Read `/Users/penn/Downloads/agent-enforcer-source-offer/index.html` and compare these specific claims:

| Claim in slicksheet | Corresponding claim in proposal | Flag if different |
|--------------------|---------------------------------|-------------------|
| "one critical security vulnerability per task" in unenforced sessions | Proposal p.3: "unenforced AI coding sessions produced an average of one critical security vulnerability per task" | Must match exactly |
| Managed Enforcement Specialists add-on price: $1,250,000/year | Proposal Year 2+ rate: $1,250,000 ✓ (Year 1 founding rate was $1,000,000 — slicksheet correctly shows standard rate) | Note if discrepancy |
| Agency platform license: $2,000,000/year | Proposal Year 2+ Agency Platform License: $2,000,000 ✓ | Note if discrepancy |
| Token savings numbers in slicksheet vs. proposal | Proposal was updated to $15M/year projected baseline; slicksheet uses $1M/month. These will differ — that's expected and documented. But flag if the slicksheet numbers are internally inconsistent on their own terms. |
| Product description: "system-level enforcement," "no developer action required," "15-minute sync" | All three appear in proposal — verify slicksheet HTML matches the same technical claims | Flag any contradiction |
| `agent-enforcer.alchemist.ai` URL in slicksheet footer | Does not appear in proposal — this is fine, but confirm the URL is rendered correctly in the footer |

### Final report format

After running all checks, output a table like this:

```
| Check | Result | Notes |
|-------|--------|-------|
| Token math — conservative row | PASS | $400k × 20% × 12 = $960k ✓ |
| Token math — moderate row | PASS | ... |
| "Managed Enforcement Specialists" plural | PASS/FAIL | ... |
| Security vuln claim matches proposal | PASS/FAIL | ... |
| MES pricing consistent | PASS | $1.25M matches proposal Year 2+ rate |
| ... | ... | ... |
```

Do not mark the task complete until every row is PASS or the failure is explicitly surfaced to Penn for a decision.

---

## Output Files

```
agent-enforcer-slicksheet/
├── slicksheet.md               ← source copy (do not modify)
├── plan.md                     ← this file
├── graphics-prompts.md         ← AI image generation prompt
├── index.html                  ← build this
├── styles.css                  ← build this
├── agent-enforcer-slicksheet.pdf  ← generate at the end
└── assets/
    ├── alchemist-logo-spacing-fixed-transparent-cropped-white.png
    ├── alchemist-logo-spacing-fixed-transparent-cropped-black.png
    ├── agent-enforcer-icon-gold-white-brain.png
    └── problem-illustration.png   ← generate via graphics-prompts.md (may not exist yet)
```
