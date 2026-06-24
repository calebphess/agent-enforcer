# Intellectual Property Brief — Agent Enforcer / Alchemist
*Prepared for legal counsel. This document summarizes the protectable intellectual property assets of Alchemist's Agent Enforcer product for the purpose of initiating patent, trademark, trade secret, and copyright protections. It is intended as a briefing document — not a legal filing — and should be reviewed and acted upon by qualified IP counsel.*

---

## Company & Product Overview

**Company:** Alchemist
**Product:** Agent Enforcer
**Founder / CEO:** Penn Hess
**Core function:** An enterprise AI policy enforcement layer that continuously distributes, applies, and enforces organizational security policies, compliance controls, and coding standards on AI coding agents at the system level — automatically, before AI-generated code is produced.

---

## 1. Patent Candidates

The following describe novel, non-obvious methods, systems, and architectures that may qualify for utility patent protection. Counsel should evaluate each for patentability under 35 U.S.C. §§ 101, 102, and 103 and advise on priority filing strategy (provisional vs. full utility).

**Recommended immediate action: File provisional patent applications on all candidates to establish priority date. Provisionals are low-cost, give 12 months of "patent pending" status, and preserve the right to file full utility applications later.**

---

### Patent Candidate 1 — System and Method for Automated AI Agent Policy Enforcement via Continuous Configuration Distribution

**What it is:**
A system architecture in which a central policy authority (S3-compatible object store) distributes structured AI agent configuration files to endpoint agents on a polling interval, which then apply those configurations to AI coding sessions at the operating system level — without user intervention.

**Novel elements:**
- The use of a polling-based daemon service to enforce AI agent behavior at the system level (as opposed to application-level or user-level configuration)
- Automatic application of policy to any AI coding session initiated by any user on the host, regardless of which user account initiates the session
- Version-controlled policy distribution enabling auditability of which policy was active at time of any given AI session

**Distinguishing from prior art:**
Prior art in AI configuration (e.g., `.env` files, application config) is user-managed and session-specific. This system enforces policy at the OS service level independent of user action, across all users on a host, with automatic propagation of updates from a central authority.

---

### Patent Candidate 2 — Method for Generating Structured AI Agent Enforcement Configuration from Natural Language Policy Documents Using Large Language Models

**What it is:**
A method in which natural language organizational policy documents (security requirements, compliance controls, coding standards) are ingested by a language model and transformed into structured AI agent configuration artifacts (CLAUDE.md, settings.json, skills, commands) that are then distributed to enforcement agents.

**Novel elements:**
- The specific pipeline: natural language policy document → LLM transformation → structured AI agent configuration bundle → automatic distribution to enforcement endpoints
- The schema of the output bundle (CLAUDE.md + settings.json + skills/ + commands/) as a defined artifact format for AI agent governance
- The triggering mechanism: any upload to the policy source triggers re-ingestion of all policy documents and regeneration of the complete bundle (not just the changed document)

**Distinguishing from prior art:**
Existing LLM configuration is either hand-authored or application-specific. The novel element is the automated pipeline from organizational policy documents through LLM transformation to a distributed, system-enforced configuration bundle at scale.

---

### Patent Candidate 3 — System for Dynamic User Discovery and Selective AI Configuration Propagation Based on Installed AI Tooling

**What it is:**
A method by which the enforcement agent, on each polling cycle, dynamically discovers which users on a host have AI coding tools installed (by scanning home directories, PATH entries, and common install locations), and selectively applies enforcement configuration only to those users — without requiring manual registration of users or tools.

**Novel elements:**
- Dynamic discovery of AI tool installations across user accounts on a shared host
- Selective, targeted configuration propagation based on discovered tool presence rather than static user lists
- Self-updating: as new users install AI tools, they are automatically brought under enforcement on the next polling cycle without administrator action

**Distinguishing from prior art:**
Enterprise software management tools (SCCM, Ansible, Chef) deploy configuration statically to known targets. This system discovers targets dynamically based on the presence of specific AI tooling, which is a novel trigger mechanism for configuration deployment.

---

### Patent Candidate 4 — Method for Tamper-Resistant AI Agent Policy Enforcement Using File System Immutability and System-Managed Configuration Paths

**What it is:**
*(Forward-looking — development in progress per TODO.md)* A method combining OS-level file immutability (chattr +i or equivalent), system-managed configuration paths (/etc/claude-code/managed-settings.json), and periodic re-enforcement to create a tamper-resistant AI agent policy layer that end users cannot override without elevated privilege.

