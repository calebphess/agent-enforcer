#!/bin/bash
# demo-prompt — interactive Agent Enforcer customer-demo wrapper.
#
# Run the SAME command on both demo instances:
#   sudo demo-prompt "build me a task manager REST API"
#
# Both boxes derive the same RUN_ID from the prompt text, upload results
# under runs/<RUN_ID>/<role>/, and the analysis Lambda writes
# runs/<RUN_ID>/results.md once both have finished.
#
# Installed to /usr/local/bin/demo-prompt by the DemoStack interactive-mode
# user-data, alongside /etc/demo-env (RESULTS_BUCKET, API_KEY_SECRET_ARN)
# and /etc/demo-role (instance1|instance2).
set -euo pipefail

usage() { echo 'Usage: sudo demo-prompt "<prompt>"' >&2; exit 1; }
if [[ $EUID -ne 0 ]]; then
  echo "Error: demo-prompt requires sudo." >&2
  exit 1
fi

# shellcheck source=/dev/null
source /etc/demo-env
ROLE=$(cat /etc/demo-role)
PROMPT="$*"
[[ -n "$PROMPT" ]] || usage

# Deterministic run id — the identical prompt yields the identical id on both
# boxes so their uploads land under the same run. DEMO_RUN_ID overrides
# (recovery hatch if the prompts accidentally diverged).
RUN_ID="${DEMO_RUN_ID:-$(printf '%s' "$PROMPT" | sha256sum | cut -c1-12)}"
RUN_DIR="/demo/runs/${RUN_ID}"
rm -rf "$RUN_DIR"
mkdir -p "${RUN_DIR}/project" "${RUN_DIR}/output"
printf '%s' "$PROMPT" > "${RUN_DIR}/prompt.txt"
chown -R demo:demo "$RUN_DIR"

# API key fetched at run time via the instance role — never persisted to disk
ANTHROPIC_API_KEY=$(aws secretsmanager get-secret-value --secret-id "$API_KEY_SECRET_ARN" \
  --query 'SecretString' --output text | python3 -c "import sys,json; print(json.load(sys.stdin)['api-key'])")

echo "============================================================"
echo "  Agent Enforcer demo — run ${RUN_ID} (${ROLE})"
echo "  Run the identical command on the other instance too."
echo "============================================================"
echo ""

STREAM_FILE="${RUN_DIR}/output/session-stream.jsonl"
set +e
su -s /bin/bash demo -c "export ANTHROPIC_API_KEY='${ANTHROPIC_API_KEY}'; \
  cd '${RUN_DIR}/project'; \
  claude -p \"\$(cat '${RUN_DIR}/prompt.txt')\" --output-format stream-json --verbose --dangerously-skip-permissions" \
  | tee "$STREAM_FILE" | /usr/local/bin/demo-stream-filter.py
CLAUDE_STATUS=${PIPESTATUS[0]}
set -e

if [[ $CLAUDE_STATUS -ne 0 ]]; then
  echo "" >&2
  echo "Claude Code exited with status ${CLAUDE_STATUS} — NOT uploading results." >&2
  echo "Re-run the same command to retry (the workspace is recreated per run)." >&2
  exit "$CLAUDE_STATUS"
fi

# Synthesize session.json from the final stream 'result' event so the analysis
# Lambda's token/cost extraction sees the same shape as the auto-run demo.
python3 - "$STREAM_FILE" "${RUN_DIR}/output/session.json" <<'PY'
import json, sys
last = {}
with open(sys.argv[1]) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get('type') == 'result':
            last = d
json.dump(last, open(sys.argv[2], 'w'))
PY

INPUT_TOKENS=$(python3 -c "import json; d=json.load(open('${RUN_DIR}/output/session.json')); u=d.get('usage',{}); print(u.get('input_tokens',0)+u.get('cache_read_input_tokens',0)+u.get('cache_creation_input_tokens',0))" 2>/dev/null || echo 0)
OUTPUT_TOKENS=$(python3 -c "import json; d=json.load(open('${RUN_DIR}/output/session.json')); print(d.get('usage',{}).get('output_tokens',0))" 2>/dev/null || echo 0)
COST_USD=$(python3 -c "import json; d=json.load(open('${RUN_DIR}/output/session.json')); print(d.get('total_cost_usd', d.get('cost_usd', 0)))" 2>/dev/null || echo 0)

META="${RUN_DIR}/output/meta.txt"
INSTANCE_NUM="${ROLE#instance}"
{
  echo "instance: ${INSTANCE_NUM}"
  echo "completed_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "files_created: $(find "${RUN_DIR}/project" -type f | wc -l)"
  echo "total_lines: $(find "${RUN_DIR}/project" -type f -name '*.py' -exec wc -l {} + 2>/dev/null | tail -1)"
  echo "input_tokens: ${INPUT_TOKENS}"
  echo "output_tokens: ${OUTPUT_TOKENS}"
  echo "cost_usd: ${COST_USD}"
  echo "run_id: ${RUN_ID}"
  echo "role: ${ROLE}"
  # Single line, capped — meta.txt is parsed line-by-line on ':'
  echo "prompt: $(printf '%s' "$PROMPT" | tr '\n' ' ' | cut -c1-200)"
} > "$META"

PREFIX="runs/${RUN_ID}/${ROLE}"
aws s3 sync "${RUN_DIR}/project/" "s3://${RESULTS_BUCKET}/${PREFIX}/project/" --quiet
aws s3 cp "${RUN_DIR}/output/session.json" "s3://${RESULTS_BUCKET}/${PREFIX}/session.json" --quiet
aws s3 cp "$STREAM_FILE" "s3://${RESULTS_BUCKET}/${PREFIX}/session.log" --quiet
aws s3 cp "$META" "s3://${RESULTS_BUCKET}/${PREFIX}/meta.txt" --quiet
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | aws s3 cp - "s3://${RESULTS_BUCKET}/${PREFIX}/completed" --quiet

echo ""
echo "============================================================"
echo "  Upload complete for ${ROLE} (run ${RUN_ID})."
echo "  Results appear a minute or two after BOTH instances finish:"
echo "  https://${RESULTS_BUCKET}.s3.amazonaws.com/runs/${RUN_ID}/results.md"
echo "============================================================"
