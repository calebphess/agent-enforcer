# Graphics Prompts — Agent Enforcer Slick Sheet

Graphics listed here are the only images that cannot be replicated cleanly in HTML/CSS. All other `[IMAGE: ...]` blocks in slicksheet.md should be built as styled HTML/CSS components (see plan.md for the full breakdown).

Each prompt below is fully self-contained. You can hand any single prompt to an image generation model without reading any other file.

---

## Section: The Problem

**File to save:** `assets/problem-illustration.png`

**Prompt:**
Generate a wide-format vector illustration (2:1 aspect ratio, minimum 1600px × 800px, PNG with transparent or white background) for a federal government enterprise software sales document. The style should be clean, authoritative, and minimal — think Palantir or CISA aesthetic. No photorealism. No gradients on icons. No drop shadows. Flat or very subtly shaded vector shapes only.

Color palette: deep navy #0A1628, gold #C8A94A, white #FFFFFF, light gray #E8ECF2, muted blue-gray #647084. Accent danger color for the left panel: #C0392B (muted red). The document uses Inter typeface — use a clean sans-serif for any text labels.

The illustration is a split-panel composition showing "ungoverned AI deployment" on the left versus "governed AI deployment" on the right:

**Left panel** (roughly half the image width): Label "Without Enforcement" in small all-caps navy text (#0A1628) at the top of the panel. Show 8–10 developer workstation icons arranged loosely with no clear structure. Each workstation has a small AI agent monitor icon above it, and each monitor displays a distinct status icon directly on its screen — no icons floating freely in the background. Assign these icons across the monitors: a red broken padlock (#C0392B) on one screen indicating a security breach; a document with a red X or cancel mark on another screen indicating a blocked or failed policy; a bold warning triangle (amber #E67E22) on another screen indicating a risk or alert; a large question mark on another screen indicating an unknown or ungoverned state. Remaining monitors can repeat these four variants in different combinations. The variety and inconsistency of the icons across monitors conveys that each agent is operating under different, conflicting rules. Apply a very subtle warm light red tint (#C0392B at ~8% opacity) over the panel background. No central control node connects anything.

**Right panel** (roughly half the image width): Label "With Agent Enforcer" in small all-caps navy text (#0A1628) at the top. The same workstations, now arranged in a clean radial or grid pattern. All workstations are connected by thin navy lines to a single central shield icon in gold (#C8A94A) with a checkmark or stylized "A" inside. Above each workstation is a single consistent gold checkmark badge — uniform, not varied. Apply a very subtle cool navy tint (#0A1628 at ~5% opacity) over the panel background. The network looks governed and orderly.

A thin vertical dividing line (1–2px, color #D9DEE8) separates the two panels down the center. The overall image background is white (#FFFFFF) or very light gray (#FBFCFE).
