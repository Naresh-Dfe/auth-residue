# Configuration

`authresidue.config.ts` exports `defineConfig({...})` or a plain configuration object. The helper provides input types; `validateConfig` applies strict Zod validation and defaults. Unknown keys are rejected. Jiti loads TypeScript configuration from the current project or `--config`. Loading configuration executes trusted project code; never load untrusted configurations. The loader aliases `authresidue` to the running installation, so the generated template works with the packaged CLI.

AuthResidue does not load dotenv files. Export credential references in the shell or CI environment. The Next.js demo separately supports Next.js's local environment loading; the CLI still needs its variables exported.

| Option                    | Required/default                                             | Meaning                                                                                                                        |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `baseURL`                 | Required                                                     | http(s) origin with no credentials, query, fragment, or path                                                                   |
| `allowedOrigins`          | Required, 1–20 exact origins                                 | Explicit authorization; must contain baseURL's origin. No wildcard or trailing slash                                           |
| `accounts.a`              | Required                                                     | `emailEnv`, `passwordEnv`, `identity`, `privateMarker`                                                                         |
| `accounts.b`              | Required for account-switch, protected-routes, protected-api | Distinct synthetic identity and private marker; markers must not contain one another                                           |
| `auth.loginPath`          | `/login`                                                     | Application-relative login view                                                                                                |
| `auth.authenticatedPath`  | `/dashboard`                                                 | Authenticated view containing identity and logout controls                                                                     |
| `auth.emailSelector`      | `[name="email"]`                                             | Email form field                                                                                                               |
| `auth.passwordSelector`   | `[name="password"]`                                          | Password field                                                                                                                 |
| `auth.submitSelector`     | `button[type="submit"]`                                      | Login action                                                                                                                   |
| `auth.logoutSelector`     | `[data-testid="logout"]`                                     | Normal logout action                                                                                                           |
| `auth.identitySelector`   | `[data-testid="identity"]`                                   | One visible element; trimmed innerText must exactly match identity                                                             |
| `auth.anonymousSelector`  | `[data-testid="login-form"]`                                 | Visible anonymous UI positive control                                                                                          |
| `auth.hooks`              | Unset                                                        | Advanced trusted login/logout functions; see below                                                                             |
| `privateSelectors`        | `['[data-testid="private"]']`                                | Visible elements in which to look for synthetic private markers                                                                |
| `routes`                  | `[{path:'/dashboard'}]`, at most 40                          | Private views. Each may override `privateSelectors` and set `readySelector`                                                    |
| `routes[].readySelector`  | Unset                                                        | Visible readiness condition before private positive controls and route assertions; must work for protected and anonymous views |
| `probes`                  | `[]`, at most 20                                             | Explicit read-only endpoints; required for logout-session and protected-api                                                    |
| `probes[].path`           | Required                                                     | Application-relative GET endpoint, never a foreign URL                                                                         |
| `probes[].method`         | `GET`                                                        | Every other method is rejected                                                                                                 |
| `probes[].deniedStatuses` | `[401,403]`                                                  | Expected denial codes. A configured private marker returned with any status is a failure                                       |
| `probes[].maxBytes`       | 65536, range 128–1048576                                     | Body cap. Truncation without a marker cannot establish denial/isolation                                                        |
| `scenarios`               | All seven identifiers                                        | Nonempty, no duplicates. Prerequisites are validated before launch                                                             |
| `timeouts.action`         | 10000 ms, range 100–120000                                   | Locator, identity, private marker, GET deadline                                                                                |
| `timeouts.navigation`     | 15000 ms, range 100–120000                                   | Navigation and reachability deadline                                                                                           |
| `timeouts.scenario`       | 90000 ms, range 1000–600000                                  | Whole scenario execution deadline                                                                                              |
| `retry.navigation`        | 0, max 2                                                     | Initial anonymous navigation transport retries only; no assertion retries                                                      |
| `reports.outputDir`       | `authresidue-output`                                         | Local directory; CLI writes results.json/report.html here                                                                      |
| `reports.html`            | `true`                                                       | Generate offline HTML alongside JSON                                                                                           |
| `storage.localStorage`    | `true`                                                       | Inspect current origin's localStorage                                                                                          |
| `storage.sessionStorage`  | `true`                                                       | Inspect current tab's sessionStorage                                                                                           |
| `storage.cookies`         | `true`                                                       | Inspect current page's applicable cookies; aggregate attributes, no values/names                                               |
| `storage.indexedDB`       | `false`                                                      | Opt-in readonly cursors and database/store metadata enumeration                                                                |
| `storage.cacheStorage`    | `false`                                                      | Opt-in cached response body marker inspection; opaque responses are inconclusive                                               |
| `storage.maxEntries`      | 100, range 1–1000                                            | Per-category processed entry bound                                                                                             |
| `storage.maxBytes`        | 65536, range 1024–1048576                                    | Per-category processing bound; string stores count UTF-16 code units, cache bodies count bytes                                 |
| `storage.retention`       | `observe`                                                    | Retained markers are INCONCLUSIVE observations. `forbid` makes a confirmed retention-policy mismatch FAIL/low                  |

Relative paths start with `/` and cannot use protocol-relative syntax, backslashes, newlines, or fragments. Query values are omitted from reported routes. Use non-sensitive route paths and synthetic markers. Keep identity markers stable and unique. Pass options select only scenarios enabled in the loaded configuration; fix configuration prerequisites rather than expecting absent accounts/probes to be invented.

## Advanced authentication hooks

```ts
import { defineConfig } from 'authresidue';

// Inside your configuration:
// auth: {
//   hooks: {
//     async login({ page, account, credentials }) {
//       await page.getByLabel('Test email').fill(credentials.email);
//       await page.getByLabel('Test password').fill(credentials.password);
//       await page.getByRole('button', { name: 'Continue' }).click();
//     },
//     async logout({ page, account }) {
//       await page.getByRole('button', { name: 'Account menu' }).click();
//       await page.getByRole('button', { name: 'Sign out' }).click();
//     },
//   },
// }
```

The engine navigates to loginPath first and still verifies the exact configured identity after the login hook. Hooks receive `page` and identity key `a`/`b`; login also receives memory-only email/password credentials. Hooks must perform normal authorized authentication only, avoid logging secrets, honor page closure on cancellation, and avoid external processes or unrelated network requests. They are not sandboxed. Hook errors become sanitized INCONCLUSIVE results. Hooks do not add bearer-token support to GET probes; those replay only cookies.

API successful controls require 2xx, an untruncated non-redirect response, and the account's private canary. A configured denial requires a matching denied status, no configured private markers, and no truncation/redirect/unsupported content encoding. Probes request identity encoding; servers that return compressed bodies despite that request produce INCONCLUSIVE observations. A 200 public/login response with no reliable marker is INCONCLUSIVE. Use CSS selectors for identity and private-marker assertions. UI assertions inspect visible innerText in configured selectors; hidden text, shadow DOM in the private-marker polling helper, canvas, images, and nontext private data are outside coverage.

The programmatic `run(config, options)` API returns a validated sanitized RunResult and performs no report or terminal writes. Options: `headless` (true), `signal`, `environment` (process.env), `onProgress({scenario,state})`. Use `writeReports`, `renderHTML`, `exitCode`, and the exported schemas separately. The CLI applies report paths and signal handlers around this API.
