# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow — Required Before Any Work

**Before starting any task in this repository, always:**

1. `git checkout main && git pull origin main` — get latest
2. `git checkout -b <short-descriptive-branch-name>` — create a feature branch
3. Enter plan mode and present the approach before writing any code or making changes

Do not skip any of these steps, even for small changes. Branch names should be lowercase-hyphenated and describe the work (e.g., `add-user-discovery`, `fix-self-destruct-tag`, `update-ip-docs`).

## Project Overview

Agent Enforcer is an enterprise AI configuration enforcement system ("Stop the Slop"). It consists of:
- A CDK stack that processes enforcement documents via Bedrock and distributes generated `.claude/` configs via S3
- An RPM package for Rocky Linux that runs as a systemd service, pulling configs from S3 and applying them to every user's `~/.claude/`
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

**Rocky Linux AMI prerequisite**: The DemoStack and RpmBuilderStack use the Rocky Linux 9 Marketplace AMI. Before deploying these stacks for the first time in a new AWS account, you must subscribe at:
`https://aws.amazon.com/marketplace/pp?sku=3qk9e6x2ni81uiqnorll45r3f`

Two stacks:
- `AgentEnforcerStack` — S3 buckets (source, dist, results) + config-generator Lambda (Bedrock) + default enforcement doc asset upload
- `DemoStack` — 2 Rocky Linux EC2 instances, self-destruct Lambda, analysis Lambda

### Lambda functions (all Python 3.12, in `cdk/lib/lambda/`)
| Directory | Trigger | Purpose |
|-----------|---------|---------|
| `config-generator/` | S3 PUT on `enforcement-source` | Calls Bedrock to convert enforcement doc → `.claude/` file bundle, writes to `enforcement-dist/claude-code/latest/` |
| `self-destruct/` | Function URL (HTTP POST) | Terminates a tagged demo EC2 instance when it calls in after uploading results |
| `analysis/` | S3 PUT suffix `completed` on `demo-results` | Waits for both instances to finish, reads generated project files, calls Bedrock for comparison, writes `results.md` |

### S3 buckets
| Bucket | Access | Purpose |
|--------|--------|---------|
| `agent-enforcer-source-<account>` | Private | Upload enforcement docs here — triggers Lambda |
| `agent-enforcer-dist-<account>` | Public read | RPM agents sync `.claude/` configs from here |
| `agent-enforcer-results-<account>` | Public read | Demo instance outputs + `results.md` |
| `agent-enforcer-rpm` | Public read | Pre-existing bucket for hosting built RPMs |

## RPM Package (`rpm/`)

Builds a `noarch` RPM for Rocky Linux 9 / RHEL 9. Requires `rpmbuild` and `systemd-rpm-macros`.

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
- `/usr/bin/agent-enforcer` — CLI (`configure`, `status`, `sync`, `--daemon`)
- `/usr/lib/systemd/system/agent-enforcer.service` — enabled on install, starts on boot
- `/etc/agent-enforcer/` — config directory (root:root, mode 750)
- `/var/lib/agent-enforcer/` — state directory (last-sync timestamp, error logs)

The service does nothing until `sudo agent-enforcer configure --bucket <bucket>` is run. After configure, it syncs every 15 minutes and applies configs to `/home/*/.claude/` and `/etc/claude-code/managed-settings.json`.

## Demo Flow

1. Deploy `AgentEnforcerStack` → note `EnforcementSourceBucket` output
2. Upload `demo/enforcement-doc.md` to the source bucket to trigger config generation:
   ```bash
   aws s3 cp demo/enforcement-doc.md s3://agent-enforcer-source-<account>/enforcement-doc.md
   ```
3. Verify `agent-enforcer-dist-<account>/claude-code/latest/CLAUDE.md` appears
4. Build and upload the RPM (see above)
5. Deploy `DemoStack` → two EC2 instances start automatically, run Claude Code, upload results, self-terminate
6. Check `s3://agent-enforcer-results-<account>/results.md` (~10–20 min after deploy)

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

Any `*.md` upload to the source bucket triggers the Lambda, which reads **all** `.md` files and regenerates the combined `.claude/` bundle. Upload `demo/enforcement-doc-core.md` to add demo policies on top of core.

## Key Files
- `cdk/assets/default-enforcement.md` — default policy seeded into source bucket on first deploy
- `demo/enforcement-doc.md` — demo enforcement doc (upload manually to trigger generation)
- `demo/system-spec.md` — task given to both demo instances
- `rpm/SOURCES/agent-enforcer` — main bash script (all CLI commands + daemon loop)

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

Specifically flag additions to: the daemon sync mechanism, the config-generator Lambda pipeline, the enforcement bundle schema (CLAUDE.md/settings.json/skills/commands structure), the user discovery logic, and any tamper-resistance or immutability features.

## AWS Account Context
- Account: `008971674866`, Region: `us-east-1`
- API key secret: `arn:aws:secretsmanager:us-east-1:008971674866:secret:agent-enforcer/dev/api-key-RNsIUc` (key: `api-key`)
- RPM bucket: `agent-enforcer-rpm` (pre-existing, needs public read policy)
