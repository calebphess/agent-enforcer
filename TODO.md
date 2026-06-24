# TODO

## 4. CI/CD — Automated Version Bumping and Testing

**Status**: Workflows created at `.github/workflows/test.yml` and `.github/workflows/version-bump.yml`

### What's wired up
- `test.yml` — runs on every PR and push to main:
  - Lambda unit tests (`pytest tests/lambda/test_license.py`)
  - Agent bash tests (`bash tests/agent/test_agent.sh`)
  - CDK synth validation
  - Integration tests (manual trigger only via `workflow_dispatch` with `run_integration: true`)
- `version-bump.yml` — runs on every push to main:
  - Auto-bumps patch version in `VERSION`, spec, and agent script
  - Commits back with `[skip ci]` prefix
  - Use `[minor]` or `[major]` in commit message to bump those segments instead

### Remaining for full CI/CD
- **RPM build in CI**: the RPM currently requires an EC2 runner (`rpmbuild`, `systemd-rpm-macros`). Add a separate `build-rpm.yml` workflow that uses a Rocky Linux runner or Docker container to build the RPM on tag push or manual trigger
- **Automated deploy**: add `deploy.yml` for `npx cdk deploy:enforcer` after tests pass on main (requires AWS credentials in GitHub secrets)
- **Integration test environment**: currently integration tests (`tests/integration/`) don't exist yet — needs deployed stack and real API endpoint. Create stub at `tests/integration/test_integration.sh`
- **GitHub secrets needed**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` for deploy + integration test workflows

## 1. Rename demo instance outputs to match logical names

Current S3 keys (`instance1/`, `instance2/`) don't communicate intent. Rename to match the actual CDK logical IDs (`ControlInstance`, `EnforcedInstance`) or use clearer keys like `default/` and `enforced/`. Update the analysis Lambda, UserData upload paths, and `results.md` references consistently.

## 2. Dynamic user discovery on polling interval

The agent currently syncs to a hardcoded set of paths (`/home/*/`) at install time. Instead, on each poll cycle it should:

- Scan `/home/*/` and `/etc/passwd` for users with a login shell
- Check if each user has Claude Code installed (e.g. `~/.npm/bin/claude`, `~/.local/bin/claude`, `/usr/local/bin/claude`, or any `claude` binary on their `$PATH` via `getent passwd | xargs -I{} su {} -c "which claude"`)
- Only write `.claude/` config to users where Claude Code is actually present
- Re-check on every poll so a user who installs Claude Code after the agent is already running gets picked up automatically without any manual reconfigure

This makes the agent truly zero-touch: install once, and enforcement follows users as they adopt Claude Code.

## 3. Actual enforcement — making configs tamper-resistant

Options to explore, roughly in order of invasiveness:

**a) File immutability (`chattr +i`)** — set the immutable bit on `~/.claude/CLAUDE.md` and `settings.json` after each sync. The file owner cannot edit or delete it without root. Downside: Claude Code itself may need to write to `.claude/` at runtime (e.g. session state, `todos/`) — need to verify which files are safe to lock vs. which ones Claude Code writes to.

**b) Read-only bind mount** — mount the managed `.claude/` directory over the user's home with `MS_RDONLY`. More surgical than immutability; survives reboots if wired into systemd. Harder to implement portably.

**c) `managed-settings.json` system path** — Claude Code already respects `/etc/claude-code/managed-settings.json` as a system-level override that users cannot change (it's root-owned). This is the right place for policy settings (`allowedTools`, `disabledCommands`, etc.). `CLAUDE.md` enforcement is the harder problem since it lives in user space.

**d) Periodic re-sync (current approach) + drift detection** — instead of hard locking, re-apply on every poll and log/alert when the managed files differ from what was written. Practical and low-risk, but a determined user can always edit between poll cycles.

**Recommended path**: use `managed-settings.json` for hard policy (settings), `chattr +i` for `CLAUDE.md` (test whether Claude Code reads but never writes it), and periodic re-sync as a fallback. Need to verify `chattr` behavior with Claude Code running.
