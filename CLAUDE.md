# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow — Required Before Any Work

**Before starting any task in this repository, always:**

1. `git checkout main && git pull origin main` — get latest
2. `git checkout -b <short-descriptive-branch-name>` — create a feature branch
3. Enter plan mode and present the approach before writing any code or making changes

Do not skip any of these steps, even for small changes. Branch names should be lowercase-hyphenated and describe the work (e.g., `add-user-discovery`, `fix-self-destruct-tag`, `update-ip-docs`).

## Version Management

The canonical project version is in `VERSION` at the repo root. Current: **0.2.1**

**On every new feature, ask the user which segment to bump (patch / minor / major), then update all three locations:**
1. `VERSION` file (single line, e.g. `0.2.1`)
2. `rpm/SPECS/agent-enforcer.spec` — the `Version:` field
3. `rpm/SOURCES/agent-enforcer` — the `readonly AGENT_VERSION=` constant

CI auto-bumps patch on every merge to main. Include `[minor]` or `[major]` in the commit message to override.

## Test Suite — Required Rules

**Every new feature that adds testable functionality MUST have tests.**

- **Lambda/backend**: add to `tests/lambda/test_license.py` using `pytest` + `moto`
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
python -m pytest tests/lambda/test_license.py -v

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
npm run destroy:all                    # destroy all stacks (clean slate)
```

**Dev deploy policy**: In this dev environment, any CDK infrastructure update should be preceded by `npm run destroy:all` for a clean slate. Never assume partial state is safe — always nuke and redeploy in dev.

**Rocky Linux AMI prerequisite**: The DemoStack and RpmBuilderStack use the Rocky Linux 9 Marketplace AMI. Before deploying these stacks for the first time in a new AWS account, you must subscribe at:
`https://aws.amazon.com/marketplace/pp?sku=3qk9e6x2ni81uiqnorll45r3f`

### Stacks
- `AgentEnforcerStack` — S3 buckets (source, dist) + config-generator Lambda + DynamoDB license table + API Gateway license API + Secrets Manager config
- `DemoStack` — 2 Rocky Linux EC2 instances, self-destruct Lambda, analysis Lambda, results bucket
- `RpmBuilderStack` — builds and publishes the RPM via EC2

### Lambda functions (all Python 3.12, in `cdk/lib/lambda/`)
| Directory | Trigger | Purpose |
|-----------|---------|---------|
| `config-generator/` | S3 PUT on `enforcement-source` | Calls Bedrock to convert enforcement doc → `.claude/` file bundle, writes to `enforcement-dist/claude-code/latest/` |
| `license/` | API Gateway POST | Handles `/agent-enforcer/register` and `/agent-enforcer/sync` |
| `self-destruct/` | Function URL (HTTP POST) | Terminates a tagged demo EC2 instance when it calls in |
| `analysis/` | S3 PUT suffix `completed` on `demo-results` | Waits for both instances to finish, calls Bedrock for comparison, writes `results.md` |

### S3 buckets
| Bucket | Access | Purpose |
|--------|--------|---------|
| `agent-enforcer-source-<account>` | Private | Upload enforcement docs here — triggers Lambda |
| `agent-enforcer-dist-<account>` | **Private** | Configs distributed via presigned URLs from license API |
| `agent-enforcer-results-<account>` | Public read | Demo instance outputs + `results.md` |
| `agent-enforcer-rpm` | Public read | Pre-existing bucket for hosting built RPMs |

### API Gateway
- Base URL output: `ApiEndpoint` CDK output (used by demo instances and for manual testing)
- Routes: `POST /agent-enforcer/register`, `POST /agent-enforcer/sync`
- Default endpoint in agent: `https://alchemistfederal.com/agent-enforcer`

### DynamoDB
- Table: `AgentEnforcerLicenses`
- PK: `license_id` (UUID4); GSI: `UserIndex` on `user_id`
- Special counter item `{ license_id: "COUNTER", active_count: N, total_count: N }`
- MAX_LICENSES stored in Secrets Manager secret `agent-enforcer/config`

### Future prod deploy considerations
Current stacks use `RemovalPolicy.DESTROY` and `autoDeleteObjects: true` — dev-only. For a future prod stack:
- Use `RemovalPolicy.RETAIN` for DynamoDB and S3 buckets with license data
- Create a separate `prod` CDK context or environment that overrides removal policies
- Never `destroy:all` in prod — it would wipe the license registry

## RPM Package (`rpm/`)

Builds a `noarch` RPM for Rocky Linux 9 / RHEL 9. Current version: **0.2.1**

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
agent-enforcer sync
agent-enforcer --daemon
```

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
- `demo/enforcement-doc-core.md` — demo enforcement doc (upload manually to trigger generation)
- `demo/system-spec.md` — task given to both demo instances
- `rpm/SOURCES/agent-enforcer` — main bash script (all CLI commands + daemon loop)
- `tests/lambda/test_license.py` — license Lambda pytest suite (16 tests)
- `tests/agent/test_agent.sh` — agent bash test suite (22 assertions / 10 tests)

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
