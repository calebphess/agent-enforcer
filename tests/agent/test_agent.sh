#!/bin/bash
# Agent Enforcer — bash unit tests
#
# Tests cover argument parsing, file operations, and error handling.
# A mock curl binary is injected via PATH to simulate API responses.
#
# Run: bash tests/agent/test_agent.sh
# Must be run as non-root (test 1 verifies root check).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT_SCRIPT="${REPO_ROOT}/rpm/SOURCES/agent-enforcer"
PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------

_pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
_fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

assert_exit_nonzero() {
  local label="$1"; shift
  if "$@" 2>/dev/null; then
    _fail "$label (expected non-zero exit)"
  else
    _pass "$label"
  fi
}

assert_exit_zero() {
  local label="$1"; shift
  if "$@" 2>/dev/null; then
    _pass "$label"
  else
    _fail "$label (expected zero exit)"
  fi
}

assert_contains() {
  local label="$1" pattern="$2" actual="$3"
  if echo "$actual" | grep -qiE "$pattern"; then
    _pass "$label"
  else
    _fail "$label (expected pattern '$pattern' in: $(echo "$actual" | head -3))"
  fi
}

assert_file_exists() {
  local label="$1" path="$2"
  if [[ -f "$path" ]]; then _pass "$label"; else _fail "$label (file missing: $path)"; fi
}

assert_file_perm() {
  local label="$1" path="$2" expected_perm="$3"
  local actual_perm
  # Linux: stat -c "%a" | macOS: stat -f "%OLp"
  actual_perm=$(stat -c "%a" "$path" 2>/dev/null || stat -f "%OLp" "$path" 2>/dev/null || echo "unknown")
  if [[ "$actual_perm" == "$expected_perm" ]]; then
    _pass "$label"
  else
    _fail "$label (expected perm $expected_perm, got $actual_perm)"
  fi
}

# ---------------------------------------------------------------------------
# Isolated temp environment
# ---------------------------------------------------------------------------

TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

MOCK_BIN="${TMPDIR_TEST}/bin"
FAKE_ETC="${TMPDIR_TEST}/etc/agent-enforcer"
FAKE_VAR="${TMPDIR_TEST}/var/lib/agent-enforcer"

mkdir -p "$MOCK_BIN" "$FAKE_ETC" "$FAKE_VAR"

# Create a patched agent that:
#  - overrides file paths to our temp dirs
#  - skips the EUID root check
#  - reads machine-id from a temp file
PATCHED="${TMPDIR_TEST}/agent-patched"
sed \
  -e 's|readonly CONFIG_FILE=.*|CONFIG_FILE="'"${FAKE_ETC}/config"'"|' \
  -e 's|readonly LICENSE_FILE=.*|LICENSE_FILE="'"${FAKE_VAR}/license"'"|' \
  -e 's|readonly STATE_DIR=.*|STATE_DIR="'"${FAKE_VAR}"'"|' \
  -e 's|if \[\[ \$EUID -ne 0 \]\]; then|if false; then|g' \
  -e 's|machine_id=\$(cat /etc/machine-id.*|machine_id="testmachineid12345678901234"|' \
  -e 's|chown root:root.*||g' \
  "$AGENT_SCRIPT" > "$PATCHED"
chmod +x "$PATCHED"

# Mock systemctl — always succeeds, never touches real services
cat > "${MOCK_BIN}/systemctl" <<'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "${MOCK_BIN}/systemctl"

# ---------------------------------------------------------------------------
# Mock curl helpers
# ---------------------------------------------------------------------------

