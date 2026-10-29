# AuthResidue

**Test what survives after the user leaves.**

AuthResidue tests configured identity transitions in web applications using local Chromium automation. It checks whether synthetic private data survives logout, reappears under a second identity, or remains accessible using an old session cookie. It runs locally or in CI, with no account, database, paid API, telemetry, cloud backend, or AI runtime dependency.

Developers routinely verify login. The transition out of an identity deserves explicit assertions too. AuthResidue keeps UI exposure, server authorization, retained storage, and already-rendered stale content separate. A configured private canary is evidence; HTTP 200 alone is not.

This is an initial implementation. The repository supports source builds and locally packed installations. Passing selected checks cannot prove that an application is secure. Only test applications you are authorized to inspect, with synthetic test accounts.

## Install from this repository

Use Node 22+; Node 24 LTS is recommended. Install Chromium once:

```sh
npm ci
npm run build
npx playwright install chromium
node dist/cli/main.js --help
```

On Linux, Playwright may require `npx playwright install --with-deps chromium`. On Windows PowerShell systems that block npm.ps1, use `npm.cmd` and `npx.cmd`.

To verify an installable package without publishing:

```sh
npm pack --dry-run
npm run audit:release
npm run verify:package
```

After a release is published under the verified package name, the npm workflow is `npm install -D authresidue` followed by `npx authresidue init`. For a source checkout, use the build and CLI commands below. Maintainers must confirm name availability and ownership before publication.

## Quick start against your application

```sh
node dist/cli/main.js init --non-interactive
# Edit authresidue.config.ts for your authorized application and synthetic accounts.
# Export the four credential environment variables named in that file.
node dist/cli/main.js doctor
node dist/cli/main.js test
node dist/cli/main.js test --scenario account-switch logout-session --json
node dist/cli/main.js report authresidue-output/results.json
```

`doctor` exercises a real synthetic A login and logout; it is not a read-only account check. Configuration is trusted executable TypeScript. `init` writes only authresidue.config.ts using exclusive creation and never overwrites an existing file. Every test writes sanitized `results.json` and, by default, `report.html` to the configured output directory. Later runs replace those two files, so use separate output directories to retain runs.

```ts
import { defineConfig } from 'authresidue';

export default defineConfig({
  baseURL: 'http://127.0.0.1:3000',
  allowedOrigins: ['http://127.0.0.1:3000'],
  accounts: {
    a: {
      emailEnv: 'AUTHRESIDUE_A_EMAIL',
      passwordEnv: 'AUTHRESIDUE_A_PASSWORD',
      identity: 'Alice',
      privateMarker: 'A_PRIVATE_CANARY_001',
    },
    b: {
      emailEnv: 'AUTHRESIDUE_B_EMAIL',
      passwordEnv: 'AUTHRESIDUE_B_PASSWORD',
      identity: 'Bob',
      privateMarker: 'B_PRIVATE_CANARY_002',
    },
  },
  routes: [{ path: '/dashboard' }],
  probes: [{ path: '/api/private', deniedStatuses: [401, 403] }],
});
```

The default selectors use `[name="email"]`, `[name="password"]`, `button[type="submit"]`, and `data-testid` values `identity`, `logout`, `login-form`, and `private`. Identity text must exactly equal the configured identity. Private content and authenticated GET responses must contain the synthetic private marker. Add a route `readySelector` that becomes visible after hydration/data loading when needed. See [all configuration options](docs/configuration.md).

## Local Next.js demonstration