**Novel elements:**
- The specific combination of file immutability, system path management, and periodic re-sync as a layered enforcement approach for AI agent policy
- The use of the AI tool vendor's own system-managed configuration path as the primary enforcement vector, combined with immutability on user-space configuration files
- Drift detection: comparing current configuration against the authoritative policy and alerting/re-applying when divergence is detected

**Distinguishing from prior art:**
File immutability is a known OS feature. Its application to AI agent policy enforcement in an enterprise context — specifically to prevent user modification of AI behavioral guardrails — is a novel application.

---

## 2. Trademark Candidates

The following marks should be evaluated for registration with the USPTO (and internationally under Madrid Protocol where relevant).

**Recommended immediate action: File intent-to-use trademark applications now, before any public launch or press coverage. Priority date is the filing date, not the date of first use.**

| Mark | Type | Class(es) | Notes |
|------|------|-----------|-------|
| **ALCHEMIST** | Word mark | IC 42 (Software as a Service, technology consulting) | Check for conflicts in IC 42 — "Alchemist" may have existing marks in other classes but the SaaS space should be evaluated carefully. |
| **AGENT ENFORCER** | Word mark | IC 42 | Descriptive marks face higher scrutiny — counsel should assess registrability and consider whether acquired distinctiveness argument is available or if a design mark is stronger. |
| **STOP THE SLOP** | Word mark / Slogan | IC 42 | Slogans are registrable if distinctive. This one is specific enough to be defensible. Good candidate. |
| **ALCHEMIST + logo** | Design + word mark | IC 42 | File the composite mark (horizontal logo with name) as a design mark in addition to the word mark. |
| **AGENT ENFORCER + icon** | Design + word mark | IC 42 | File the square icon + "Agent Enforcer" as a composite design mark. |

---

## 3. Trade Secrets

The following constitute protectable trade secrets under the Defend Trade Secrets Act (DTSA, 18 U.S.C. § 1836) and applicable state law, provided reasonable measures are taken to maintain their secrecy. Counsel should advise on trade secret policies, NDAs, and employment agreements.

**What makes something a trade secret:** It derives economic value from not being generally known, and reasonable steps are taken to keep it secret.

| Asset | Why It Qualifies | Protection Steps Needed |
|-------|-----------------|------------------------|
| The specific LLM prompt engineering used by the config-generator Lambda to transform policy documents into enforcement bundles | Derives value from not being public; competitors cannot easily replicate without knowing the prompt structure | Mark as confidential; limit access; NDA for anyone who sees it |
| The schema and structure of the enforcement bundle (CLAUDE.md + settings.json + skills/ + commands/) as a complete artifact format | Represents significant R&D investment in what an AI governance artifact should contain | Document as proprietary; include in IP assignment agreements with employees/contractors |
| The enforcement document templates authored for customers by Managed Enforcement Specialists | Customer-specific but the templates themselves represent proprietary methodology | Employment and contractor agreements must assign ownership; NDA with customers covering co-developed materials |
| The methodology for translating organizational compliance frameworks (NIST, CMMC, FedRAMP) into AI enforcement documentation | Expertise-based, high value, not obvious to competitors | Treat as proprietary methodology; document in internal playbooks marked confidential |
| Customer policy documents stored in their enforcement buckets (if Alchemist ever hosts them) | Highly sensitive customer data; also protects Alchemist's methodology embedded in them | Data processing agreements; access controls; never reference customer policy in public materials |

---

## 4. Copyright

The following works are automatically protected by copyright upon creation (17 U.S.C. § 102) but registration with the U.S. Copyright Office strengthens enforcement rights, enables statutory damages, and is required before filing an infringement suit.

**Recommended action: Register all software and documentation with the Copyright Office. It is inexpensive and establishes a public record.**

| Work | Type | Notes |
|------|------|-------|
| Agent Enforcer source code (all files in the repository) | Literary work (software) | Register as a single deposit; update registrations with major releases |
| `agent-enforcer` bash script (the enforcement daemon) | Literary work (software) | Core IP — high priority |
| Lambda function source code (config-generator, analysis, self-destruct) | Literary work (software) | Register together with the main codebase |
| CDK stack definitions (TypeScript) | Literary work (software) | Infrastructure-as-code is copyrightable |
| RPM spec file and packaging scripts | Literary work (software) | |
| slicksheet.md / offer-letter.md marketing documents | Literary work | Register once finalized |
| Enforcement document templates created for customers | Literary work | Establish that Alchemist (not the customer) owns the template; customer owns their data |

