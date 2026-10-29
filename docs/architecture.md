# Architecture

The distributable is strict TypeScript compiled directly to ESM with declarations. There is no bundler or frontend build for reports. Runtime dependencies are Commander (CLI parsing), Jiti (trusted TS configuration), Zod (runtime contracts), and Playwright (Chromium).

| Module          | Responsibility                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config`    | Input schema, defaults, prerequisite checks, environment references, trusted config loading                                                       |
| `src/core`      | Sequential orchestration, context lifecycle, deadlines/cancellation, versioned results and exit policy                                            |
| `src/browser`   | Allowed-origin routing plus a private loopback proxy/controlled launcher, bounded native GET transport, navigation, marker and storage inspection |
| `src/auth`      | Form/hook login and logout, exact visible identity confirmation                                                                                   |
| `src/scenarios` | Catalog, transition orchestration, and logout/account-switch/stale-tab flows; shared classifications live in src/assertions                       |
| `src/evidence`  | Secondary redaction and route query removal                                                                                                       |
| `src/reporters` | Plain terminal, JSON, offline escaped HTML, input validation and local writes                                                                     |
| `src/cli`       | Options, setup errors, doctor, init template and process signal integration                                                                       |

A private loopback proxy validates browser network destinations across HTTP redirects, dedicated workers, and TLS/WebSocket tunnels. It streams bodies without logging or retention. TLS is not decrypted; HTTP/2 and QUIC are disabled to prevent origin coalescing inside an authorized tunnel. Browser contexts also retain their early request and WebSocket guards. Browser launch failure, cancellation, and final cleanup close the proxy and its sockets.

Each run validates configuration, resolves credential references in memory, checks login-path reachability, launches one Chromium process, and creates fresh contexts sequentially for selected scenarios. A scenario proves anonymous UI availability, authenticates A, confirms its exact identity, and establishes private UI/API positive controls as appropriate. Then it performs logout, replay or B login in the deliberately shared context. Independent contexts prevent state contamination across scenarios.

For API scenarios, anonymous responses are captured in memory before A login but classified only after the authenticated canary control succeeds. Replay uses pre-logout cookies in an isolated context, with only explicitly configured GET probes. Native requests do not automatically redirect or save Set-Cookie, and have bounded payloads and deadlines. Cookie auth replay does not reproduce every browser security attribute or application token refresh mechanism.

One catalog defines scenario names, prerequisites, and limitations. Shared utilities implement identity establishment, private views, bounded GETs, denied access classification, and storage observations. Add a new scenario by extending the schema/catalog and transition dispatcher with a clear positive control, result classification, documentation, and secure/broken deterministic fixture tests. Do not add a new status or weaken controls silently.

The engine uses try/finally to close contexts and the browser. Per-scenario deadlines abort GETs and close contexts. A scenario-local findings buffer prevents late asynchronous completions from modifying an already-returned run. SIGINT/SIGTERM in the CLI abort the engine and preserve partial sanitized results when a browser run was established; startup failures may not produce reports. Trusted hooks must cooperate with browser closure and must not start unmanaged resources.

Persisted evidence is constructed from metadata and booleans, never raw page/response/storage dumps. Known credential values are redacted before schema validation and return. Report readers and renderers validate schema and apply a second generic redaction pass. Findings carry deterministic identifiers, phase, timestamp, impact, sanitized route, reproduction guidance, limitations, and scenario duration. Every finding in a scenario carries that scenario's duration; do not sum finding durations as total time.

HTML is escaped static markup. The only JavaScript is a constant filter implementation using textContent, hidden, and dataset. A SHA-256 CSP authorizes that exact script. There is no data-to-script interpolation, dynamic HTML insertion, remote font, CDN, or reporting server.
