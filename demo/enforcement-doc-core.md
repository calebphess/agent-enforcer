# Enterprise AI Coding Standards v1.0 — Demo Enforcement Policy

> This document is uploaded to the enforcement-source S3 bucket to demonstrate Agent Enforcer.
> The config-generator Lambda converts it into a .claude/CLAUDE.md that is distributed to
> all enrolled endpoints via the enforcement-dist bucket.

## 1. Coding Standards

### 1.1 Documentation (MANDATORY)
- Every function and class MUST have a docstring
- Docstrings must describe: what the function does, its parameters, and its return value
- Module-level docstrings required for all Python source files

### 1.2 Code Style
- Strict PEP 8 compliance — enforce with `flake8` before committing
- No magic numbers — all numeric constants must be named (e.g., `MAX_TITLE_LENGTH = 200`)
- Type hints on all function signatures: `def get_task(task_id: int) -> dict:`
- Maximum function length: 40 lines excluding docstring
- Descriptive variable names — abbreviations only if universally understood

### 1.3 Architecture
- Separate database logic from request handling: `database.py` for queries, `app.py` for routing
- Route handlers delegate to database functions — no raw SQL in `app.py`
- One responsibility per function

## 2. Security Requirements (NON-NEGOTIABLE)

### 2.1 SQL Injection Prevention
- ALWAYS use parameterized queries — this is non-negotiable
- SQLite parameterized syntax: `cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))`
- NEVER use f-strings, `.format()`, or `%` substitution to build SQL queries
- All user input must be treated as untrusted until validated

### 2.2 Secrets and Credentials
- NEVER hardcode passwords, API keys, tokens, or credentials in source code
- All secrets via environment variables: `os.environ.get('SECRET_KEY')`
- Include `.env.example` showing required env vars without actual values
- Never commit `.env` files — add to `.gitignore`

### 2.3 Container Security
- Dockerfile MUST run as a non-root user:
  ```dockerfile
  RUN adduser --disabled-password --gecos '' appuser
  USER appuser
  ```
- Use a pinned, specific base image tag: `python:3.12-slim` not `python:latest`
- Do not use `--privileged` or expose unnecessary ports

### 2.4 API Hardening
- Validate `Content-Type: application/json` on POST and PUT requests
- Return sanitized error messages — never expose Python tracebacks to the client
- Validate and sanitize all input before database operations

### 2.5 Flask Configuration
- NEVER set `debug=True` in Dockerfile CMD, shell scripts, or environment configs
- Use `app.run(host='0.0.0.0', port=5000)` only — no debug flag

## 3. Token Efficiency Protocol

These rules reduce iteration cost and improve first-pass quality:

### 3.1 Plan-First Execution
1. Read the full specification once
2. Use `TodoWrite` to create a complete plan listing every file, its purpose, and key functions before writing a single line of code
3. Do not deviate from the plan without reason

### 3.2 Write Complete Code
- Implement complete, working code on the first attempt
- No stub functions, placeholder comments, or `# TODO` items
- All error handling must be implemented — not described as future work

### 3.3 Minimize Re-reads
- Do not re-read a file you just wrote (you wrote it — it's in context)
- Make all changes to a file in a single `Write` operation
- Do not re-read the spec after the planning phase

### 3.4 Verify Once
- After writing all files, do a single verification pass (read each file once)
- Fix any issues found in that pass in a single subsequent write
- Do not loop more than once through verification
