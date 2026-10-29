import { z } from 'zod';
import type { Page } from 'playwright';

export const scenarioIds = [
  'logout-ui',
  'logout-session',
  'account-switch',
  'protected-routes',
  'protected-api',
  'stale-tab',
  'storage-isolation',
] as const;
export type ScenarioId = (typeof scenarioIds)[number];
export type AccountId = 'a' | 'b';

const text = z.string().min(1).max(256);
const path = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) =>
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !/[\\\r\n#]/.test(value),
    'Use an application-relative path starting with /; no fragments, backslashes, or protocol-relative URLs.',
  );
const origin = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.origin === value
    );
  }, 'Use an exact http(s) origin, with no credentials, path, query, or trailing slash.');
const envReference = z
  .string()
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    'Use an environment variable name, never its secret value.',
  );
const account = z
  .object({
    emailEnv: envReference,
    passwordEnv: envReference,
    identity: text,
    privateMarker: text,
  })
  .strict();

export interface HookContext {
  page: Page;
  account: AccountId;
  /** Credentials are memory-only. Never log or persist them. */
  credentials: { email: string; password: string };
}
export interface AuthHooks {
  login?: (context: HookContext) => Promise<void>;
  logout?: (context: Omit<HookContext, 'credentials'>) => Promise<void>;
}

export const configSchema = z
  .object({
    baseURL: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === '/'
        );
      }, 'Use an http(s) application origin without credentials, query, or a path.'),
    allowedOrigins: z.array(origin).min(1).max(20),
    auth: z
      .object({
        loginPath: path.default('/login'),
        emailSelector: text.default('[name="email"]'),
        passwordSelector: text.default('[name="password"]'),
        submitSelector: text.default('button[type="submit"]'),
        logoutSelector: text.default('[data-testid="logout"]'),
        identitySelector: text.default('[data-testid="identity"]'),
        anonymousSelector: text.default('[data-testid="login-form"]'),
        authenticatedPath: path.default('/dashboard'),
        hooks: z
          .custom<AuthHooks>(
            (value) =>
              value !== null &&
              typeof value === 'object' &&
              Object.entries(value).every(
                ([key, fn]) =>
                  ['login', 'logout'].includes(key) && typeof fn === 'function',
              ),
            'hooks must contain only login/logout functions.',
          )
          .optional(),
      })
      .strict()
      .prefault({}),
    accounts: z.object({ a: account, b: account.optional() }).strict(),
    privateSelectors: z.array(text).min(1).default(['[data-testid="private"]']),
    routes: z
      .array(
        z
          .object({
            path,
            privateSelectors: z.array(text).min(1).optional(),
            readySelector: text.optional(),
          })
          .strict(),
      )
      .max(40)
      .default([{ path: '/dashboard' }]),
    probes: z
      .array(
        z
          .object({
            path,
            method: z.literal('GET').default('GET'),
            deniedStatuses: z
              .array(z.number().int().min(100).max(599))
              .min(1)
              .default([401, 403]),
            maxBytes: z.number().int().min(128).max(1048576).default(65536),
          })
          .strict(),
      )
      .max(20)
      .default([]),
    scenarios: z
      .array(z.enum(scenarioIds))
      .min(1)
      .default([...scenarioIds]),
    timeouts: z
      .object({
        action: z.number().int().min(100).max(120000).default(10000),
        navigation: z.number().int().min(100).max(120000).default(15000),
        scenario: z.number().int().min(1000).max(600000).default(90000),
      })
      .strict()
      .prefault({}),
    retry: z
      .object({ navigation: z.number().int().min(0).max(2).default(0) })
      .strict()
      .prefault({}),
    reports: z
      .object({
        outputDir: z.string().min(1).default('authresidue-output'),
        html: z.boolean().default(true),
      })
      .strict()
      .prefault({}),
    storage: z
      .object({
        localStorage: z.boolean().default(true),
        sessionStorage: z.boolean().default(true),
        cookies: z.boolean().default(true),
        indexedDB: z.boolean().default(false),
        cacheStorage: z.boolean().default(false),
        maxEntries: z.number().int().min(1).max(1000).default(100),
        maxBytes: z.number().int().min(1024).max(1048576).default(65536),
        retention: z.enum(['observe', 'forbid']).default('observe'),
      })
      .strict()
      .prefault({}),
  })
  .strict()
  .superRefine((config, context) => {
    const add = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (!config.allowedOrigins.includes(new URL(config.baseURL).origin))
      add(
        'allowedOrigins',
        'Explicitly authorize baseURL by adding its exact origin.',
      );
    if (new Set(config.scenarios).size !== config.scenarios.length)
      add('scenarios', 'Select each scenario only once.');
    const needsB = config.scenarios.some((id) =>
      ['account-switch', 'protected-routes', 'protected-api'].includes(id),
    );
    if (needsB && !config.accounts.b)
      add(
        'accounts.b',
        'This scenario checks identity B. Configure a distinct second synthetic account.',
      );
    if (
      config.accounts.b &&
      (config.accounts.a.identity === config.accounts.b.identity ||
        config.accounts.a.privateMarker === config.accounts.b.privateMarker ||
        config.accounts.a.emailEnv === config.accounts.b.emailEnv)
    )
      add(
        'accounts',
        'A and B need distinct identity markers, private markers, and email environment references.',
      );
    const markers = [
      config.accounts.a.privateMarker,
      config.accounts.b?.privateMarker,
    ].filter((value): value is string => value !== undefined);
    if (
      markers.length === 2 &&
      (markers[0]!.includes(markers[1]!) || markers[1]!.includes(markers[0]!))
    )
      add('accounts', 'Private markers must not contain each other.');
    if (
      config.scenarios.some((id) =>
        [
          'logout-ui',
          'protected-routes',
          'account-switch',
          'stale-tab',
          'storage-isolation',
        ].includes(id),
      ) &&
      config.routes.length === 0
    )
      add(
        'routes',
        'UI and storage checks need at least one configured private view.',
      );
    if (
      config.scenarios.some((id) =>
        ['logout-session', 'protected-api'].includes(id),
      ) &&
      config.probes.length === 0
    )
      add(
        'probes',
        'Session replay/API scenarios need an explicitly configured read-only GET probe.',
      );
  });

export type ConfigInput = z.input<typeof configSchema>;
export type Config = z.output<typeof configSchema>;
export function defineConfig(config: ConfigInput): ConfigInput {
  return config;
}

export class SetupError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SetupError';
  }
}

export function validateConfig(input: unknown): Config {
  const result = configSchema.safeParse(input);
  if (!result.success)
    throw new SetupError(
      'CONFIG',
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
        .join('\n'),
    );
  return result.data;
}

export function resolveCredentials(
  config: Config,
  environment: NodeJS.ProcessEnv = process.env,
): Record<AccountId, { email: string; password: string } | undefined> {
  const resolved: Record<
    AccountId,
    { email: string; password: string } | undefined
  > = { a: undefined, b: undefined };
  for (const id of ['a', 'b'] as const) {
    const definition = config.accounts[id];
    if (!definition) continue;
    const email = environment[definition.emailEnv];
    const password = environment[definition.passwordEnv];
    if (!email || !password)
      throw new SetupError(
        'ENV',
        `Set required environment variables ${definition.emailEnv} and ${definition.passwordEnv}. Values are never printed.`,
      );
    if (
      email.includes('\r') ||
      email.includes('\n') ||
      password.includes('\r') ||
      password.includes('\n')
    )
      throw new SetupError('ENV', 'Credentials must not contain line breaks.');
    resolved[id] = { email, password };
  }
  return resolved;
}
