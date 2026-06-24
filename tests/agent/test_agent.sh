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
  # macOS: stat -f "%OLp" | Linux: stat -c "%a"
  actual_perm=$(stat -f "%OLp" "$path" 2>/dev/null || stat -c "%a" "$path" 2>/dev/null || echo "unknown")
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
assert_contains "status shows version" "0.2.1" "$STATUS"

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