---

## 5. Key Agreements Needed

Before engaging customers, employees, or contractors, the following agreements should be in place. Counsel should draft or review each.

| Agreement | Purpose | Priority |
|-----------|---------|----------|
| **Employee IP Assignment Agreement** | Ensures all IP created by employees belongs to Alchemist, not the individual. Standard "work for hire" clause plus explicit assignment. | Immediate — before any employee is hired |
| **Contractor / Consultant IP Assignment Agreement** | Same as above for contractors. Copyright in contractor work does not automatically belong to the hiring party — explicit assignment is required. | Immediate — before any contractor engagement |
| **Non-Disclosure Agreement (NDA)** | Protects trade secrets shared during sales conversations, customer discovery, and partnership discussions. Mutual preferred for early stage. | Immediate — before any customer briefing |
| **Customer License Agreement (CLA) / SaaS Agreement** | Defines what the customer is licensed to do with Agent Enforcer, limits reverse engineering, establishes data ownership, limits liability. | Before first contract is signed |
| **Managed Enforcement Specialist Services Agreement** | Defines ownership of enforcement documents created during the specialist engagement (Alchemist owns templates; customer owns their policy data). | Before specialist engagement begins |

---

## 6. Open Source Considerations

Agent Enforcer uses and depends on open source software. Before commercializing, counsel should review the license obligations of all dependencies.

**Key dependencies to review:**

| Dependency | License | Risk |
|------------|---------|------|
| AWS CDK (`aws-cdk-lib`) | Apache 2.0 | Low — permissive, no copyleft |
| `constructs` | Apache 2.0 | Low |
| `boto3` / AWS SDK (Python) | Apache 2.0 | Low |
| Node.js runtime | MIT | Low |
| Rocky Linux (distribution) | Various (GPL, MIT, Apache) | Medium — GPL components in the OS do not affect application code, but counsel should confirm |
| Any npm packages used | Varies | Review all transitive dependencies |

**Copyleft risk:** If any dependency carries a GPL or AGPL license and is linked with (not just run alongside) Agent Enforcer's code, it may require open-sourcing Agent Enforcer's code. This is unlikely given the current dependency set but must be confirmed by counsel.

**Recommendation:** Run a Software Composition Analysis (SCA) scan (e.g., FOSSA, Snyk, Black Duck) on the full dependency tree before any commercial deployment. This is also increasingly required by government customers and FedRAMP.

---

## 7. Competitive Moat Summary

For counsel's awareness: the following elements represent the most defensible aspects of Agent Enforcer's IP position and should be prioritized for protection.

1. **The system-level enforcement architecture** — hardest to replicate, most novel, strongest patent candidate
2. **The LLM-to-enforcement-bundle pipeline** — the specific method of converting policy documents to AI configuration via LLM is non-obvious and valuable
3. **The "STOP THE SLOP" brand** — memorable, defensible, and will acquire distinctiveness quickly with use
4. **The Managed Enforcement Specialist methodology** — trade secret; the playbook for translating government compliance requirements into AI policy is expertise-dense and hard to replicate without experience
5. **First-mover in government AI governance** — timing matters; filing patents and trademarks now, before competitors identify this space, establishes priority that cannot be recovered later

---

## 8. Immediate Action Checklist for Counsel

- [ ] File provisional patent applications on Candidates 1, 2, and 3 (Candidate 4 when implementation is complete)
- [ ] Conduct trademark clearance searches for ALCHEMIST, AGENT ENFORCER, and STOP THE SLOP in IC 42
- [ ] File intent-to-use trademark applications for all cleared marks
- [ ] Register copyright for current codebase with U.S. Copyright Office
- [ ] Draft and execute employee IP assignment agreements
- [ ] Draft NDA template for use in customer and partner discussions
- [ ] Draft Customer License Agreement / SaaS Terms
- [ ] Conduct open source license review / SCA scan
- [ ] Advise on trade secret protection policies and employee confidentiality obligations
- [ ] Advise on government contractor IP considerations (FAR 52.227 clauses) — government customers will attempt to claim license rights to IP developed under their contracts; this must be negotiated carefully

---

*This document was prepared by Penn Hess, CEO, Alchemist. It is attorney-client privileged when transmitted to legal counsel for the purpose of obtaining legal advice. Do not distribute outside of Alchemist and its legal counsel.*
