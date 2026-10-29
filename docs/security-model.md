# Security model

AuthResidue executes authorized synthetic identity transitions. It is not a general vulnerability scanner or a guarantee of application security. A configured synthetic marker appearing at an unauthorized boundary is evidence for that assertion; absence only covers the selected observation.

## Trust boundaries

- Configuration and hooks are trusted executable local code. Do not run configurations from untrusted repositories. Allowed origins are not a sandbox for hooks or Node imports.
- Application DOM, responses, storage, and saved report strings are untrusted. Reports escape all text and never execute embedded result markup.
- Credentials, session cookies, response bodies, and browser state are memory-only. Collector evidence is an allowlist of booleans, counts, phases, synthetic identity keys, safe metadata, and route paths.
- Browser page HTTP(S) requests, redirects, dedicated-worker fetches, and WebSockets are restricted by exact configured origins. Chromium request routing does not intercept every redirect hop, so every engine/doctor browser also uses an ephemeral proxy bound to 127.0.0.1. The proxy checks each HTTP destination and CONNECT authority; it distinguishes TLS from plain WebSocket upgrades before connecting. TLS passes through without decryption. HTTP/2 and QUIC are disabled to avoid origin coalescing inside opaque tunnels. Service workers are blocked. Explicit native GET probes validate the same allowed origins and follow no redirects. This is not an operating-system firewall, DNS pinning, or process sandbox; trusted hooks can start unrelated requests outside the browser.
- Normal form/hook login and logout may mutate test-session state. Probe methods are restricted to GET, but a misdesigned application can mutate on GET; authorize endpoints accordingly.

## Data handling

Do not use production accounts or real personal information. Supply environment variable names in configuration. Raw Playwright errors are withheld because they may include locators, typed credentials, URLs, and page content. The CLI reports safe stage/setup explanations instead. No screenshots, traces, authenticated storage-state files, response dumps, token values, cookie names/values, or database names are exported by default or through an undocumented switch.

Generated directories request POSIX mode 0700 and files request 0600. Windows ACLs remain governed by the filesystem; the tool does not promise equivalent Unix permissions on Windows. Reports are potentially sensitive metadata: application origin, path, selected checks, and timing remain visible. Restrict local access and explicitly review artifact upload settings. Output files are replaced by sibling temporary-file renames; use a dedicated directory and avoid directories controlled by another user.

The core and CLI perform no telemetry. Dependency/browser installation contacts public registries/CDNs; application tests contact explicitly configured targets. Next.js demo launch scripts disable Next.js telemetry. No report makes network calls.

## Findings and interpretation

FAIL means a configured assertion mismatch was observed, not that all possible attack paths were verified. High impact is reserved for private-canary exposure through a tested identity or GET boundary; medium describes private UI/history/reloaded-tab exposure; low describes an explicit storage retention policy mismatch. Retention without a forbid policy is INCONCLUSIVE with no security severity. An unchanged old tab is also observational until reload or a separate GET demonstrates access.

False negatives can result from insufficient canaries/selectors, delayed content beyond the observation, unsupported auth mechanisms, data outside the configured routes/stores, real service worker behavior, shadow DOM/canvas, or intermittent races. False positives can result from a synthetic canary deliberately appearing in public data or an incorrect configured denial/retention expectation. Check reproduction steps and positive controls before treating a finding as a vulnerability.

Cookie replay is intentionally stronger than checking whether the current browser cookie jar was cleared: it checks former cookies against the server. It does not extract bearer tokens from arbitrary scripts, verify cryptographic session implementation, simulate a hostile OS, or automate permission changes. No CWE mapping is invented.