The [demo guide](examples/nextjs-demo/README.md) provides complete setup for all five modes. From the repository root, in PowerShell:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run demo:install
npx.cmd playwright install chromium
$env:AUTHRESIDUE_A_EMAIL='alice@authresidue.invalid'
$env:AUTHRESIDUE_A_PASSWORD='<choose a synthetic password for A>'
$env:AUTHRESIDUE_B_EMAIL='bob@authresidue.invalid'
$env:AUTHRESIDUE_B_PASSWORD='<choose a different synthetic password for B>'
$env:AUTHRESIDUE_DEMO_MODE='secure'
npm.cmd run demo
```

Replace the password placeholders with test-only values. In a second terminal, export the same four synthetic credential variables and run:

```powershell
node dist/cli/main.js test --config examples/nextjs-demo/authresidue.config.ts
```

Use `cache-leak`, `broken-logout`, `public-api`, or `stale-tab` as the demo mode and restart the server to exercise intentional failures. The server binds only to 127.0.0.1. Never publicly deploy it. Next.js telemetry is disabled by the supplied launch scripts and tests.

## Supported scenarios

| Identifier          | Executed checks                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `logout-ui`         | Configured private markers after logout, revisiting routes, reload, back and forward navigation |
| `logout-session`    | Read-only GETs using pre-logout cookies in an isolated context                                  |
| `account-switch`    | A → logout → B in the same context; private UI, optional GETs, and storage observations         |
| `protected-routes`  | Anonymous, positively authenticated A, logged-out, and B views                                  |
| `protected-api`     | Anonymous, A positive control, logged-out, former cookie state, and B GETs                      |
| `stale-tab`         | Already-rendered content, then reload; separate current-cookie GET authorization                |
| `storage-isolation` | Bounded configured localStorage, sessionStorage, cookies; opt-in IndexedDB and CacheStorage     |

All scenarios run sequentially. Every scenario starts with a fresh context. Security assertions are never retried. A temporary loopback proxy enforces browser origins across redirects; TLS is not decrypted. HTTP/2 and QUIC are disabled, so their production behavior is outside coverage. Service worker behavior is unsupported and explicitly NOT_TESTED. There are no mutation probes, permission-change automation, automatic bearer-token extraction, MFA implementation, screenshots, or traces.

Illustrative terminal format (not a claimed scan):

```text
FAIL         logout-session · Protected GET denies former or anonymous identity (/api/private)
             A configured private marker was returned by the server.
INCONCLUSIVE stale-tab · Already-rendered stale tab content (/dashboard)
             Previously rendered A marker remains; no new server access is established.
```

## Results and CI

- PASS: configured assertion executed with its required positive control.
- FAIL: configured expectation demonstrably mismatched observed behavior.
- INCONCLUSIVE: attempted check could not establish a reliable conclusion, or retention was observed without an exposure assertion.
- NOT_TESTED: check did not run, was not applicable, or lacked a storage marker baseline.

Exit 0 means at least one assertion passed and no verified assertion failed. It can include inconclusive or untested coverage. Exit 1 means a verified failure. Exit 2 means setup/execution error, interruption, no useful passing assertions, or inconclusive results with `--fail-on-inconclusive`. Failures take precedence over interruption. CI consumers must inspect NOT_TESTED separately; strict mode does not turn intentionally untested categories into failures.

Use `--json` for one JSON object on stdout; progress, if requested with `--verbose`, goes to stderr. `--headed` opens Chromium; headless is default. `--timeout` sets the per-scenario deadline in milliseconds. Output uses no ANSI colors, so non-TTY and NO_COLOR environments remain readable.

The offline HTML report includes filters, evidence, reproduction guidance, coverage, environment, and limitations. It uses escaped static HTML, a fixed script protected by a CSP hash, local system fonts, and no external assets. JSON schema version is 1.0; see [results](docs/results.md). No report contains raw storage, cookies, response bodies, screenshots, or Playwright traces.

## Development

```sh
npm ci
npm run demo:install
npx playwright install chromium
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
npm run audit:release
npm run verify:package
```

`npm test` includes the real-browser fixture suite and builds the Next.js demo for compiled-CLI end-to-end tests; it needs the separate demo dependencies installed first. `npm run test:unit` runs without Chromium or demo dependencies. `npm run test:integration` exercises the lightweight loopback fixtures. `npm run test:e2e` builds AuthResidue and tests the compiled CLI against Next.js.

Tests, synthetic fixtures, the local demo, and development scripts are repository-only resources; they are excluded from the npm package. See [test guidance](tests/README.md) and [development scripts](scripts/README.md). The npm package contains compiled CLI/library files, this README, the MIT license, and user-facing configuration, result, security, limitation, and troubleshooting guides.

`npm run audit:release` scans publication candidates for recognizable secret formats, personal filesystem paths, populated credential examples, and saved browser/report data. `npm run verify:package` checks the actual npm file list, installs a temporary local tarball, tests its executable and exports, and removes the temporary installation afterward. Review staged files before publishing; pattern-based checks cannot identify every possible secret.

See the repository's architecture and contribution guides, and the [security model](docs/security-model.md), [limitations](docs/limitations.md), and [troubleshooting](docs/troubleshooting.md). Windows has been exercised locally; cross-platform compatibility must be established by CI.

Roadmap: permission-change hooks, deliberate bearer-token replay support, deeper persistence controls, service-worker-aware testing, additional browsers, and richer comparison across runs. These are not implemented checks. License: [MIT](LICENSE).
