# V0 Prompt — Agent Enforcer Admin Console

Copy everything below the line into [v0.dev](https://v0.dev) as a single prompt.
When you're happy with the result, export it and replace this repo's `ui/`
**source** with it (CDK builds the static export at synth — no manual
`next build`), then re-apply the repo integration tweaks: env-driven
`USE_MOCKS` (`NEXT_PUBLIC_USE_MOCKS`), the lazy `apiBase()` reading
`window.__AE_CONFIG__` from `/config.js`, `trailingSlash: true`, and the
`/login/` redirect — see `ui/lib/api.ts` and CLAUDE.md "Admin Web UI".
This document is also the canonical API contract for the console.

---

Build the **Agent Enforcer admin console** — the web control plane for an
enterprise AI-governance product by **Alchemist**, sold to US government
agencies. It must look breathtaking: premium, austere, government-grade — think
a defense contractor's flagship product, not a SaaS template. Dark navy
surfaces, restrained gold accents, generous negative space, crisp typography.
Every screen should feel deliberate and expensive.

## Hard technical constraints (do not violate)

- Next.js App Router + Tailwind CSS + shadcn/ui components, TypeScript.
- The app **must build as a fully static export**: `output: 'export'` and
  `images: { unoptimized: true }` in `next.config`. That means **no server
  actions, no API route handlers, no middleware, no dynamic route segments** —
  it will be served from an S3 bucket.
- All data comes from client-side `fetch` against
  `process.env.NEXT_PUBLIC_API_BASE`. Auth is a Bearer token stored in
  `localStorage` under the key `ae_admin_token`.
- Auth guard is client-side: a layout effect checks for the token and
  redirects to `/login` when missing/expired. After login, redirect to `/`.
  A 401 from any API call clears the token and redirects to `/login`.
- Icons: `lucide-react` only. Core set: `ShieldCheck` (product mark /
  enforcement), `FileText` (documents), `Bot` (agents), `Wand2` (generation),
  `Cog` (settings), `RotateCw` (sync/refresh), `FlaskConical` (Alchemist),
  `Upload`, `Pencil`, `Trash2`, `LogOut`.
- All API access goes through a single `lib/api.ts` module (see Mock mode).

## Design tokens — use these exactly

CSS variables / Tailwind theme:

| Token | Value | Use |
|---|---|---|
| navy | `#0A1628` | sidebar, header, dark surfaces, headings on light |
| navy-2 | `#11243F` | hover states on navy, secondary dark panels |
| navy gradient | `linear-gradient(145deg, #07101F 0%, #0A1628 52%, #0F2442 100%)` | login page background, hero surfaces |
| gold | `#C8A94A` | THE accent: active nav, buttons, focus rings, accent borders, gauge fill |
| gold-dark | `#9E8130` | eyebrow labels, secondary gold text |
| gold-tint | `rgba(200,169,74,0.18)` | badge backgrounds, subtle gold washes |
| paper | `#FBFCFE` | page background (light content area) |
| ink | `#152033` | body text on light |
| muted | `#647084` | secondary text, table meta |
| line | `#D9DEE8` | borders, dividers, table rules |
| soft | `#F1F4F8` | callout/panel backgrounds on light |
| danger | `#C0392B` | destructive actions, error states, near-limit warnings |

Typography: **Inter** (weights 400/500/600/700/800). Section eyebrows are
uppercase, 11–12px, weight 800, letter-spacing `0.16em`, in gold-dark.
Headings weight 800 in navy (or paper on dark). Numbers on stat cards are big
(40–56px), weight 800, tabular-nums.

Signature motifs (use consistently):
- Cards and tables carry a **2–3px gold accent border on the top edge**;
  callouts get a **3px gold left border**.
- Sharp-ish corners (6px radius max), no glassmorphism, no neon.
- Elevated surfaces use exactly `box-shadow: 0 22px 60px rgba(10,22,40,0.18)`.
- Status badges are pills (`border-radius: 100px`) in gold-tint with
  gold-dark text, or danger-tinted for negative states.
- Navy surfaces may carry a faint radial gold halo:
  `radial-gradient(circle at 72% 28%, rgba(200,169,74,0.14), transparent 60%)`.

Brand copy (use verbatim where indicated):
- Product: **Agent Enforcer** · tagline **"Stop the Slop."**
- Positioning lines for empty states / login flavor: "Enforce What Your AI
  Agents Are Allowed to Do — Before They Do It." · "Compliant by Default."
- Footer, every page, small muted text:
  **"© 2026 Alchemist. All rights reserved. Agent Enforcer is a trademark of Alchemist."**

## Pages

### 1. `/login`
Full-bleed navy gradient background with the faint radial gold halo. Centered
card (max-w ~420px) on a barely-lighter surface with the gold top border and
the signature shadow. Inside, top to bottom:
- `ShieldCheck` icon in a gold-tint rounded square, 56px
- Eyebrow: `POWERED BY ALCHEMIST`
- Heading: **"Welcome to Agent Enforcer"** (weight 800)
- Subline in muted: "Sign in to the enforcement console."
- Username + password fields (dark inputs, gold focus ring), "Sign in"
  button — gold background, navy text, weight 700, subtle hover lift.
- On 401 show an inline danger alert: "Invalid username or password."
Below the card, tiny muted text: "Stop the Slop." Footer line at page bottom.

### 2. App shell (all authenticated pages)
- **Left sidebar** (fixed, 240px, navy): product mark at top — `ShieldCheck`
  in gold + "Agent Enforcer" in paper, weight 800, with a tiny `POWERED BY
  ALCHEMIST` eyebrow beneath. Nav items: Dashboard, Documents, Assistants
  (icon + label; active item gets gold text + a 3px gold left bar +
  navy-2 background). At the bottom: signed-in username and a Log out item.
- **Topbar** (light, on paper): current page title, and on the right a
  refresh `RotateCw` ghost button.
- **Content area** on paper, max-w ~1200px, generous padding.
- **Footer** on every page: the copyright line, centered, muted.

### 3. `/` — Dashboard
Eyebrow `ENFORCEMENT OVERVIEW`, heading "Welcome to Agent Enforcer" with a
small `ShieldCheck` beside it. Then:
- **Stat row** — four cards (gold top border): 
  1. **License usage** — the hero card, ~2x width: big "17 <span muted>of 250</span>"
     plus a slim gold progress bar (danger-colored when ≥90%), caption
     "active licenses in use".
  2. **Registered agents** — count from the agents endpoint, `Bot` icon.
  3. **Enforcement documents** — count, `FileText` icon.
  4. **Assistants enforcing** — "1 of 4", `Wand2` icon.
- **Registered agents table** (card, gold top border, eyebrow `FLEET`):
  columns User ID, Agent version, Registered, Last check-in (relative time,
  e.g. "4 m ago"), Status (pill: Active in gold-tint / Inactive in muted).
  Sorted by last check-in. Empty state: `Bot` icon + "No agents registered
  yet" + hint "Install the RPM and run `sudo agent-enforcer register`."

### 3b. `/fleet` — Fleet
Full agents page: the same table with pagination, a details view per agent,
and a **De-register** action (confirm dialog: "This deactivates the agent's
license and frees the slot — its next sync will be refused.") →
`DELETE /admin/agents/{id}`, success toast "Agent de-registered — license
released."

### 4. `/documents` — Documents
Eyebrow `POLICY SOURCE`, heading "Enforcement Documents", subline muted:
"Uploaded documents are compiled into enforcement bundles automatically."
Right-aligned gold **"Upload document"** button.
- **Upload dialog** (shadcn Dialog): drag-and-drop zone (dashed line border,
  gold on dragover) accepting a single `.md` file. When a file is chosen,
  auto-fill **Name** from the file name minus its extension (editable text
  field) and show an optional **Description** textarea. Primary action
  "Upload & track". Flow: `POST /admin/documents` with
  `{name, description, filename}`, then `PUT` the raw file body to the
  returned `upload_url` (no auth header on that PUT). Show upload progress
  and a success toast: "Document uploaded — regeneration triggered."
  On 409, offer "Replace file instead" which uses the existing document's
  re-upload action.
- **Documents table** (gold top border): Name (weight 600, navy),
  Description (muted, truncated), Filename (mono, 12px), Created, Updated,
  Updated by, Version (mono pill, e.g. `v3`), Status (pill: **Tracked** in
  gold-tint; **Deleted** in danger-tint when `deleted` is set). Row actions
  (ghost icon buttons): `Pencil` edit name/description in a dialog →
  `PUT /admin/documents/{id}`; `Upload` re-upload → fetch fresh URL from
  `POST /admin/documents/{id}/upload-url` then PUT the file; `Trash2` delete
  with a confirm dialog ("This also removes the file from the enforcement
  source — the bundle regenerates without it.") → `DELETE /admin/documents/{id}`.
  Soft-deleted rows render dimmed with no actions except a muted "deleted
  <date>" note. Empty state: "No documents yet — upload your first
  enforcement policy."

### 5. `/assistants` — Assistants
Eyebrow `DISTRIBUTION TARGETS`, heading "Coding Assistants", subline:
"Choose which assistants Agent Enforcer generates configuration bundles for."
Grid of four cards (gold top border), one per assistant, each with a logo-ish
monogram square, name, one-line description, and a shadcn Switch (gold when
on):
- **Claude Code** — "Generates `.claude/` bundles: CLAUDE.md, settings,
  skills, commands." (functional)
- **Kiro** — "Bundle generation coming soon." + gold-tint `COMING SOON` pill
- **Cursor** — same coming-soon treatment
- **GitHub Copilot** — same coming-soon treatment
Toggling any switch persists via `PUT /admin/assistants` (optimistic update,
revert on failure). Coming-soon toggles still persist but their card copy
makes clear generation isn't live yet. When Claude Code is off, show a slim
danger-tinted banner: "Claude Code generation is disabled — uploads will not
produce new bundles."

Each live assistant card has a **View bundle** action opening a viewer:
file list from `GET /admin/assistants/{assistant}/bundle` on the left,
selected file rendered as markdown on the right from
`GET /admin/assistants/{assistant}/bundle/{path}` (URL-encode the path).
Empty state when no files have been generated yet.

## API contract

Base URL: `NEXT_PUBLIC_API_BASE` (e.g.
`https://abc123.execute-api.us-east-1.amazonaws.com`). All routes below are
under `/admin`. Every request except login and the presigned PUT sends
`Authorization: Bearer <token>`. Errors are `{"error": "...", "detail?": "..."}`;
401 means the token is missing/expired → clear it and go to `/login`.

`POST /admin/login`
```json
// request
{ "username": "admin", "password": "password" }
// 200
{ "token": "eyJ1IjoiYWRtaW4i....f3a9c1", "expires_at": "2026-07-20T09:00:00Z", "username": "admin" }
// 401
{ "error": "Invalid username or password" }
```

`GET /admin/documents`
```json
// 200
{ "documents": [
  { "id": "8f14e45f-ceea-4e17-a09b-6d1c3f2a7b90", "name": "enforcement-doc-core",
    "description": "Base org-wide rules", "filename": "enforcement-doc-core.md",
    "created": "2026-07-01T14:02:11Z", "updated": "2026-07-18T09:30:45Z",
    "deleted": null, "_version": 3, "created_by": "admin", "updated_by": "admin" },
  { "id": "2c9d1a77-90aa-4b1e-9f1f-5a3d8e6c4b21", "name": "enforcement-doc-security",
    "description": "Uploaded directly to S3", "filename": "enforcement-doc-security.md",
    "created": "2026-07-10T08:15:00Z", "updated": "2026-07-10T08:15:00Z",
    "deleted": null, "_version": 1, "created_by": "s3-upload", "updated_by": "s3-upload" }
] }
```

`POST /admin/documents`
```json
// request
{ "name": "enforcement-doc-hipaa", "description": "HIPAA additions", "filename": "enforcement-doc-hipaa.md" }
// 200 — then PUT the raw file body to upload_url (no auth header, no special content-type)
{ "document": { "id": "…", "name": "enforcement-doc-hipaa", "description": "HIPAA additions",
    "filename": "enforcement-doc-hipaa.md", "created": "2026-07-19T10:00:00Z",
    "updated": "2026-07-19T10:00:00Z", "deleted": null, "_version": 1,
    "created_by": "admin", "updated_by": "admin" },
  "upload_url": "https://agent-enforcer-source-…s3.amazonaws.com/enforcement-doc-hipaa.md?X-Amz-…",
  "upload_expires_in": 600 }
// 409 — a live document already tracks that filename
{ "error": "A document already tracks enforcement-doc-hipaa.md",
  "detail": "Use its re-upload action to replace the file, or delete it first." }
```

`PUT /admin/documents/{id}` — body `{ "name?": "...", "description?": "..." }`
→ 200 `{ "document": { …, "_version": 4, "updated_by": "admin" } }` · 404 `{ "error": "Document not found" }`

`DELETE /admin/documents/{id}` → 200 `{ "document": { …, "deleted": "2026-07-19T10:05:00Z" } }` · 404

`POST /admin/documents/{id}/upload-url` → 200 `{ "upload_url": "https://…", "upload_expires_in": 600 }` · 404

`POST /admin/documents/{id}/download-url` → 200 `{ "download_url": "https://…" }` · 404 (missing or deleted)

`GET /admin/stats`
```json
{ "active_licenses": 17, "total_licenses": 23, "max_licenses": 250,
  "documents": 2, "assistants_enabled": 1 }
```

`GET /admin/agents`
```json
{ "agents": [
  { "id": 23, "user_id": "i-0abc123def456", "agent_type": "ROCKY9",
    "agent_version": "0.3.0", "created_date": "2026-07-18T22:10:05Z",
    "last_used_date": "2026-07-19T09:55:00Z", "active": true },
  { "id": 7, "user_id": "alice@example.com", "agent_type": "ROCKY9",
    "agent_version": "0.2.1", "created_date": "2026-06-30T12:00:00Z",
    "last_used_date": "2026-07-02T12:00:00Z", "active": false }
], "count": 2 }
```

`GET /admin/assistants` → 200 `{ "assistants": { "claude-code": true, "kiro": false, "cursor": false, "github-copilot": false } }`

`DELETE /admin/agents/{id}` → 200 `{ "id": 23 }` · 404 (unknown or already
inactive). Deactivates the license and frees the slot.

`PUT /admin/assistants` — body `{ "assistants": { "cursor": true } }` (partial
updates fine, booleans only) → 200 with the full resulting `assistants` map ·
400 on unknown keys.

`GET /admin/assistants/{assistant}/bundle`
```json
{ "assistant": "claude-code", "files": [
  { "path": "CLAUDE.md", "size": 812, "updated": "2026-07-19T09:55:00Z" },
  { "path": "skills/python-standards.md", "size": 1834, "updated": "2026-07-19T09:55:00Z" }
] }
```
404 on unknown assistant; `files: []` for assistants with no pipeline yet.

`GET /admin/assistants/{assistant}/bundle/{path}` — client URL-encodes `path`
(nested paths like `skills/x.md` become one segment) → 200
`{ "path": "skills/python-standards.md", "content": "…" }` · 404.

## Mock mode

Put ALL fetch logic in `lib/api.ts` behind a `USE_MOCKS` boolean (default
`true` so the preview works instantly). Mock fixtures must match the sample
JSON above exactly, with realistic latency (300–600ms) and a mock login that
accepts admin/password. Switching to the real backend must be exactly two
changes: set `USE_MOCKS = false` and provide `NEXT_PUBLIC_API_BASE`. (In this
repo those two switches are wired to `NEXT_PUBLIC_USE_MOCKS` and the
deploy-time `/config.js` — see the header note.)

Polish bar: loading skeletons on every data surface, toasts for all
mutations, relative timestamps with full ISO on hover, empty states designed
as carefully as full states, keyboard/focus states in gold, and a favicon
using the shield mark. No lorem ipsum anywhere.
