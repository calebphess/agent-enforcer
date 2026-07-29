#!/usr/bin/env bash
# Builds the unsigned macOS installer package for the Agent Enforcer agent.
#
#   bash pkg/build-pkg.sh
#
# Output: pkg/dist/agent-enforcer-<version>.pkg
#
# The pkg installs:
#   /usr/local/bin/agent-enforcer                                (the agent CLI/daemon)
#   /Library/LaunchDaemons/com.alchemist.agent-enforcer.plist    (start on boot)
# and runs postinstall (state dirs + daemon load + banner).
#
# Unsigned preview build: on first open, right-click the .pkg -> Open to get
# past Gatekeeper. Signing/notarization needs an Apple Developer ID.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="${REPO_ROOT}/pkg"
VERSION="$(cat "${REPO_ROOT}/VERSION")"
ROOT_DIR="${PKG_DIR}/root"
DIST_DIR="${PKG_DIR}/dist"
IDENTIFIER="com.alchemist.agent-enforcer"

echo "Building agent-enforcer ${VERSION} macOS package..."

rm -rf "$ROOT_DIR" "$DIST_DIR"
mkdir -p "${ROOT_DIR}/usr/local/bin" "${ROOT_DIR}/Library/LaunchDaemons" "$DIST_DIR"

install -m 755 "${REPO_ROOT}/rpm/SOURCES/agent-enforcer" "${ROOT_DIR}/usr/local/bin/agent-enforcer"
install -m 644 "${PKG_DIR}/com.alchemist.agent-enforcer.plist" "${ROOT_DIR}/Library/LaunchDaemons/"

chmod +x "${PKG_DIR}/scripts/postinstall"

PKG_FILE="${DIST_DIR}/agent-enforcer-${VERSION}.pkg"
pkgbuild \
  --root "$ROOT_DIR" \
  --scripts "${PKG_DIR}/scripts" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --install-location / \
  "$PKG_FILE"

rm -rf "$ROOT_DIR"

echo ""
echo "Built: ${PKG_FILE}"
echo ""
echo "Upload to the installer bucket with:"
echo "  aws s3 cp '${PKG_FILE}' s3://agent-enforcer-rpm/installers/latest/agent-enforcer.pkg"
echo "  aws s3 cp '${PKG_FILE}' s3://agent-enforcer-rpm/installers/${VERSION}/agent-enforcer-${VERSION}.pkg"
