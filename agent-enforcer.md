# Alchemist — Agent Enforcer (Working Name) | “Stop the Slop” Product Overview

<aside>
🛡️

**Tagline:** Stop the slop

**Working name:** Alchemist — Agent Enforcer

**One-liner:** Enterprise enforcement layer that standardizes and continuously enforces AI/agent rules, skills, and secure-by-default patterns across developer tools and local environments.

</aside>

## Product overview

Alchemist — Agent Enforcer is a controls-and-distribution platform for enterprise AI usage. It turns organizational AI standards (approved prompts, secure patterns, coding conventions, tool configs, and guardrails) into enforceable configurations that are continuously applied across local AI-enabled tools.

**Core idea:** Instead of hoping people follow best practices, ship the best practices to every workstation and keep them in compliance.

### Problems it solves

- **Inconsistent outputs** across teams/tools (prompt drift, style drift, architecture drift)
- **Security violations** from “wild west” AI usage (e.g., unsafe cloud defaults)
- **Unmanageable configuration sprawl** across multiple AI tools (Cursor/Claude/Kiro/etc.)
- **No auditability** of what rules were in effect at a given time

### What it delivers

- A single, authoritative **master rules/skills source**
- Tool-specific **generated config artifacts** (optimized per tool)
- A **local enforcement agent** that installs/updates configs on endpoints/servers
- Optional **user preferences** that stay within policy while enabling personalization

## Demo overview (TalkTrack)

### Part 1 — “Unmanaged AI” (the slop)

Show Cursor/Claude/Kiro generating code without shared standards:

- Non-standard patterns and inconsistent repo usage
- Risky cloud choices (e.g., public S3 buckets)
- Missing guardrails and no shared organizational constraints

### Part 2 — “Enforced AI” (Agent Enforcer active)

Turn on the enforcement agent and rerun the same scenario:

- Tools automatically align to standards (secure defaults, approved patterns)
- Private-by-default cloud patterns (e.g., private workloads/containers)
- Approved repo and language/tooling constraints (e.g., sanctioned Python repos)
- (Optional) auto-generation of work items (e.g., Jira/Linear tickets) as part of the standardized workflow

## Technical architecture

### High-level components

1. **Master standards document**
    - Canonical definition of global rules + skills
    - Versioned source of truth
2. **Central parsing & generation system (“bots”)**
    - Parses master standards
    - Generates tool-specific configuration bundles (Cursor, Claude, Kiro, etc.)
    - Publishes bundles to an artifact store (e.g., S3)
3. **Artifact store (e.g., S3)**
    - Hosts generated config bundles
    - Enables low-cost distribution and rollback via versioning
4. **Local pulling/enforcement agent (Rocky Linux / RHEL)**
    - Runs on customer-managed infrastructure
    - Periodically pulls latest approved bundles
    - Installs to the correct local directories for each tool
    - Performs diff checks and remediation

### Enforcement model

- **Strict mode:** local modifications are overwritten to maintain compliance
- **Preferences mode:** allow scoped user customization via a dedicated preferences file (e.g., `stop-the-slop-user-preferences.md`) that is merged within policy boundaries

### Deployment & environment assumptions

- Designed to operate in **high-security / top-secret cloud environments**
- Intended distribution path: **IC Marketplace (ICMP)**
- Compute costs largely borne by the customer (local agent execution)

### Stretch capability

- **MCP support** (Model Context Protocol) to standardize integrations across agents/tools

## Potential employees (initial staffing)

### Product management candidates

- Jared Strickland
- Eric Washabaugh’s wife

### Lead engineer candidates

- Brandon Gonzalez (part-time remote noted)

### Additional engineering candidates

- Tanya Brodsky
- Jacob Fredericks
- Adam Neumiller
- Tom Walshaw
- Dan Ioppolo

## Potential promoters & potential targets

### Primary target customer

- **Office of AI (OAI)** — to enforce systematic standards globally across the agency

### Key contacts / advocates

- Lakshmi Raman (Director, OAI)
- Chris Bennight (Tech Director, OAI)
- FidOS team (standard operating system owners)
- CLOUDWorks (enterprise engineering standards)
- Eric Washabaugh (advocate; Claude)
- Will Panabianco (advocate; AWS)

## Pricing

### Founder's License (initial enterprise tier)

- **$1,000,000 / year** flat rate for first customer

### Dedicated support tier (optional add-on)

- **$500,000 / year** for dedicated specialist to design/manage org-specific rules
- May scale up to **$3,000,000 / year** for very large orgs depending on staffing needs

### Cost model note

Operational costs are expected to be low because the vendor hosts primarily the config-generation system and artifacts, while customers run the local enforcement agents on their own infrastructure.