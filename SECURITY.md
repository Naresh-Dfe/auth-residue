# Security policy

Only test applications you own or are explicitly authorized to assess. Use synthetic accounts and canaries. The example app contains deliberate vulnerabilities and must remain local. AuthResidue does not certify an application as secure.

The initial 0.1.x series is experimental. Review the documented coverage and limitations before using results in a security decision.

For a potential AuthResidue vulnerability, use the repository's private vulnerability reporting feature when available. Do not post credentials, session IDs, full response bodies, or working private-target details in public issues. Include the affected version, configuration shape with values removed, controlled synthetic reproduction, expected/observed behavior, and impact. If private reporting is not yet enabled, ask the maintainer to establish a private channel without publishing exploit details.

Reports about intentionally vulnerable demo modes are expected fixture behavior. Unexpected exposure in the tool, origin enforcement bypass, report injection, unsafe artifact handling, and incorrect finding classification are security-relevant. See [security model](docs/security-model.md) and [limitations](docs/limitations.md).
