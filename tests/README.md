# Development tests

This directory is for contributor reference and automated verification. It is excluded from the npm package.

- `unit/` checks configuration, CLI contracts, result classification, redaction, reports, release-data checks, and formatter compatibility after a fresh Git checkout.
- `integration/` exercises real Chromium against local synthetic fixtures, including origin enforcement and cleanup, and verifies compiled CLI startup through filesystem links.
- `e2e/` runs the compiled CLI against the repository's loopback-only Next.js demo.
- `fixtures/` contains deliberately synthetic accounts, canaries, and corrected/broken test behavior. These values are not real user data and must never be replaced with production credentials.

Use `npm run test:unit`, `npm run test:integration`, or `npm run test:e2e`. The full `npm test` builds the CLI and runs every suite. Browser tests require Playwright Chromium; end-to-end tests also require `npm run demo:install`.

Shared synthetic fixtures allow 15 seconds per browser action or identity-readiness check to accommodate loaded CI workers. Scenario and navigation limits remain bounded. Deadline-specific tests override these limits explicitly. Missing identities still produce INCONCLUSIVE, and failed security assertions are never retried.

Temporary authentication and fixture state stay in memory or disposable test directories. Generated Next.js output is ignored. Never commit real application reports, storage state, secrets, screenshots, or traces.
