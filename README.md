# Agent Enforcer ("Stop the Slop")

Enterprise enforcement layer that standardizes and continuously enforces AI/agent rules, skills, and secure-by-default patterns across developer tools and local environments.

## Prerequisites

### 1. AWS Account Setup

**Rocky Linux Marketplace Subscription (required before first deploy)**

The demo and RPM builder EC2 instances run Rocky Linux 9. AWS requires a one-time Marketplace subscription per account — it is free:

> Subscribe at: **https://aws.amazon.com/marketplace/pp?sku=3qk9e6x2ni81uiqnorll45r3f**

Click "Continue to Subscribe" then "Accept Terms". You can proceed with deploying the enforcement infrastructure (`AgentEnforcerStack`) while waiting for the subscription to activate (~1 minute), but `DemoStack` and `RpmBuilderStack` will fail until it is active.

**Bedrock Model Access**

The config-generator Lambda uses Claude via Amazon Bedrock. Ensure the following model is enabled in your account under Bedrock > Model access:

- `Claude Sonnet 4.5` (model ID: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`)

Enable at: AWS Console > Bedrock > Model access > Manage model access

**Secrets Manager**

Store your Anthropic API key (used by demo EC2 instances to run Claude Code):

```bash
aws secretsmanager create-secret \
  --name agent-enforcer/dev/api-key \
  --secret-string '{"api-key": "sk-ant-..."}'
```

Update the ARN in `cdk/lib/demo-stack.ts` (`API_KEY_SECRET_ARN` constant) if you use a different name.

### 2. Local Tooling

```bash
node --version   # 18+
npm --version
aws --version    # AWS CLI v2
npx cdk --version
```

Install CDK globally if needed: `npm install -g aws-cdk`

### 3. CDK Bootstrap (once per account/region)

```bash
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

---

## Architecture

```
enforcement-source S3          enforcement-dist S3 (public)
  (*.md docs uploaded)  --->  Lambda (Bedrock Claude)  --->  .claude/ bundle
                                                                    |
                                                             RPM agent syncs
                                                             to ~/.claude/
```

### Stacks

| Stack | Purpose |
|-------|---------|
| `AgentEnforcerStack` | S3 buckets + config-generator Lambda. Reads all `*.md` files from source bucket on upload, generates unified `.claude/` bundle via Bedrock, writes to dist bucket. |
| `DemoStack` | 2 Rocky Linux EC2 instances (control vs enforced). Both build a project from the same spec; enforced instance has Agent Enforcer active. Results + analysis written to S3. |
| `RpmBuilderStack` | Rocky Linux EC2 instance that builds the RPM, uploads to `agent-enforcer-rpm` S3, self-destructs. |

### S3 Buckets

| Bucket | Access | Purpose |
|--------|--------|---------|
| `agent-enforcer-source-<account>` | Private | Upload enforcement docs here — triggers config generation |
| `agent-enforcer-dist-<account>` | Public read | RPM agents pull `.claude/` configs from here |
| `agent-enforcer-results-<account>` | Public read | Demo outputs + `results.md` comparison |
| `agent-enforcer-rpm` | Public read | Built RPM packages |

---

## Deploy

```bash
cd cdk
npm install

# Deploy enforcement infrastructure only
npm run deploy:enforcer

# Deploy demo (requires Marketplace subscription + API key in Secrets Manager)
npm run deploy:demo

# Build the RPM (starts EC2 builder, self-destructs when done)
npm run build:rpm

# Deploy all three stacks
npm run deploy:all

# Tear everything down
npm run destroy:all
```

**Build RPM with a custom AMI:**
```bash
AMI_ID=ami-xxxxxxxx npm run build:rpm:custom
```

**Force a new RPM build** (rerun after instance has self-destructed):
```bash
npx cdk deploy RpmBuilderStack --context buildTimestamp=$(date +%s)
```

---

## Enforcement Documents

Upload `.md` files to the `enforcement-source` S3 bucket to trigger config generation. Every upload causes the Lambda to re-read **all** documents and regenerate the complete `.claude/` bundle.

**Naming convention:**

| File | Purpose |
|------|---------|
| `enforcement-doc-core.md` | Base org-wide rules (seeded automatically on deploy) |
| `enforcement-doc-security.md` | Security-specific additions |
| `enforcement-doc-hipaa.md` | HIPAA compliance additions |
| `enforcement-doc-coding.md` | Language and style additions |

The Lambda generates: `CLAUDE.md` (combined rules), `settings.json`, `skills/*.md` (reusable behaviors), and `commands/*.md` (slash commands) — all inferred from the enforcement doc content.

**Upload a custom policy:**
```bash
aws s3 cp my-policy.md s3://agent-enforcer-source-$(aws sts get-caller-identity --query Account --output text)/enforcement-doc-security.md
```

**Check generated output:**
```bash
aws s3 ls s3://agent-enforcer-dist-$(aws sts get-caller-identity --query Account --output text)/claude-code/latest/
```

---

## Installing the Agent (Rocky Linux / RHEL)

```bash
# Download latest RPM
aws s3 cp s3://agent-enforcer-rpm/agent-enforcer-0.1.0-1.noarch.rpm /tmp/

# Install
sudo rpm -ivh /tmp/agent-enforcer-0.1.0-1.noarch.rpm

# Configure with your enforcement bucket
sudo agent-enforcer configure --bucket agent-enforcer-dist-<account-id>

# Check status
agent-enforcer status
```

The service starts on boot, does nothing until configured, then syncs every 15 minutes.

---

## Demo Flow

1. Deploy `AgentEnforcerStack` — enforcement infrastructure is live
2. Upload `demo/enforcement-doc-core.md` to the source bucket (or redeploy to trigger automatic upload):
   ```bash
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   aws s3 cp demo/enforcement-doc-core.md s3://agent-enforcer-source-$ACCOUNT/
   ```
3. Verify `claude-code/latest/CLAUDE.md` appears in the dist bucket
4. Build and upload the RPM: `cd cdk && npm run build:rpm`
5. Deploy `DemoStack` — two instances start, run Claude Code, upload results, self-terminate
6. Check results (~15–20 min after deploy):
   ```
   https://agent-enforcer-results-<account>.s3.amazonaws.com/results.md
   ```

---

## Troubleshooting

**"In order to use this AWS Marketplace product you need to accept terms"**
Subscribe at: https://aws.amazon.com/marketplace/pp?sku=3qk9e6x2ni81uiqnorll45r3f

**"ResourceNotFoundException: This model version has reached end of its life"**
The Bedrock model ID is outdated. Find active models:
```bash
aws bedrock list-foundation-models --by-provider anthropic \
  --query "modelSummaries[?modelLifecycle.status=='ACTIVE'].modelId" --output table
```
Update `BEDROCK_MODEL_ID` env var in `cdk/lib/agent-enforcer-stack.ts` and `cdk/lib/demo-stack.ts`. Use the `us.*` cross-region inference profile prefix.

**"ValidationException: Invocation with on-demand throughput isn't supported"**
You are using a direct model ID (e.g., `anthropic.claude-sonnet-4-6`). Switch to the cross-region inference profile format: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`.

**"AccessDeniedException: not authorized to perform bedrock:InvokeModel"**
The IAM policy for the Lambda must use `"Resource": "*"` — cross-region inference profiles route through multiple AWS regions and cannot be scoped to a single ARN.
