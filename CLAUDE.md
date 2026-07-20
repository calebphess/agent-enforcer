# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow — Required Before Any Work

**Before starting any task in this repository, always:**

1. `git checkout main && git pull origin main` — get latest
2. `git checkout -b <short-descriptive-branch-name>` — create a feature branch
3. Enter plan mode and present the approach before writing any code or making changes

Do not skip any of these steps, even for small changes. Branch names should be lowercase-hyphenated and describe the work (e.g., `add-user-discovery`, `fix-self-destruct-tag`, `update-ip-docs`).

## Version Management

The canonical project version is in `VERSION` at the repo root. Current: **0.3.0**

**On every new feature, ask the user which segment to bump (patch / minor / major), then update all three locations:**
1. `VERSION` file (single line, e.g. `0.2.1`)
2. `rpm/SPECS/agent-enforcer.spec` — the `Version:` field
3. `rpm/SOURCES/agent-enforcer` — the `readonly AGENT_VERSION=` constant

CI auto-bumps patch on every merge to main. Include `[minor]` or `[major]` in the commit message to override.

## Test Suite — Required Rules

**Every new feature that adds testable functionality MUST have tests.**

- **Lambda/backend**: add to the matching suite in `tests/lambda/` (`test_license.py`, `test_admin_api.py`, `test_config_generator.py`) using `pytest` + `moto`. One suite per Lambda — each `index.py` after the first must load via `importlib.util.spec_from_file_location` under a unique module name (`test_license.py` holds the bare `import index`)
- **Agent bash**: add to `tests/agent/test_agent.sh` using the existing harness
- **At end of every plan**: list the specific tests that will be written (by name) so the user can review them