install_mock_curl() {
  local http_code="$1" response_body="$2"
  # Write response_body to a temp file to avoid quoting issues
  local resp_file="${TMPDIR_TEST}/mock-response.json"
  echo "$response_body" > "$resp_file"
  cat > "${MOCK_BIN}/curl" <<EOF
#!/bin/bash
OUTPUT_FILE=""
WRITE_OUT=""
args=("\$@")
i=0
while [[ \$i -lt \${#args[@]} ]]; do
  case "\${args[\$i]}" in
    -o)  OUTPUT_FILE="\${args[\$((i+1))]}"; i=\$((i+2)) ;;
    -w)  WRITE_OUT="\${args[\$((i+1))]}"; i=\$((i+2)) ;;
    *)   i=\$((i+1)) ;;
  esac
done
if [[ -n "\$OUTPUT_FILE" ]]; then
  cp "${resp_file}" "\$OUTPUT_FILE"
fi
if [[ "\$WRITE_OUT" == "%{http_code}" ]]; then
  printf '${http_code}'
fi
EOF
  chmod +x "${MOCK_BIN}/curl"
}

install_failing_curl() {
  cat > "${MOCK_BIN}/curl" <<'EOF'
#!/bin/bash
exit 1
EOF
  chmod +x "${MOCK_BIN}/curl"
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

echo ""
echo "=== Agent Enforcer bash tests ==="
echo ""

# -------------------------------------------------------------------
echo "Test 1: register requires root"
OUT=$(bash "$AGENT_SCRIPT" register --no-prompt --user-id test@example.com 2>&1 || true)
assert_contains "register rejects non-root with error message" "requires sudo" "$OUT"
assert_exit_nonzero "register exits non-zero when not root" \
  bash "$AGENT_SCRIPT" register --no-prompt --user-id test@example.com

# -------------------------------------------------------------------
echo "Test 2: --no-prompt requires --user-id"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" register --no-prompt 2>&1 || true)
assert_contains "--no-prompt without --user-id shows error" "user-id is required" "$OUT"
assert_exit_nonzero "--no-prompt without --user-id exits non-zero" \
  env PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" register --no-prompt

# -------------------------------------------------------------------
echo "Test 3: register writes license file with correct permissions"
install_mock_curl 200 '{"license_id":"test-uuid-abcd-1234","user_id":"test@example.com","message":"License registered successfully."}'
rm -f "${FAKE_VAR}/license" "${FAKE_ETC}/config"

PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" register --no-prompt \
  --user-id test@example.com \
  --endpoint https://test.example.com/agent-enforcer 2>/dev/null

assert_file_exists "license file created" "${FAKE_VAR}/license"
assert_file_perm "license file is mode 600" "${FAKE_VAR}/license" "600"

# -------------------------------------------------------------------
echo "Test 4: license file contains required fields"
LICENSE_CONTENT=$(cat "${FAKE_VAR}/license")
assert_contains "LICENSE_ID present" "LICENSE_ID=" "$LICENSE_CONTENT"
assert_contains "USER_ID present" "USER_ID=" "$LICENSE_CONTENT"
assert_contains "MACHINE_ID present" "MACHINE_ID=" "$LICENSE_CONTENT"
assert_contains "ENDPOINT present" "ENDPOINT=" "$LICENSE_CONTENT"
assert_contains "REGISTERED_AT present" "REGISTERED_AT=" "$LICENSE_CONTENT"

# -------------------------------------------------------------------
echo "Test 5: sync fails without registration"
rm -f "${FAKE_VAR}/license"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync 2>&1 || true)
assert_contains "sync without registration shows helpful message" "register" "$OUT"
assert_exit_nonzero "sync exits non-zero without registration" \
  env PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync

# -------------------------------------------------------------------
echo "Test 6: daemon logs not-registered message"
rm -f "${FAKE_VAR}/license" "${FAKE_VAR}/sync-errors.log"
# Run daemon in background, let it loop once, then kill it
PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" --daemon 2>/dev/null &
DAEMON_PID=$!
sleep 2
kill "$DAEMON_PID" 2>/dev/null || true
wait "$DAEMON_PID" 2>/dev/null || true
if [[ -f "${FAKE_VAR}/sync-errors.log" ]]; then
  LOG=$(cat "${FAKE_VAR}/sync-errors.log")
  assert_contains "daemon logs not-registered" "not registered" "$LOG"
else
  _fail "daemon logs not-registered (no sync-errors.log found)"
fi

