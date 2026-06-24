# Agent Enforcer — Product Slick Sheet
*For graphic designer / LLM rendering agent: This document contains copy and layout intent for a two-page government-facing slick sheet PDF. Image placeholders are marked with `[IMAGE: ...]` and describe the visual to be generated as a vector PNG. Use Alchemist horizontal logo (provided) in the header. Use Agent Enforcer square icon (provided) where indicated. Color palette suggestion: deep navy (#0A1628), federal blue (#1B3A6B), signal gold (#C8A94A), white, light gray. Clean, authoritative, government-appropriate — think CISA or Palantir aesthetic, not consumer SaaS.*

---

<!-- PAGE 1 -->

[IMAGE: Alchemist horizontal logo, top-left, white on navy background header bar. Right-aligned in same header bar: "Agent Enforcer" product name in gold with the Agent Enforcer square icon to its left.]

---

# Stop the Slop.
## Enforce What Your AI Agents Are Allowed to Do — Before They Do It.

**Agent Enforcer** by Alchemist is an enterprise-grade policy enforcement layer for AI coding agents. It continuously distributes, applies, and locks in your organization's security policies, compliance requirements, and coding standards across every developer and every AI agent on your network — automatically, at the system level, before a single line of code is written.

> *When your agency deploys AI coding assistants, who's making sure they follow your rules?*

---

## The Problem

[IMAGE: Split illustration — left side shows a chaotic network of developer workstations with AI agents running freely, each with different (conflicting) rules icons floating above them — padlock open, warning triangle, no coding standard badge. Right side shows same network unified under a single shield icon with checkmarks. Visual metaphor: ungoverned vs. governed AI deployment. Navy and gold color scheme, clean vector style.]

Federal agencies are deploying AI coding assistants at scale. Developers are writing more code, faster than ever — powered by large language models that have no inherent knowledge of your security controls, your accreditation requirements, or your internal standards.

**Without enforcement:**
- Every AI session starts with a blank slate. No policies. No guardrails.
- Developers prompt AI differently, producing inconsistent, non-compliant output.
- Security vulnerabilities get written — and shipped — before any human reviews them.
- Audit trails are thin. Accountability is unclear.
- Token costs balloon as agents loop through unguided trial and error.

---

## The Solution

**Agent Enforcer** installs as a lightweight system service on developer workstations and CI/CD environments. It connects to your organization's central enforcement bucket, pulls your approved policy configuration, and applies it to every AI coding session — system-wide, without user action.

[IMAGE: Architecture flow diagram. Three columns connected by arrows: (1) "Policy Source" — a cloud/S3 icon labeled "Enforcement Bucket" with document icons (NIST controls, coding standards, security policies) feeding in from the left. (2) "Distribution Engine" — Lambda/AI icon labeled "Bedrock Config Generator" that converts policy docs into structured AI guidance. (3) "Enforcement Layer" — multiple workstation icons with the Agent Enforcer shield icon, labeled "Every Developer. Every Session." Arrow from (2) to (3) is labeled "Automatic. Continuous. 15-min sync." Clean vector, navy/gold.]

**Policies are defined once by your team or our specialists — then enforced everywhere, automatically.**

- ✅ Security requirements baked in before code is written
- ✅ Compliance controls active on every AI session
- ✅ Coding standards applied uniformly across all developers
- ✅ No developer action required — system-level enforcement
- ✅ Updates propagate to every endpoint within 15 minutes
- ✅ Works with existing Claude Code deployments — no rearchitecting

---

## Three Pillars of Value

---

### 1 — Security & Compliance Enforcement

[IMAGE: Shield icon with layered compliance framework badges inside it — NIST 800-53, CMMC, FedRAMP, STIG, organizational policy seal. Gold shield on navy background, clean vector badge aesthetic.]

AI agents do exactly what they're told. If they aren't told your security requirements, they'll write code that ignores them.

Agent Enforcer embeds your controls directly into the AI's operating context:

- **Parameterized queries only** — SQL injection vulnerabilities blocked at the source
- **Secrets via environment variables** — no hardcoded credentials, ever
- **Non-root container execution** — least-privilege Docker enforced by default
- **HTTPS-only endpoints** — enforced protocol standards
- **Approved library lists** — unapproved dependencies flagged before they appear
- **Custom policy documents** — CMMC, FedRAMP, internal STIGs, program-specific controls

*Accreditation bodies are beginning to ask: "How do you govern your AI?" Agent Enforcer is your answer.*

---

### 2 — Token Cost Reduction

[IMAGE: Bar chart — two bars side by side. Bar 1 "Unenforced AI" in light gray, tall. Bar 2 "With Agent Enforcer" in gold, shorter by 20-35%. Annotation arrow pointing to the difference labeled "20–35% Token Savings*". Below chart: small footnote asterisk text "Conservative estimate based on developer coding workload. Individual results vary." X-axis: nothing labeled. Y-axis: "Monthly Token Spend". Clean, minimal, professional chart style.]

AI agents without guidance iterate wastefully. They make assumptions, get corrected, retry, loop. Every back-and-forth exchange burns tokens.

Agent Enforcer eliminates the most expensive loops before they start by giving the AI the right context from the first prompt.

**Conservative example — $1M/month agency token spend:**

| Scenario | Developer Coding Share | Monthly Spend | Agent Enforcer Savings | Annual Savings |
|----------|----------------------|--------------|----------------------|----------------|
| Conservative | 40% ($400k) | $400k/mo | 20% | **~$960k/year** |
| Moderate | 40% ($400k) | $400k/mo | 30% | **~$1.44M/year** |
| Optimistic | 40% ($400k) | $400k/mo | 35% | **~$1.68M/year** |

*At the conservative estimate alone, many agencies recover platform cost in Year 1 — before accounting for security risk reduction or productivity gains.*

---

### 3 — Uniform Coding Standards

[IMAGE: Two code snippet panels side by side — visual diff style. Left panel "Without Enforcer" shows Python function with no docstring, magic numbers, no type hints, a raw f-string SQL query (highlighted red). Right panel "With Enforcer" shows same function with full docstring, named constants, type annotations, parameterized SQL (highlighted green). Title above: "Same Task. Same AI. Different Rules." Clean code font, dark background panels inset in a light card.]

Inconsistent code is expensive code. When 50 developers prompt the same AI differently, you get 50 different patterns, 50 different security postures, and exponentially more review burden.

Agent Enforcer standardizes output across your entire development organization:

- Mandatory docstrings and documentation standards
- Type hints and annotation requirements
- Named constants — no magic numbers
- Approved architectural patterns per project type
- Style guide compliance before code is committed

**Demonstrated result:** In controlled testing, enforced AI sessions produced code with zero critical security vulnerabilities versus two critical vulnerabilities in unenforced sessions — running the same AI model, given the same task.

---

<!-- PAGE 2 -->

[IMAGE: Thin horizontal gold rule divider line — full page width, decorative section break.]

---

## How It Works in 4 Steps

[IMAGE: Horizontal 4-step process graphic. Step icons in numbered gold circles connected by a horizontal line: (1) document/upload icon — "Define Policy" — "Your team or Alchemist specialists author enforcement documents in plain English: security requirements, compliance controls, coding standards." (2) cloud/AI icon — "Generate Configuration" — "Bedrock-powered engine converts policy docs into structured AI guidance — CLAUDE.md, settings, skills, commands." (3) sync/download icon — "Distribute Automatically" — "Agents on every developer machine sync enforcement config every 15 minutes. No developer action required." (4) shield/checkmark icon — "Enforce at Session Start" — "Every AI coding session starts with your policies already active. Compliant by default." Clean horizontal flow, navy circles with gold numbers, white text.]

---

## Deployment Profile

| Attribute | Detail |
|-----------|--------|
| **Platform** | Rocky Linux / RHEL 9 (RPM package) |
| **Agent size** | < 1 MB installed |
| **Network requirement** | Outbound HTTPS to S3 endpoint only |
| **Air-gap compatible** | Yes — S3-compatible endpoint configurable |
| **Enforcement latency** | Policy updates apply within 15 minutes |
| **User action required** | None after initial install |
| **Credentials required** | IAM role or instance profile — no user secrets |
| **Audit trail** | Sync logs, policy version history in S3 |
| **Management console** | AWS-native (S3 + CloudWatch) |

---

## Licensing & Investment

[IMAGE: Three pricing tier cards side by side — card style with gold top border. Card 1 "Division" — up to 250 seats — $750k/year. Card 2 "Agency" (highlighted, slightly larger, gold border all around, "Most Common" badge) — up to 1,000 seats — $2M/year. Card 3 "Enterprise" — up to 5,000 seats — $4M/year. Below all three cards, a separate "add-on" band labeled "Managed Enforcement Specialist — $1.25M/year" with a specialist/person icon. Clean card design, navy/white/gold.]

| Tier | Seats | Annual Investment |
|------|-------|-------------------|
| Division | Up to 250 | $750,000 |
| Agency | Up to 1,000 | $2,000,000 |
| Enterprise | Up to 5,000 | $4,000,000 |
| Unlimited | Unlimited | $7,500,000 |

**Managed Enforcement Specialist** *(add-on)*: $1,250,000/year
An embedded Alchemist specialist who owns your enforcement posture end-to-end — learning your security architecture, compliance frameworks, network topology, and program requirements, then authoring and maintaining enforcement documentation on your behalf. The specialist ensures your AI agents stay current as requirements evolve.

**Founding Partner Rate** — first agency engagement: Contact for details.

---

## Why Alchemist

Alchemist was founded on a single conviction: the value of AI in government is determined not by what the AI *can* do, but by what it's *allowed* to do — and who controls that boundary.

Agent Enforcer puts that control where it belongs: with your security and compliance teams, operating at the system level, before code is written.

We work with agencies to understand their specific requirements — their accreditation frameworks, their internal policies, their existing tooling — and translate that into enforcement documentation that makes every AI coding session compliant by default.

---

[IMAGE: Footer bar — full width navy background. Left: Alchemist horizontal logo in white. Center: "agent-enforcer.alchemist.ai" in light gray. Right: "Classified handling note: This document is UNCLASSIFIED // FOR OFFICIAL USE — VENDOR PROPRIETARY" in small gold text. Clean professional footer.]

---

*© 2026 Alchemist. All rights reserved. Agent Enforcer is a trademark of Alchemist. Results based on controlled testing; individual savings vary by workload composition and enforcement policy depth.*