**NEVER change a failing test without explicit user approval.** Before modifying a test:
1. Explain which test is failing and what the failure message is
2. Explain why the test is wrong (not just why it doesn't pass)
3. Get explicit approval before editing the test

Running tests locally:
```bash
# Lambda tests
pip install -r tests/lambda/requirements-test.txt
python -m pytest tests/lambda/ -v

# Agent tests
bash tests/agent/test_agent.sh
```

## Project Overview

Agent Enforcer is an enterprise AI configuration enforcement system ("Stop the Slop"). It consists of:
- A CDK stack that processes enforcement documents via Bedrock and distributes generated `.claude/` configs via a licensed REST API
- An RPM package for Rocky Linux that runs as a systemd service, registering a license and pulling configs via API presigned URLs
- A demo CDK stack that spins up two EC2 instances (one enforced, one not) to show the difference in Claude Code output

## CDK Stack (`cdk/`)

```bash
cd cdk
npm install
npx cdk synth                          # validate — generates CloudFormation
npm run deploy:enforcer                # deploy enforcement infrastructure
npm run deploy:demo                    # deploy 2-instance demo
npm run build:rpm                      # build RPM (starts EC2, uploads to S3, self-destructs)
npm run deploy:all                     # deploy all 3 stacks
npm run deploy:all:demo                # all 3 stacks, interactive demo + public console at demo.agent-enforcer.com
npm run destroy:all                    # destroy all stacks (clean slate)
```

`cdk synth`/`deploy` build the admin UI (`ui/` Next.js static export) as part of asset bundling — node + network required; pnpm runs via `npx -y pnpm@10` with a Docker `node:22` fallback.

**Dev deploy policy**: In this dev environment, any CDK infrastructure update should be preceded by `npm run destroy:all` for a clean slate. Never assume partial state is safe — always nuke and redeploy in dev.

**Rocky Linux AMI prerequisite**: The DemoStack and RpmBuilderStack use the Rocky Linux 9 Marketplace AMI. Before deploying these stacks for the first time in a new AWS account, you must subscribe at:
`https://aws.amazon.com/marketplace/pp?sku=3qk9e6x2ni81uiqnorll45r3f`

### Stacks
- `AgentEnforcerStack` — S3 buckets (source, dist, admin UI) + config-generator Lambda + DynamoDB license and documents tables + API Gateway (license API + `/admin` API) + Secrets Manager config + console DNS (private hosted zone by default; CloudFront + ACM + public Route 53 records with `-c uiDomain=...`)
- `DemoStack` — 2 Rocky Linux EC2 instances, self-destruct Lambda, analysis Lambda, results bucket
- `RpmBuilderStack` — builds and publishes the RPM via EC2

### Lambda functions (all Python 3.12, in `cdk/lib/lambda/`)
| Directory | Trigger | Purpose |
|-----------|---------|---------|
| `config-generator/` | S3 PUT + delete on `enforcement-source` | Calls Bedrock to convert enforcement doc → `.claude/` file bundle, writes to `enforcement-dist/claude-code/latest/`; honors the claude-code SETTINGS toggle (fail-open) and auto-registers direct S3 uploads in the documents table |
| `license/` | API Gateway POST | Handles `/agent-enforcer/register` and `/agent-enforcer/sync` |
| `admin/` | API Gateway (all `/admin/*` routes) | Web console backend: login (secret-backed creds, defaults `admin`/`password`), documents CRUD + presigned uploads/downloads, dashboard stats, agents list + deregistration (deactivates license, frees the slot), assistant toggles, bundle viewer (list/read generated configs in the dist bucket) |
| `self-destruct/` | Function URL (HTTP POST) | Terminates a tagged demo EC2 instance when it calls in |
| `analysis/` | S3 PUT suffix `completed` on `demo-results` | Waits for both instances under a base prefix to finish, calls Bedrock for comparison, writes `<base>results.md` (root for the auto demo, `runs/<run-id>/` for interactive runs) |

### S3 buckets
| Bucket | Access | Purpose |
|--------|--------|---------|
| `agent-enforcer-source-<account>` | Private | Upload enforcement docs here — triggers Lambda |
| `agent-enforcer-dist-<account>` | **Private** | Configs distributed via presigned URLs from license API |
| `agent-enforcer-results-<account>` | Public read | Demo instance outputs + `results.md` |
| UI bucket (see naming rule) | Public read (website) | Admin console static site, built from `ui/` at synth. Named `ui.<uiInternalDomain>` in private mode (S3 virtual hosting requires host == bucket name), `agent-enforcer-ui-<account>` in public mode; `uiBucketName` context overrides. Mode switches replace the bucket — fine under destroy-first dev policy |
| `agent-enforcer-rpm` | Public read | Pre-existing bucket for hosting built RPMs |

### API Gateway
- Base URL output: `ApiEndpoint` CDK output (used by demo instances, the admin UI, and manual testing)
- Agent routes: `POST /agent-enforcer/register`, `POST /agent-enforcer/sync`
- Admin routes (Bearer-token auth except login): `POST /admin/login`, `GET|POST /admin/documents`, `PUT|DELETE /admin/documents/{id}`, `POST /admin/documents/{id}/upload-url`, `POST /admin/documents/{id}/download-url`, `GET /admin/stats`, `GET /admin/agents`, `DELETE /admin/agents/{id}`, `GET|PUT /admin/assistants`, `GET /admin/assistants/{assistant}/bundle`, `GET /admin/assistants/{assistant}/bundle/{path+}` (greedy — nested bundle paths; Lambda unquotes)
- CORS is API-wide (GET/POST/PUT/DELETE + Authorization header) for the browser UI
- Default endpoint in agent: `https://alchemistfederal.com/agent-enforcer`

### DynamoDB
- Table: `AgentEnforcerLicenses`
  - PK: `license_id` (UUID4); GSI: `UserIndex` on `user_id`
  - Special counter item `{ license_id: "COUNTER", active_count: N, total_count: N }`
  - MAX_LICENSES stored in Secrets Manager secret `agent-enforcer/config`
- Table: `AgentEnforcerDocuments`
  - PK: `id` (UUID4); items: `name, description, filename, created, updated, deleted (null|ISO — soft delete), _version, created_by, updated_by`
  - Special settings item `{ id: "SETTINGS", assistants: { "claude-code": bool, "kiro": bool, "cursor": bool, "github-copilot": bool } }` (absent = code defaults, claude-code on)
  - Docs uploaded straight to S3 (`aws s3 cp`) are auto-registered by config-generator (`created_by: "s3-upload"`); re-uploads refresh the record unless it changed in the last 120s (UI upload grace window)

### Admin Web UI
- Login defaults `admin`/`password` — override via `admin_username`/`admin_password` (+ optional `admin_session_secret`) in the `agent-enforcer/config` secret. Defaults live in Lambda code because a deployed secret never picks up `generateSecretString` template changes.
- `ui/` is the checked-in Next.js 16 source (pnpm, static export, `trailingSlash: true`). CDK bundling builds it at synth — no manual export step. Local dev: `cd ui && NEXT_PUBLIC_USE_MOCKS=true npx -y pnpm@10 dev` (mock data) or set `NEXT_PUBLIC_API_BASE` to hit a deployed API (CORS is open).
- API base reaches the browser via a deploy-time `config.js` (`window.__AE_CONFIG__.apiBase`, written by BucketDeployment `Source.data`) — no rebuild per environment; `lib/api.ts` resolves it lazily.
- **Serving modes** (context-driven, one website bucket):
  - *Private (default)*: Route 53 **private** hosted zone `uiInternalDomain` (default `agent-enforcer.internal`, ~$0.50/mo) anchored to a $0 micro-VPC (`-c uiVpcId` to associate an existing VPC), `ui.<domain>` CNAME → S3 website endpoint. The name resolves **only inside associated VPCs** — from a laptop use the `UiWebsiteEndpoint` output. Customers point their own DNS/resolvers at the zone or CNAME the website endpoint.
  - *Public* (`-c uiDomain=demo.agent-enforcer.com`): CloudFront + ACM cert (DNS-validated in the parent public zone via `fromLookup` — requires the zone in-account; first deploy waits a few minutes on validation) + A/AAAA aliases. `UiUrl` → `https://<uiDomain>`. us-east-1 only.
- `UiUrl` output = mode-appropriate console URL; `UiWebsiteEndpoint` output = raw S3 website URL (always reachable, HTTP).

### Future prod deploy considerations
Current stacks use `RemovalPolicy.DESTROY` and `autoDeleteObjects: true` — dev-only. For a future prod stack:
- Use `RemovalPolicy.RETAIN` for DynamoDB and S3 buckets with license data
- Create a separate `prod` CDK context or environment that overrides removal policies
- Never `destroy:all` in prod — it would wipe the license registry

## RPM Package (`rpm/`)

Builds a `noarch` RPM for Rocky Linux 9 / RHEL 9. Current version: **0.3.0**

Install with plain `sudo rpm -i` (no `-vh` needed) — `%post` prints an ASCII banner via `agent-enforcer banner` plus next-step hints. The banner art lives in the agent script as a quoted heredoc; never inline it in the spec (rpm macro-expands `%` in scriptlets). The spec's `%post` message and version file use `%{version}` — no hardcoded version strings.

```bash
cd rpm
rpmbuild -bb SPECS/agent-enforcer.spec --define "_topdir $(pwd)"
# Built RPM lands in rpm/RPMS/noarch/
```

After building, upload to the `agent-enforcer-rpm` S3 bucket:
```bash
aws s3 cp rpm/RPMS/noarch/agent-enforcer-*.rpm s3://agent-enforcer-rpm/
```

### What the RPM installs
- `/usr/bin/agent-enforcer` — CLI (`register`, `configure`, `status`, `sync`, `--daemon`)
- `/usr/lib/systemd/system/agent-enforcer.service` — enabled on install, starts on boot
- `/etc/agent-enforcer/` — config directory (root:root, mode 750); holds `config` file with `ENDPOINT=`
- `/var/lib/agent-enforcer/` — state directory; holds `license` file (root:root, 600) with `LICENSE_ID=`
- `/usr/lib/agent-enforcer/version` — version string file for self-reporting

The service does nothing until `sudo agent-enforcer register` is run. After registration, it syncs every 15 minutes via the license API (presigned URLs), applying configs to `/home/*/.claude/` and `/etc/claude-code/managed-settings.json`.

**Note**: `configure --bucket` was removed in v0.2.1 (breaking change). Use `register` and `configure --endpoint` instead.

### Agent commands
```
sudo agent-enforcer register [--endpoint <url>] [--user-id <id>]
                              [--old-license-id <id>] [--old-user-id <id>]
                              [--no-prompt]
sudo agent-enforcer configure --endpoint <url>
agent-enforcer status
sudo agent-enforcer describe # customer-facing: banner + enforcement status + enforced assistants
agent-enforcer sync
agent-enforcer --daemon
agent-enforcer banner        # install-time branding (called from %post; not in usage())
```

`describe` reads enforced-assistant toggles from `/var/lib/agent-enforcer/assistants`, which `sync` refreshes from the license API's `assistants` response field (sourced from the documents table SETTINGS item, fail-open to claude-code).

## Demo Flow

1. Deploy `AgentEnforcerStack` → note `ApiEndpoint` output
2. Upload `demo/enforcement-doc-core.md` to the source bucket to trigger config generation:
   ```bash
   aws s3 cp demo/enforcement-doc-core.md s3://agent-enforcer-source-<account>/enforcement-doc-core.md
   ```
3. Verify `agent-enforcer-dist-<account>/claude-code/latest/CLAUDE.md` appears (bucket is now private — check via AWS console or CLI)
4. Build and upload the RPM (see above)
5. Deploy `DemoStack` → two EC2 instances start automatically
   - Instance 1 (control): runs Claude Code unmodified
   - Instance 2 (enforced): installs RPM, auto-registers with `$INSTANCE_ID` as user_id, syncs via API, runs Claude Code under enforcement
   - Both upload results and self-terminate
6. Check `s3://agent-enforcer-results-<account>/results.md` (~10–20 min after deploy)

**Interactive demo mode**: `npm run deploy:demo:interactive` (context `demoMode=interactive`; default is `auto`). Instances stay up with `demo-prompt`/`demo-stream-filter.py` installed (shipped from `demo/` via demo-assets); operator opens the `ControlSessionUrl`/`EnforcedSessionUrl` outputs side by side, runs `sudo agent-enforcer describe` on the enforced box, then the identical `sudo demo-prompt "<prompt>"` on both. RUN_ID = sha256(prompt)[:12]; results at `runs/<run-id>/results.md`. No self-destruct — `destroy:all` cleans up; switching mode replaces both instances (`userDataCausesReplacement`). See README "Interactive customer demo".

**Demo license note**: Each demo deploy registers a new license. In dev, these accumulate against `MAX_LICENSES` (default 250). Reset by adjusting the secret or manually deactivating via DynamoDB console.

## Bedrock Model Selection

Cross-region inference profile IDs are required — direct model IDs fail with `ResourceNotFoundException` or `ValidationException`.

```bash
# Find active models
aws bedrock list-foundation-models --by-provider anthropic \
  --query "modelSummaries[?modelLifecycle.status=='ACTIVE'].modelId" --output table
```

Active (as of 2026-06): `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, `us.anthropic.claude-haiku-4-5-20251001-v1:0`

**IAM policy must use `"Resource": "*"`** — cross-region profiles route through multiple regions and no single ARN covers them.

## Enforcement Document Naming Convention

Documents in the `enforcement-source` S3 bucket follow this pattern:

| File | Purpose |
|------|---------|
| `enforcement-doc-core.md` | Base org-wide rules (always present) |
| `enforcement-doc-security.md` | Security additions |
| `enforcement-doc-hipaa.md` | HIPAA compliance additions |
| `enforcement-doc-coding.md` | Language/style additions |

Any `*.md` upload to the source bucket triggers the Lambda, which reads **all** `.md` files and regenerates the combined `.claude/` bundle.

## Key Files
- `VERSION` — canonical project version (single line)
- `cdk/assets/default-enforcement.md` — default policy seeded into source bucket on first deploy
- `cdk/lib/lambda/license/index.py` — register + sync endpoint logic
- `cdk/lib/lambda/admin/index.py` — admin console API (auth, documents, stats, toggles)
- `docs/ui/v0-prompt.md` — V0 design spec + API contract for the admin console frontend
- `ui/` — admin console Next.js source (V0 export, checked in); built at synth and deployed to the UI bucket
- `ui/lib/api.ts` — the console's single API layer (runtime config, auth, mocks)
- `demo/enforcement-doc-core.md` — demo enforcement doc (upload manually to trigger generation)
- `demo/system-spec.md` — task given to both demo instances (auto mode)
- `demo/demo-prompt.sh` — interactive-mode wrapper (per-prompt run, live stream, per-run upload)
- `demo/demo-stream-filter.py` — renders Claude Code stream-json as readable demo output
- `rpm/SOURCES/agent-enforcer` — main bash script (all CLI commands + daemon loop)
- `tests/lambda/` — Lambda pytest suites (61 tests: license 18, admin 33, config-generator 6, analysis 4)
- `tests/agent/test_agent.sh` — agent bash test suite (13 tests)

## Sales & Legal Documents (`docs/sales/`)
- `slicksheet.md` — government-facing product slick sheet (two-page, with image placeholders for PDF rendering)
- `offer-letter.md` — founding partner proposal / offer document for first agency engagement
- `outreach-email.txt` — cold outreach email template for Office of AI tech directors
- `intellectual-property.md` — IP briefing for legal counsel (patents, trademarks, trade secrets, copyright)

## IP Update Reminder
**When adding new capabilities to Agent Enforcer, review `docs/sales/intellectual-property.md` and consider whether the new capability:**
- Introduces a novel method or system that warrants a new patent candidate entry
- Changes the architecture in a way that affects existing patent candidate descriptions
- Creates new trade secret material (e.g., new LLM prompt engineering, new enforcement methodologies)
- Produces new copyrightable artifacts that should be registered

Specifically flag additions to: the daemon sync mechanism, the config-generator Lambda pipeline, the enforcement bundle schema (CLAUDE.md/settings.json/skills/commands structure), the user discovery logic, the license system, and any tamper-resistance or immutability features.

## AWS Account Context
- Account: `008971674866`, Region: `us-east-1`
- API key secret: `arn:aws:secretsmanager:us-east-1:008971674866:secret:agent-enforcer/dev/api-key-RNsIUc` (key: `api-key`)
- License config secret: `agent-enforcer/config` (key: `max_licenses`, default 250)
- RPM bucket: `agent-enforcer-rpm` (pre-existing, needs public read policy)