# -------------------------------------------------------------------
echo "Test 7: sync API unreachable is a soft failure"
cat > "${FAKE_VAR}/license" <<EOF
LICENSE_ID=test-uuid-abcd-1234
USER_ID=test@example.com
MACHINE_ID=testmachineid12345678901234
ENDPOINT=https://test.example.com/agent-enforcer
REGISTERED_AT=2026-06-24T00:00:00Z
EOF
cat > "${FAKE_ETC}/config" <<EOF
ENDPOINT=https://test.example.com/agent-enforcer
CONFIGURED_AT=2026-06-24T00:00:00Z
EOF
install_failing_curl
rm -f "${FAKE_VAR}/sync-errors.log"

# do_sync logs the error and returns 0 — sync command wraps and exits non-zero with a message
# but the daemon would return 0 (soft). We test the log content.
PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync 2>/dev/null || true
LOG=$(cat "${FAKE_VAR}/sync-errors.log" 2>/dev/null || echo "")
assert_contains "API unreachable logged" "unreachable" "$LOG"

# -------------------------------------------------------------------
echo "Test 8: sync API 403 treated as license error"
install_mock_curl 403 '{"error":"License is inactive. Re-register to obtain a new license."}'
rm -f "${FAKE_VAR}/sync-errors.log"
PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync 2>/dev/null || true
LOG=$(cat "${FAKE_VAR}/sync-errors.log" 2>/dev/null || echo "")
assert_contains "403 logged as license invalid" "invalid|inactive|403" "$LOG"

# -------------------------------------------------------------------
echo "Test 9: configure --endpoint writes config file"
rm -f "${FAKE_ETC}/config"
PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" configure \
  --endpoint https://new.example.com/agent-enforcer 2>/dev/null
assert_file_exists "config file written by configure" "${FAKE_ETC}/config"
CONFIG=$(cat "${FAKE_ETC}/config")
assert_contains "config contains new endpoint" "https://new.example.com/agent-enforcer" "$CONFIG"

# -------------------------------------------------------------------
echo "Test 10: status shows config and license"
cat > "${FAKE_VAR}/license" <<EOF
LICENSE_ID=abc-123-def-456
USER_ID=status-test@example.com
MACHINE_ID=testmachineid12345678901234
ENDPOINT=https://test.example.com/agent-enforcer
REGISTERED_AT=2026-06-24T00:00:00Z
EOF
cat > "${FAKE_ETC}/config" <<EOF
ENDPOINT=https://test.example.com/agent-enforcer
CONFIGURED_AT=2026-06-24T00:00:00Z
EOF
STATUS=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" status 2>&1)
assert_contains "status shows endpoint" "test.example.com" "$STATUS"
assert_contains "status shows license id" "abc-123-def-456" "$STATUS"
assert_contains "status shows user id" "status-test@example.com" "$STATUS"
EXPECTED_VERSION=$(grep '^readonly AGENT_VERSION=' "$AGENT_SCRIPT" | cut -d'"' -f2)
assert_contains "status shows version" "$EXPECTED_VERSION" "$STATUS"

# -------------------------------------------------------------------
echo "Test 11: banner command prints branding"
OUT=$(bash "$PATCHED" banner 2>&1)
assert_exit_zero "banner exits zero" bash -c "bash '$PATCHED' banner >/dev/null"
assert_contains "banner shows Powered by Alchemist" "Powered by Alchemist" "$OUT"
assert_contains "banner shows version" "$EXPECTED_VERSION" "$OUT"
if echo "$OUT" | awk 'length > 80 { exit 1 }'; then
  _pass "banner lines fit 80 columns"
else
  _fail "banner lines fit 80 columns"
fi

