# AuthResidue engineering rules

- Read `CONTRIBUTING.md` and `docs/architecture.md` before continuing work. Keep public documentation and validation claims accurate. Local implementation notes, if present, are not publication inputs.
- Use strict TypeScript, ESM, Node 22+ (CI uses LTS 22 and 24), npm, and Chromium through Playwright.
- Keep the programmatic engine independent of CLI output. Scenarios run sequentially in fresh contexts; account transitions deliberately share a context.
- Never infer authentication or exposure from HTTP status alone. Require configured synthetic identity markers and validated positive controls. A missing baseline is INCONCLUSIVE, never PASS.
- Persist allowlisted assertion metadata only. Never serialize browser state, cookies, headers, response bodies, passwords, raw errors, traces, or screenshots.
- Explicit allowed origins apply to browser requests, redirects, and GET probes. Configuration and advanced hooks are trusted executable code, not a sandbox.
- Engine and doctor browsers must use launchControlledBrowser. Browser request routing skips redirect hops; the private loopback proxy enforces each network destination.
- Probes are GET only. Normal configured UI authentication may mutate test sessions. Use only authorized, synthetic accounts.
- Never retry a failed security assertion. Only navigation transport failures may be retried, before authentication.
- Do not publish, deploy, commit, or push without user authorization. Never expose intentionally vulnerable fixtures publicly.
- Every engine bug fix needs a regression test. Run typecheck, lint, format check, tests, build, and package verification before release claims.
- No telemetry, external report assets, mandatory cloud, or runtime AI services.
