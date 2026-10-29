# Troubleshooting

## Chromium is missing or cannot launch

Run `npx playwright install chromium` using the Playwright version installed with AuthResidue. On Linux use `npx playwright install --with-deps chromium` where you have permission to install OS dependencies. `authresidue doctor` checks the executable and attempts browser authentication when prerequisites permit. A file existing is not proof that all browser libraries are available. Set PLAYWRIGHT_BROWSERS_PATH consistently during installation and execution if you use a custom cache.

## Invalid selectors or failed authentication

Run `authresidue doctor --config path/to/authresidue.config.ts`. It exercises A's real synthetic login/logout. Confirm that the email/password environment variables are exported in this shell, that selectors are unique, that identity innerText exactly equals the configured identity, and that auth hooks complete normally. Raw error dumps are deliberately withheld. Use `--headed --verbose` to watch behavior and safe scenario progress. Do not enable password/response logging to debug it.

If authentication needs MFA, redirects to a provider, or bearer-only requests, consult the documented limitations and hook interface. Do not assume a 200 response or navigation is a successful login. Missing positive controls produce INCONCLUSIVE, not PASS.

## Unreachable local application or target authorization error

Start the application first. Match protocol, hostname, and port exactly in baseURL/allowedOrigins: localhost and 127.0.0.1 are different origins. Configure a directly reachable login path; startup reachability does not follow redirects. Browser redirects or assets outside allowed origins are blocked. Add only targets you are explicitly authorized to test. For the demo, bind to loopback and keep the exact 127.0.0.1 origin.

## Session expiration or intermittent UI readiness

Use fresh synthetic accounts with a lifetime long enough for the configured scenarios. Configure an explicit readySelector on private routes whose data appears after hydration. The selector must also be available on the route's anonymous representation, including a redirected login view. Increase action/navigation deadlines for slow CI without weakening markers. Initial navigation transport retries are bounded; failed security assertions are never retried into success.

## INCONCLUSIVE and NOT_TESTED

INCONCLUSIVE can mean identity/selector/transport failure, absent API positive controls, redirects, truncated bodies, unsupported storage access, or a retained/stale observation that does not establish exposure. Read the phase, expectation, and limitations. NOT_TESTED can mean unselected coverage, cancellation, no history document traversal, disabled stores, or no storage marker in the authenticated baseline. Use `--fail-on-inconclusive` in strict CI and inspect NOT_TESTED in structured results separately.

## Browser crashes or cancellation

The engine closes contexts/browser in finally blocks and aborts bounded GETs. SIGINT/SIGTERM preserve sanitized partial results once a browser run has started; a startup failure may not create a report. An operating-system kill cannot guarantee partial output. Hooks must not spawn unmanaged subprocesses or keep their own resources alive. Rerun doctor after a crash and verify available memory and browser system dependencies.

## Windows filesystem and npm issues

If execution policy blocks npm.ps1, use `npm.cmd` and `npx.cmd`; changing policy is unnecessary. Choose a writable short output path. Antivirus or an open editor can lock a report during a rename; close the reader and rerun report generation from saved JSON. Windows ACLs control artifact privacy. File URL conversion is platform-aware, including spaces. Do not put credentials in config filenames or route paths.

## CI and package verification

Install both root dependencies (`npm ci`) and demo dependencies (`npm run demo:install`). Install Chromium for the current runner and build AuthResidue before `npm test` or `npm run test:e2e`. The e2e suite builds Next.js and starts isolated loopback fixtures itself; no external account/backend is needed. npm install/pack validation needs package registry/cache access. No action publishes or deploys. Review CI on every supported OS before claiming compatibility.
