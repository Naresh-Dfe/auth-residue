# JSON results 1.0

`resultSchema` and `findingSchema`, exported by the package, are the authoritative executable schema. Unknown fields are rejected. Invalid versions, oversized input files (>20 MiB), corrupt JSON, and malformed findings cannot be rendered by `authresidue report`. Results contain no executable extension fields.

| Run field                          | Contract                                                     |
| ---------------------------------- | ------------------------------------------------------------ |
| `schemaVersion`, `toolVersion`     | `1.0`, `0.1.1`                                               |
| `runId`, `startedAt`, `durationMs` | UUID, UTC ISO timestamp, nonnegative wall-clock milliseconds |
| `targetOrigin`                     | Tested origin; no query or credentials collected             |
| `environment`                      | Node version, platform, Chromium version                     |
| `selectedScenarios`                | Ordered scenario identifiers                                 |
| `findings`                         | Ordered assertion findings, not a security score             |
| `interrupted`                      | Whether a started browser run was aborted                    |
| `limitations`                      | Explicit run-wide coverage limits                            |

The `configuration` object records route/probe counts, action/navigation/scenario deadlines, enabled storage categories, and retention policy. Raw selectors and credential references are omitted.

Version 0.1.1 continues to read and render schema 1.0 reports produced by 0.1.0. The original toolVersion remains visible in regenerated reports.

Each finding contains `id`, `scenarioId`, `scenarioName`, `status`, `severity`, `title`, `expected`, `actual`, `evidence`, `timestamp`, optional `route`, `phase`, `reproduction`, `remediation`, `limitations`, `durationMs`. Evidence values are primitive strings, booleans, or finite numbers. Routes omit query/fragment. A marker match is a boolean; no surrounding private content is stored. Findings with status other than FAIL must have severity none.

```ts
import { readResults, resultSchema, exitCode } from 'authresidue';
const result = await readResults('authresidue-output/results.json');
resultSchema.parse(result);
const verifiedFailures = result.findings.filter(
  (finding) => finding.status === 'FAIL',
);
process.exitCode = exitCode(result, true);
```

Use a run-specific output directory in CI. Tool/schema versions are explicit; consumers should reject unknown schema versions rather than guess. Deterministic finding identifiers permit comparison only when configuration and selected coverage remain equivalent. Reproduction steps describe the configured transition and assertion; exact UI actions live in the trusted project configuration.
