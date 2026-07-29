# Importing a refreshed v0.app zip

Both `ui/admin-page/` (the admin console) and `ui/product-page/` (the public
marketing site) are generated with v0.app and handed over periodically as
zips (`agent-enforcer.zip`, `agent-enforcer-showcase.zip`). Both deploy as
Next.js static exports (S3 + CloudFront), not the live-server Vercel
deployment v0 assumes, so every fresh zip needs the same class of adaptation
before it's usable. Replay this checklist each time — don't re-derive it.

**The most important rule: never overwrite `lib/api.ts` (either app) or the
config/Analytics parts of `app/layout.tsx` wholesale.** v0 has no visibility
into our CDK-deployed runtime-config wiring or any custom fields we've added
on top of a previous zip (e.g. the admin dashboard's `unique_platforms`
field), and a fresh export will always regenerate these files from a stale
base that regresses both. Diff before replacing, always.

## 1. Diff first, don't blind-overwrite

Unzip to a scratch directory and `diff -rq` against the current
`ui/admin-page/` or `ui/product-page/` (excluding `node_modules`, `.next`,
`out`, `pnpm-lock.yaml`, `next-env.d.ts`, `tsconfig.tsbuildinfo`) before
touching the real tree. Bucket every changed file into:
- **Safe to take wholesale** — pure UI/component changes with no
  backend-integration coupling (this is most of the diff, usually).
- **Needs manual reconciliation** — anything in `lib/api.ts`,
  `app/layout.tsx`'s config-script-tag/favicon/Analytics bits,
  `next.config.mjs`, `package.json`, `.gitignore`.
- **Custom additions layered on a previous zip** (e.g. a stat card wired to
  a Lambda field the zip's author doesn't know about) — these live in a
  "safe to take wholesale" file that v0 regenerated from an older base, so
  they get silently dropped unless you specifically reapply them after
  copying the new version in.

A reasonable mechanical approach: `rsync -a --delete --exclude ...` the new
zip over the target directory, but `--exclude lib/api.ts --exclude
public/config.js` so those two are never touched by the sync, then fix up
the other protected files by hand afterward.

## 2. `next.config.mjs` — static export settings

v0's export sometimes includes `output: 'export'` and sometimes doesn't;
`trailingSlash: true` is reliably missing either way (S3 website hosting
resolves directory index documents, not extensionless paths — `/fleet/`
works, `/fleet.html`-style routes don't):
```js
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
}
```

## 3. `app/layout.tsx` — protected integration points

After taking the new file, restore/fix these regardless of what the diff
shows:
- Keep (or restore) `<script src="/config.js" />` right before `{children}`
  in the `<body>` — this is what the CDK `BucketDeployment` overwrites at
  deploy time with the real API base URL
  (`window.__AE_CONFIG__`/`window.__SHOWCASE_CONFIG__`, see `lib/api.ts` in
  each app). If it's missing, the deployed app silently falls back to
  build-time-only config and breaks.
- Remove any `import { Analytics } from '@vercel/analytics/next'` and the
  `<Analytics />` element — no Vercel project is connected to either
  deployment, so it's dead weight.
- Point `metadata.icons` at the correct brand favicon (see §5).

## 4. Backend-coupled routes (`app/api/**/route.ts`)

Static export can't ship dynamic Route Handlers — `next build` fails if one
remains. If the zip includes one (e.g. `app/api/contact/route.ts`), delete
it and move its logic into a Lambda behind the corresponding CDK stack's API
Gateway (see `cdk/lib/lambda/contact/index.py` for the pattern), then rewire
the client component that called it (e.g. `contact-form.tsx`) to go through
`lib/api.ts` instead of a relative `fetch('/api/...')`. This is also the
pattern to follow if a *new* zip adds a form/feature that needs its own
backend: new Lambda + API route + a typed function in `lib/api.ts`.

`ui/product-page/lib/api.ts` doesn't exist in any zip — it's ours. Recreate
it from the current repo version (or copy it forward from the previous
import) rather than writing it from scratch; same for
`ui/admin-page/lib/api.ts`, except there it already exists in the repo and
should just be **left untouched** (see the rule at the top).

## 5. Favicon

Check for `scripts/make-favicon.mjs` in the new zip first — if present, it's
already correctly compositing `public/agent-enforcer-icon.png` onto navy via
`sharp`, and its output (`favicon-64.png`, `apple-icon.png`, `icon-512.png`)
is the canonical asset. Rename `favicon-64.png` → `favicon.png` (our
established filename) and copy both `favicon.png` and `apple-icon.png` into
**both** `ui/admin-page/public/` and `ui/product-page/public/` — the two
sites are meant to share one tab icon, generated from one source. Delete the
usual v0 leftover placeholders in both apps' `public/`: `favicon.svg`,
`icon.svg`, `icon-dark-32x32.png`, `icon-light-32x32.png`, and
`icon-512.png` if unused, plus any wrongly-themed favicon variant a zip
might ship (e.g. a `favicon-navy.png` that turns out to be an unrelated
crest/logo, not the shield-brain — sanity-check the actual image content,
don't assume the filename is right). Point both apps' `metadata.icons` at
`{ icon: '/favicon.png', apple: '/apple-icon.png' }`.

If no `make-favicon.mjs` is present, regenerate manually: composite
`public/agent-enforcer-icon.png` (transparent shield-brain outline) onto a
navy (`#0A1628`/`#081120`) rounded-square background, ~78% fill, and save as
`favicon.png` in both apps.

## 6. `package.json`

- Fix `name` back to `"agent-enforcer-ui"` (admin) or
  `"agent-enforcer-product-page"` (showcase) — v0 resets it to `"my-project"`.
- Remove the `@vercel/analytics` dependency line (see §3).
- Regenerate the lockfile after any edit — CDK bundling runs
  `pnpm install --frozen-lockfile`, which fails on a stale lockfile:
  ```bash
  cd ui/admin-page && npx -y pnpm@10 install      # or ui/product-page
  ```

## 7. `.gitignore`

v0's export is usually missing `out/` in the "Common ignores" block — add it
back alongside `node_modules`/`.next/`.

## 8. Reapply custom UI additions layered on a previous zip

Check `git log`/memory for anything added on top of the *previous* import
that lives in a file the new zip also touches (the dashboard's "Operating
systems" stat card in `components/dashboard/stat-cards.tsx` is the running
example — v0 doesn't know it exists, so a fresh `stat-cards.tsx` reverts both
the card and the grid-column count it was tuned for). Reapply these by hand
after taking the new base file.

## 9. Verify before committing
```bash
cd ui/admin-page   # and separately ui/product-page
npx -y pnpm@10 exec tsc --noEmit
NEXT_TELEMETRY_DISABLED=1 npx -y pnpm@10 run build   # must succeed with output:'export'
npx -y pnpm@10 dev                                    # spot-check in a browser:
                                                        #   favicon tab icon, mobile nav,
                                                        #   any custom stat cards/features
```
Then `cd cdk && npx cdk synth` to confirm both bundling paths still work end
to end, and `python -m pytest tests/lambda/ -v` if any Lambda was touched.

## 10. Leave everything else alone
Copy, sections, styling, new hooks/components, and any new pages/assets in
the zip ship as-is unless they need one of the adaptations above.