# -------------------------------------------------------------------
echo "Test 12: describe shows enforcement summary"
cat > "${FAKE_VAR}/license" <<EOF
LICENSE_ID=abc-123-def-456
USER_ID=describe-test@example.com
MACHINE_ID=testmachineid12345678901234
ENDPOINT=https://test.example.com/agent-enforcer
REGISTERED_AT=2026-07-20T00:00:00Z
EOF
cat > "${FAKE_ETC}/config" <<EOF
ENDPOINT=https://test.example.com/agent-enforcer
CONFIGURED_AT=2026-07-20T00:00:00Z
EOF
printf 'claude-code=enabled\nkiro=disabled\n' > "${FAKE_VAR}/assistants"
echo "2026-07-20T00:00:00Z" > "${FAKE_VAR}/last-sync"

OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" describe 2>&1)
assert_contains "describe shows banner" "Powered by Alchemist" "$OUT"
assert_contains "describe shows version" "$EXPECTED_VERSION" "$OUT"
assert_contains "describe shows ENFORCING" "ENFORCING" "$OUT"
assert_contains "describe shows claude-code enabled" "claude-code.*enabled" "$OUT"
assert_contains "describe shows kiro disabled" "kiro.*disabled" "$OUT"
assert_contains "describe shows license id" "abc-123-def-456" "$OUT"
assert_contains "describe shows last sync" "2026-07-20T00:00:00Z" "$OUT"

rm -f "${FAKE_VAR}/license"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" describe 2>&1)
assert_contains "describe shows NOT REGISTERED" "NOT REGISTERED" "$OUT"
assert_exit_zero "describe exits zero when unregistered" \
  bash -c "PATH='${MOCK_BIN}:${PATH}' bash '$PATCHED' describe >/dev/null 2>&1"

# -------------------------------------------------------------------
echo "Test 13: sync writes assistants state file"
cat > "${FAKE_VAR}/license" <<EOF
LICENSE_ID=abc-123-def-456
USER_ID=describe-test@example.com
MACHINE_ID=testmachineid12345678901234
ENDPOINT=https://test.example.com/agent-enforcer
REGISTERED_AT=2026-07-20T00:00:00Z
EOF
# Empty files map on purpose: proves the assistants write happens BEFORE the
# empty-distribution early return in do_sync
install_mock_curl 200 '{"files":{},"assistants":{"claude-code":true,"kiro":false,"cursor":false,"github-copilot":true}}'
rm -f "${FAKE_VAR}/assistants"

PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync >/dev/null 2>&1 || true
assert_file_exists "assistants state written by sync" "${FAKE_VAR}/assistants"
ASSISTANTS=$(cat "${FAKE_VAR}/assistants" 2>/dev/null || echo "")
assert_contains "assistants has claude-code enabled" "claude-code=enabled" "$ASSISTANTS"
assert_contains "assistants has kiro disabled" "kiro=disabled" "$ASSISTANTS"
assert_contains "assistants has github-copilot enabled" "github-copilot=enabled" "$ASSISTANTS"

# -------------------------------------------------------------------
echo "Test 14: sync parses bundles schema and stages per assistant"
FAKE_HOMES="${TMPDIR_TEST}/homes"
rm -rf "$FAKE_HOMES"
mkdir -p "${FAKE_HOMES}/demo"
cat > "${FAKE_VAR}/license" <<EOF
LICENSE_ID=abc-123-def-456
USER_ID=bundles-test@example.com
MACHINE_ID=testmachineid12345678901234
ENDPOINT=https://test.example.com/agent-enforcer
REGISTERED_AT=2026-07-20T00:00:00Z
EOF
install_mock_curl 200 '{"files":{},"assistants":{"claude-code":true,"cursor":true},"bundles":{"claude-code":{"version":"1753751000000","files":{"CLAUDE.md":"https://mock/cc","settings.json":"https://mock/settings"}},"cursor":{"version":"1753751000000","files":{"AGENTS.md":"https://mock/agents"}}}}'
rm -f "${FAKE_VAR}/applied-versions"
rm -rf "${FAKE_VAR}/bundles"

AGENT_ENFORCER_HOME_ROOT="$FAKE_HOMES" PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync >/dev/null 2>&1 || true
assert_file_exists "claude-code bundle staged to store" "${FAKE_VAR}/bundles/claude-code/CLAUDE.md"
assert_file_exists "cursor bundle staged to store" "${FAKE_VAR}/bundles/cursor/AGENTS.md"
assert_file_exists "claude-code applied to user home" "${FAKE_HOMES}/demo/.claude/CLAUDE.md"
assert_file_exists "cursor AGENTS.md applied to home root" "${FAKE_HOMES}/demo/AGENTS.md"

