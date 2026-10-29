# Changelog

## 0.1.1 — Unreleased

- Honor configured route readiness before private positive controls, second-tab baselines, and doctor checks; stop before transitions when readiness is missing.
- Wait for child process output streams to close before parsing end-to-end CLI results.
- Include allowlisted phase, identity, and marker-match metadata in cache-leak regression failures.
- Use one complete check:release command locally and in CI to prevent validation drift.
- Compare the installed CLI version with package.json during package verification, catching stale version constants before release.
- Allow 15 seconds for synthetic fixture actions on shared CI workers; keep deadline-specific tests explicit and retain inconclusive identity failures without assertion retries.
- Align the package, CLI, and emitted report version at 0.1.1 while retaining schema 1.0 report compatibility with 0.1.0.

## 0.1.0

- Fix CLI startup through npm executable symlinks on Unix; compare resolved entry paths and cover linked invocation, help/version/init/list, and safe module import with regression tests.
- Keep Git checkouts on LF line endings for Windows formatting checks, with a fresh-checkout regression test.
- Defer routine npm major version updates in Dependabot until compatibility review; retain minor, patch, and security updates.
- Keep demo authentication controls disabled until client hydration completes; cover delayed JavaScript loading and include allowlisted scenario phase diagnostics in end-to-end failures.

- Restrict npm contents to runtime modules and user guides; keep tests, fixtures, scripts, and the local demo as repository-only development references.
- Add source/staged-content privacy checks and disposable package verification; exclude local configuration, reports, caches, and internal notes from Git.

- Standardize AuthResidue branding, the authresidue package/executable, authresidue.config.ts, and AUTHRESIDUE_* environment references.

- Strict typed configuration, trusted TypeScript loading, credential environment references, explicit network origin authorization.
- Compiled ESM CLI: init, doctor, list, test, report, help/version; programmatic engine and result schemas.
- Sequential Chromium logout UI, cookie-session replay, account-switch, protected route/API, stale-tab, and bounded storage scenarios.
- Evidence-based status/impact classification with positive controls, bounded read-only GET probes, cancellation, and cleanup.
- Sanitized JSON and offline escaped/filterable HTML; no screenshots, traces, telemetry, or cloud runtime.
- Deterministic fixture tests and a loopback Next.js demo with secure and four deliberately broken modes.
- Contribution/security guidance, local package verification, and cross-platform CI definition.

Service worker behavior, automatic bearer extraction, permission changes, mutation probes, multi-worker execution, and additional browsers are deferred.
