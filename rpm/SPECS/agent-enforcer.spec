Name:           agent-enforcer
Version:        0.1.0
Release:        1%{?dist}
Summary:        AI Configuration Enforcement Agent — syncs .claude/ configs from S3
License:        Proprietary
BuildArch:      noarch
URL:            https://github.com/your-org/agent-enforcer

# No build dependencies — this is a bash script package
# Runtime: AWS CLI v2 must be installed separately (https://aws.amazon.com/cli/)

%description
Agent Enforcer is an enterprise AI configuration enforcement agent for Rocky Linux / RHEL.
It continuously syncs AI tool configurations (CLAUDE.md, settings.json, etc.) from a
central S3 bucket and applies them to all user ~/.claude/ directories on this host.

The service installs disabled and does nothing until configured. Configure with:
  sudo agent-enforcer configure --bucket <enforcement-bucket-name>

Prerequisites:
  AWS CLI v2 must be installed and the host must have IAM permissions
  (instance role or configured credentials) to read from the enforcement bucket.

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

%files
%{_bindir}/agent-enforcer
%{_unitdir}/agent-enforcer.service
%dir %attr(0750, root, root) %{_sysconfdir}/agent-enforcer
%dir %{_localstatedir}/lib/agent-enforcer

%post
%systemd_post agent-enforcer.service
/usr/bin/systemctl enable agent-enforcer.service >/dev/null 2>&1 || :
echo ""
echo "Agent Enforcer installed successfully."
echo "Configure it with: sudo agent-enforcer configure --bucket <your-enforcement-bucket>"
echo ""

%preun
%systemd_preun agent-enforcer.service

%postun
%systemd_postun_with_restart agent-enforcer.service

%changelog
* Mon Jun 23 2026 Agent Enforcer Team <noreply@example.com> - 0.1.0-1
- Initial v0 release
- Supports claude-code (.claude/) configuration enforcement
- Requires sudo for configure command
- Syncs every 15 minutes from S3
