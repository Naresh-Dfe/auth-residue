import { z } from 'zod';
import { scenarioIds } from '../config/schema.js';

export const statuses = ['PASS', 'FAIL', 'INCONCLUSIVE', 'NOT_TESTED'] as const;
export type Status = (typeof statuses)[number];
export const findingSchema = z
  .object({
    id: z.string().max(100),
    scenarioId: z.enum(scenarioIds),
    scenarioName: z.string().max(100),
    status: z.enum(statuses),
    severity: z.enum(['high', 'medium', 'low', 'none']),
    title: z.string().max(300),
    expected: z.string().max(2000),
    actual: z.string().max(2000),
    evidence: z.record(
      z.string().max(100),
      z.union([z.string().max(1000), z.boolean(), z.number().finite()]),
    ),
    timestamp: z.iso.datetime(),
    route: z.string().max(2048).optional(),
    phase: z.string().max(100),
    reproduction: z.array(z.string().max(500)).max(15),
    remediation: z.string().max(1000),
    limitations: z.array(z.string().max(1000)).max(20),
    durationMs: z.number().nonnegative(),
  })
  .strict()
  .superRefine((finding, context) => {
    if (finding.status !== 'FAIL' && finding.severity !== 'none')
      context.addIssue({
        code: 'custom',
        message: 'Only confirmed failures can have severity.',
      });
  });
export type Finding = z.infer<typeof findingSchema>;
export const resultSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    toolVersion: z.enum(['0.1.0', '0.1.1']),
    runId: z.string().uuid(),
    startedAt: z.iso.datetime(),
    durationMs: z.number().nonnegative(),
    targetOrigin: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          url.origin === value &&
          !url.username &&
          !url.password
        );
      }, 'Expected a sanitized http(s) origin.'),
    environment: z
      .object({
        node: z.string().max(40),
        platform: z.string().max(30),
        browser: z.string().max(100),
      })
      .strict(),
    configuration: z
      .object({
        routeCount: z.number().int().nonnegative(),
        probeCount: z.number().int().nonnegative(),
        actionTimeoutMs: z.number().positive(),
        navigationTimeoutMs: z.number().positive(),
        scenarioTimeoutMs: z.number().positive(),
        storageCategories: z.array(z.string().max(30)).max(5),
        retentionPolicy: z.enum(['observe', 'forbid']),
      })
      .strict(),
    selectedScenarios: z.array(z.enum(scenarioIds)).min(1).max(7),
    findings: z.array(findingSchema).max(10000),
    interrupted: z.boolean(),
    limitations: z.array(z.string().max(1000)).max(30),
  })
  .strict();
export type RunResult = z.infer<typeof resultSchema>;

export function exitCode(
  result: RunResult,
  failOnInconclusive = false,
): 0 | 1 | 2 {
  if (result.findings.some((finding) => finding.status === 'FAIL')) return 1;
  if (
    result.interrupted ||
    !result.findings.some((finding) => finding.status === 'PASS') ||
    (failOnInconclusive &&
      result.findings.some((finding) => finding.status === 'INCONCLUSIVE'))
  )
    return 2;
  return 0;
}

export const reportLimitations = [
  'Browser traffic uses a private loopback origin guard with HTTP/2 and QUIC disabled. Protocol-specific production behavior is not tested.',
  'Passing configured checks does not prove application security. Only selected routes, GET probes, identities, and transitions were tested.',
  'Synthetic marker matching cannot detect unconfigured private data, permission models, or timing-dependent behavior.',
  'Service workers are blocked for network control. Their production behavior and persistence are NOT_TESTED.',
  'Session replay covers former cookies in memory; automatic bearer-token extraction, browser-storage credential replay, hardware-bound credentials, and MFA are unsupported.',
  'Storage inspection is bounded and origin-scoped; inaccessible or oversized data is inconclusive. It is not a full persistence audit.',
];