echo "Test 14b: sync writes applied-versions state"
assert_file_exists "applied-versions state written" "${FAKE_VAR}/applied-versions"
APPLIED=$(cat "${FAKE_VAR}/applied-versions" 2>/dev/null || echo "")
assert_contains "applied-versions has claude-code version" "claude-code=1753751000000" "$APPLIED"
assert_contains "applied-versions has cursor version" "cursor=1753751000000" "$APPLIED"

# -------------------------------------------------------------------
echo "Test 15: sync applies cursor AGENTS.md into git projects"
mkdir -p "${FAKE_HOMES}/demo/projects/webapp/.git"
AGENT_ENFORCER_HOME_ROOT="$FAKE_HOMES" PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync >/dev/null 2>&1 || true
assert_file_exists "cursor AGENTS.md applied to git project" "${FAKE_HOMES}/demo/projects/webapp/AGENTS.md"

# -------------------------------------------------------------------
echo "Test 16: sync removes managed AGENTS.md when cursor disabled"
# Seed marker-managed files + one user-owned (no marker) file
printf '<!-- managed by agent-enforcer -->\nrules\n' > "${FAKE_HOMES}/demo/AGENTS.md"
printf '<!-- managed by agent-enforcer -->\nrules\n' > "${FAKE_HOMES}/demo/projects/webapp/AGENTS.md"
mkdir -p "${FAKE_HOMES}/demo/projects/user-owned"
printf 'my own agents file\n' > "${FAKE_HOMES}/demo/projects/user-owned/AGENTS.md"
touch "${FAKE_VAR}/cursor-applied"
# Cursor absent from the response — only claude-code is served now
install_mock_curl 200 '{"files":{},"assistants":{"claude-code":true,"cursor":false},"bundles":{"claude-code":{"version":"1753751000001","files":{"CLAUDE.md":"https://mock/cc"}}}}'

AGENT_ENFORCER_HOME_ROOT="$FAKE_HOMES" PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync >/dev/null 2>&1 || true
if [[ -f "${FAKE_HOMES}/demo/AGENTS.md" ]]; then
  _fail "managed home AGENTS.md removed on disable"
else
  _pass "managed home AGENTS.md removed on disable"
fi
if [[ -f "${FAKE_HOMES}/demo/projects/webapp/AGENTS.md" ]]; then
  _fail "managed project AGENTS.md removed on disable"
else
  _pass "managed project AGENTS.md removed on disable"
fi
assert_file_exists "user-owned AGENTS.md preserved" "${FAKE_HOMES}/demo/projects/user-owned/AGENTS.md"
if [[ -d "${FAKE_VAR}/bundles/cursor" ]]; then
  _fail "cursor store pruned when absent from response"
else
  _pass "cursor store pruned when absent from response"
fi

# -------------------------------------------------------------------
echo "Test 17: legacy files-only response still applies claude-code"
rm -rf "${FAKE_VAR}/bundles" "${FAKE_HOMES}/demo/.claude"
install_mock_curl 200 '{"files":{"CLAUDE.md":"https://mock/legacy"},"assistants":{"claude-code":true}}'
AGENT_ENFORCER_HOME_ROOT="$FAKE_HOMES" PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync >/dev/null 2>&1 || true
assert_file_exists "legacy response staged as claude-code" "${FAKE_VAR}/bundles/claude-code/CLAUDE.md"
assert_file_exists "legacy response applied to home" "${FAKE_HOMES}/demo/.claude/CLAUDE.md"

