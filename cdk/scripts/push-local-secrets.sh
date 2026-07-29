#!/usr/bin/env bash
# Pushes secrets.local.yaml (repo root, git-ignored) into AWS Secrets Manager:
#   cursor_api_key                -> agent-enforcer/dev/cursor-api-key (key: api-key)
#   admin_username/admin_password -> merged into agent-enforcer/config
# Run after any change to secrets.local.yaml and before deploy:all[:demo].
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SECRETS_FILE="${REPO_ROOT}/secrets.local.yaml"

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "ERROR: $SECRETS_FILE not found" >&2
  exit 1
fi

yaml_get() {
  awk -F': ' -v key="$1" '$1 == key { print $2; exit }' "$SECRETS_FILE"
}

CURSOR_KEY="$(yaml_get cursor_api_key)"
ADMIN_USER="$(yaml_get admin_username)"
ADMIN_PASS="$(yaml_get admin_password)"

if [[ -z "$CURSOR_KEY" || -z "$ADMIN_USER" || -z "$ADMIN_PASS" ]]; then
  echo "ERROR: secrets.local.yaml missing one of cursor_api_key/admin_username/admin_password" >&2
  exit 1
fi

CURSOR_SECRET_NAME="agent-enforcer/dev/cursor-api-key"
CONFIG_SECRET_NAME="agent-enforcer/config"

if aws secretsmanager describe-secret --secret-id "$CURSOR_SECRET_NAME" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id "$CURSOR_SECRET_NAME" \
    --secret-string "{\"api-key\":\"$CURSOR_KEY\"}" >/dev/null
  echo "Updated $CURSOR_SECRET_NAME"
else
  aws secretsmanager create-secret --name "$CURSOR_SECRET_NAME" \
    --description "Cursor User API key for the agent-enforcer demo cursor instance" \
    --secret-string "{\"api-key\":\"$CURSOR_KEY\"}" >/dev/null
  echo "Created $CURSOR_SECRET_NAME"
fi

# Merge admin creds into the existing config secret without dropping other keys.
if aws secretsmanager describe-secret --secret-id "$CONFIG_SECRET_NAME" >/dev/null 2>&1; then
  CURRENT="$(aws secretsmanager get-secret-value --secret-id "$CONFIG_SECRET_NAME" \
    --query SecretString --output text)"
  MERGED="$(python3 - "$ADMIN_USER" "$ADMIN_PASS" <<PYEOF
import json, sys
current = json.loads('''$CURRENT''')
current['admin_username'] = sys.argv[1]
current['admin_password'] = sys.argv[2]
print(json.dumps(current))
PYEOF
)"
  aws secretsmanager put-secret-value --secret-id "$CONFIG_SECRET_NAME" \
    --secret-string "$MERGED" >/dev/null
  echo "Merged admin creds into $CONFIG_SECRET_NAME"
else
  echo "NOTE: $CONFIG_SECRET_NAME does not exist yet (created by AgentEnforcerStack)." >&2
  echo "      Re-run this script after the first deploy to set admin creds." >&2
fi
