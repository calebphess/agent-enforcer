Name:           agent-enforcer
Version:        0.2.2
Release:        1%{?dist}
Summary:        AI Configuration Enforcement Agent — syncs .claude/ configs via enforcement API
License:        Proprietary
BuildArch:      noarch
URL:            https://github.com/calebphess/agent-enforcer

# No build dependencies — this is a bash script package
# Runtime: curl must be installed (typically pre-installed on Rocky Linux)

%description
Agent Enforcer is an enterprise AI configuration enforcement agent for Rocky Linux / RHEL.
It continuously syncs AI tool configurations (CLAUDE.md, settings.json, etc.) from a
central enforcement API and applies them to all user ~/.claude/ directories on this host.

The service installs in an unregistered state and will not sync until registered.
Register with:
  sudo agent-enforcer register

Prerequisites:
  curl must be available (standard on Rocky Linux).

%prep
# No source tarball to unpack — files are copied directly from SOURCES

%build
# Nothing to compile

%install
install -Dm 0755 %{_sourcedir}/agent-enforcer         %{buildroot}%{_bindir}/agent-enforcer
install -Dm 0644 %{_sourcedir}/agent-enforcer.service  %{buildroot}%{_unitdir}/agent-enforcer.service

# State and config directories
install -dm 0750 %{buildroot}%{_sysconfdir}/agent-enforcer
install -dm 0755 %{buildroot}%{_localstatedir}/lib/agent-enforcer

# Version file — readable by agent for self-reporting and demo
install -Dm 0644 /dev/stdin %{buildroot}%{_prefix}/lib/agent-enforcer/version <<< "0.2.1"

%files
%{_bindir}/agent-enforcer
%{_unitdir}/agent-enforcer.service
%dir %attr(0750, root, root) %{_sysconfdir}/agent-enforcer
%dir %{_localstatedir}/lib/agent-enforcer
%{_prefix}/lib/agent-enforcer/version
# license file is created at runtime by 'agent-enforcer register', not installed by RPM
%ghost %attr(0600, root, root) %{_localstatedir}/lib/agent-enforcer/license

%post
%systemd_post agent-enforcer.service
/usr/bin/systemctl enable agent-enforcer.service >/dev/null 2>&1 || :
echo ""
echo "Agent Enforcer v0.2.1 installed successfully."
echo ""
echo "Register this agent before it will sync:"
echo "  sudo agent-enforcer register"
echo ""
echo "For non-interactive registration:"
echo "  sudo agent-enforcer register --no-prompt --user-id <your-id> --endpoint <api-url>"
echo ""

%preun
%systemd_preun agent-enforcer.service

%postun
%systemd_postun_with_restart agent-enforcer.service

%changelog
* Tue Jun 24 2026 Agent Enforcer Team <noreply@example.com> - 0.2.1-1
- Add license registration system (DynamoDB-backed via REST API)
- Replace direct S3 sync with API-based presigned URL distribution
- Add 'register' command with interactive and --no-prompt modes
- License transfer: provide old license_id + user_id to migrate to new host
- Machine-ID binding prevents license file copy-paste between hosts
- Remove configure --bucket (breaking change from v0.1.x); use configure --endpoint
- Daemon gracefully skips sync when not registered or API is unreachable
- Add /usr/lib/agent-enforcer/version file for version self-reporting

* Mon Jun 23 2026 Agent Enforcer Team <noreply@example.com> - 0.1.0-1
- Initial v0 release
- Supports claude-code (.claude/) configuration enforcement
- Requires sudo for configure command
- Syncs every 15 minutes from S3