# -------------------------------------------------------------------
echo "Test 18: sync request body carries applied_versions and agent_version"
printf 'claude-code=1753751000000\n' > "${FAKE_VAR}/applied-versions"
REQUEST_LOG="${TMPDIR_TEST}/request-body.log"
rm -f "$REQUEST_LOG"
# Recording curl: captures -d payloads, returns an empty distribution
cat > "${MOCK_BIN}/curl" <<EOF
#!/bin/bash
OUTPUT_FILE=""
WRITE_OUT=""
args=("\$@")
i=0
while [[ \$i -lt \${#args[@]} ]]; do
  case "\${args[\$i]}" in
    -o)  OUTPUT_FILE="\${args[\$((i+1))]}"; i=\$((i+2)) ;;
    -w)  WRITE_OUT="\${args[\$((i+1))]}"; i=\$((i+2)) ;;
    -d)  echo "\${args[\$((i+1))]}" >> "${REQUEST_LOG}"; i=\$((i+2)) ;;
    *)   i=\$((i+1)) ;;
  esac
done
if [[ -n "\$OUTPUT_FILE" ]]; then
  printf '%s' '{"files":{},"assistants":{}}' > "\$OUTPUT_FILE"
fi
if [[ "\$WRITE_OUT" == "%{http_code}" ]]; then
  printf '200'
fi
EOF
chmod +x "${MOCK_BIN}/curl"

AGENT_ENFORCER_HOME_ROOT="$FAKE_HOMES" PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" sync >/dev/null 2>&1 || true
REQUEST_BODY=$(cat "$REQUEST_LOG" 2>/dev/null || echo "")
assert_contains "sync request has applied_versions" '"applied_versions":.*"claude-code": ?"1753751000000"' "$REQUEST_BODY"
assert_contains "sync request has agent_version" '"agent_version":"1\.0\.0"' "$REQUEST_BODY"

# -------------------------------------------------------------------
echo "Test 19: status and describe show applied bundle versions"
printf 'claude-code=1753751000000\ncursor=1753751000000\n' > "${FAKE_VAR}/applied-versions"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" status 2>&1)
assert_contains "status shows applied claude-code version" "claude-code.*1753751000000" "$OUT"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" describe 2>&1)
assert_contains "describe shows applied cursor version" "cursor.*1753751000000" "$OUT"

# -------------------------------------------------------------------
echo "Test 20: platform detection and autostart dispatch"
# Force Darwin via a mocked uname
cat > "${MOCK_BIN}/uname" <<'EOF'
#!/bin/bash
echo "Darwin"
EOF
chmod +x "${MOCK_BIN}/uname"
# Mock launchctl so the darwin service paths never touch the real system
cat > "${MOCK_BIN}/launchctl" <<'EOF'
#!/bin/bash
exit 0
EOF
chmod +x "${MOCK_BIN}/launchctl"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" status 2>&1)
assert_contains "darwin detection sets AGENT_TYPE=MACOS" "Agent Type.*MACOS" "$OUT"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" autostart on 2>&1)
assert_contains "autostart on dispatches to launchd" "Autostart enabled.*launchd" "$OUT"

# Force Linux via the mocked uname — systemctl path
cat > "${MOCK_BIN}/uname" <<'EOF'
#!/bin/bash
echo "Linux"
EOF
chmod +x "${MOCK_BIN}/uname"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" status 2>&1)
assert_contains "linux detection sets AGENT_TYPE=ROCKY9" "Agent Type.*ROCKY9" "$OUT"
OUT=$(PATH="${MOCK_BIN}:${PATH}" bash "$PATCHED" autostart off 2>&1)
assert_contains "autostart off dispatches to systemd" "Autostart disabled.*systemd" "$OUT"
assert_exit_nonzero "autostart rejects invalid argument" \
  bash -c "PATH='${MOCK_BIN}:${PATH}' bash '$PATCHED' autostart maybe >/dev/null 2>&1"
rm -f "${MOCK_BIN}/uname"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "==================================="
TOTAL=$((PASS + FAIL))
echo "Results: ${PASS}/${TOTAL} passed"
if [[ $FAIL -gt 0 ]]; then
  echo "FAILED: ${FAIL} test(s)"
  exit 1
fi
echo "All tests passed."
