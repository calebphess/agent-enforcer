# Enterprise AI Coding Standards v1.0 — Default Policy

> This is the default enforcement document shipped with Agent Enforcer.
> Replace this file in the enforcement-source S3 bucket with your organization's standards.

## 1. Coding Standards

### 1.1 Documentation
- ALL functions and classes MUST have docstrings describing parameters, return values, and side effects
- Module-level docstrings required for all Python files

### 1.2 Code Style
- PEP 8 compliance for Python; language-appropriate style guides for other languages
- No magic numbers — define as named constants at module level
- Maximum function length: 40 lines (excluding docstring)
- Type hints required on all function signatures
- Descriptive variable names (no single-letter vars except conventional loop counters)

### 1.3 Structure
- Separate concerns: database logic separate from request handling
- No business logic in route/controller handlers — delegate to service functions
- Constants defined at module level, not inline

## 2. Security Requirements

### 2.1 Database Security
- ALWAYS use parameterized queries — NEVER use string formatting or f-strings in SQL
- SQLite: use `?` placeholders — `cursor.execute("SELECT * FROM t WHERE id=?", (id,))`
- Validate ALL user input before database operations

### 2.2 Secrets Management
- NEVER hardcode credentials, API keys, passwords, or tokens in source code
- All secrets must come from environment variables
- Never commit secrets or config files containing secrets to version control

### 2.3 Container Security
- Docker containers MUST run as a non-root user (add `USER appuser` directive)
- Pin base image versions explicitly (e.g., `python:3.12-slim` not `python:latest`)
- Do not expose unnecessary ports

### 2.4 API Security
- Validate Content-Type and input on all mutating endpoints
- Return sanitized error messages — never expose stack traces to clients
- Use appropriate HTTP status codes

### 2.5 Configuration
- NEVER run services with debug mode enabled in container/production configs
- Use environment variables for all runtime configuration

## 3. Token Efficiency Guidelines

### 3.1 Plan Before Coding
- Before writing any code, use TodoWrite to create a complete implementation plan listing every file
- Review the full spec before beginning — do not start writing until the plan is complete

### 3.2 Write Complete Code on First Attempt
- Write complete, working, production-ready code immediately
- No placeholder comments, TODOs, or stub implementations
- All error handling must be implemented, not noted as future work

### 3.3 Context Efficiency
- Do not re-read files you just wrote
- Make all changes to a file in a single write operation
- Do not re-read the specification after the planning phase unless resolving a specific ambiguity
