# Local identity-transition demonstration

This Next.js App Router app is a controlled synthetic fixture, not production authentication. It binds to 127.0.0.1, uses expiring memory-only sessions, and has no database/provider. Never expose its intentionally vulnerable modes publicly. Restarting the process clears every session. Supplied scripts set NEXT_TELEMETRY_DISABLED=1.

From the repository root:

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

Open http://127.0.0.1:3000. In a second terminal export the same four variables, then run:

```powershell
node dist/cli/main.js doctor --config examples/nextjs-demo/authresidue.config.ts
node dist/cli/main.js test --config examples/nextjs-demo/authresidue.config.ts
node dist/cli/main.js report authresidue-output/results.json
```

Replace the password placeholders with your own test-only values and use the same values in both terminals. For POSIX shells use `export AUTHRESIDUE_A_EMAIL='alice@authresidue.invalid'` and similarly export the other variables; use npm/npx. Never use real accounts or production credentials. .env.example documents references but AuthResidue does not read Next's .env files automatically.

| Mode            | Deliberate behavior                                              | Selected assertion                                                                                    |
| --------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `secure`        | Revoke sessions and clear current-tab caches                     | No verified failures for supported checks; unchanged already-rendered tab content can be INCONCLUSIVE |
| `cache-leak`    | Reuse localStorage private cache without identity partitioning   | account-switch shows A-only private data under B identity                                             |
| `broken-logout` | Clear cookie without deleting the memory session                 | logout-session former-cookie replay returns A canary                                                  |
| `public-api`    | Return A canary to anonymous callers                             | protected-api anonymous check fails                                                                   |
| `stale-tab`     | Reuse tab sessionStorage on the anonymous dashboard after reload | stale-tab reload shows A canary; GET remains correctly denied                                         |

Stop the server, change AUTHRESIDUE_DEMO_MODE, restart, and run a matching scenario with `--scenario account-switch` etc. Modes are process-wide and isolated by a fresh process; AuthResidue uses fresh contexts for independent scenarios. There is no user-accessible endpoint to toggle vulnerability mode.

To test a production build locally:

```sh
npm --prefix examples/nextjs-demo run build
npm --prefix examples/nextjs-demo start
```

`npm run test:e2e` from the repository root builds this app, starts separate loopback processes on ephemeral ports for every mode, and verifies compiled CLI behavior. Test fixtures supply their own synthetic environment and require no manual account setup.
