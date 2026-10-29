# Contributing

Use Node 22+ (24 LTS recommended), npm, and Playwright Chromium. Read [AGENTS.md](AGENTS.md) and [architecture](docs/architecture.md). All dependencies and the project are open source. No paid accounts or APIs are needed.

```sh
npm ci
npm run demo:install
npx playwright install chromium
npm run build
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npm run test:integration
npm run test:e2e
npm run audit:release
npm run verify:package
```

On Linux, install Chromium's system dependencies through Playwright as needed. Windows PowerShell users can use npm.cmd/npx.cmd. `npm run format` applies formatting. Root `npm test` runs all suites, including the Next.js production build. Never use arbitrary sleeps to make tests pass; poll actual readiness with bounded deadlines. Do not run intentionally vulnerable fixtures on a public interface.

Git checks text files out with LF line endings on every platform, matching Prettier. After pulling the line-ending policy into an existing Windows checkout, run `npm run format` if local files still have CRLF endings.

Dependabot proposes monthly npm minor and patch version updates. Routine npm major version updates are deferred for a separate compatibility review; security updates are unaffected by this version-update rule. Check peer dependency ranges and the Node 22/24 CI matrix before upgrading major versions. The current TypeScript ESLint parser requires TypeScript below 6.1, so a TypeScript 7 upgrade needs a compatible parser first. GitHub Actions updates are reviewed separately.

For a scenario, document its scope and prerequisites, establish a reliable positive identity/private-data control, implement the smallest shared engine change, and add corrected plus deliberately broken fixture coverage. Add unit tests for classification, limits, and configuration. Every engine bug fix requires a regression test. A missing baseline must never become PASS. Avoid adding dependencies or global abstractions for one check.

Use synthetic values only in tests. Never submit real sessions, passwords, production screenshots, full response bodies, or authenticated storage files. Review sanitized report output before attaching it. Keep engine logic independent of presentation. Test packaged entry points as well as source modules.

Pull requests should describe the concrete behavior change, evidence and limitations, and actual checks run. Do not claim test results or platform coverage you did not execute. Update relevant guides and CHANGELOG.md. Do not commit local implementation notes, browser binaries, tarballs, reports, node_modules, .env files, editor settings, or build output.

Tests and scripts are developer references and CI resources; none ship in the npm package. Use only clearly synthetic fixtures and reserved example domains. Release preparation is described in [the checklist](docs/release-checklist.md). No automatic npm publication or deployment is configured.
