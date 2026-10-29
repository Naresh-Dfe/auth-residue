export const template = `import { defineConfig } from 'authresidue';

// Use two distinct synthetic accounts in an application you are authorized to test.
// Create them in your application's test fixtures; do not use production users.
// Export these environment variables in your shell. Never paste secret values here:
// AUTHRESIDUE_A_EMAIL, AUTHRESIDUE_A_PASSWORD, AUTHRESIDUE_B_EMAIL, AUTHRESIDUE_B_PASSWORD
export default defineConfig({
  baseURL: 'http://127.0.0.1:3000',
  // Exact origins only. Add a local auth origin here if the application needs it.
  allowedOrigins: ['http://127.0.0.1:3000'],
  accounts: {
    a: { emailEnv: 'AUTHRESIDUE_A_EMAIL', passwordEnv: 'AUTHRESIDUE_A_PASSWORD', identity: 'Alice', privateMarker: 'A_PRIVATE_CANARY_001' },
    b: { emailEnv: 'AUTHRESIDUE_B_EMAIL', passwordEnv: 'AUTHRESIDUE_B_PASSWORD', identity: 'Bob', privateMarker: 'B_PRIVATE_CANARY_002' },
  },
  auth: {
    loginPath: '/login', authenticatedPath: '/dashboard',
    emailSelector: '[name="email"]', passwordSelector: '[name="password"]',
    submitSelector: 'button[type="submit"]', logoutSelector: '[data-testid="logout"]',
    identitySelector: '[data-testid="identity"]', anonymousSelector: '[data-testid="login-form"]',
  },
  privateSelectors: ['[data-testid="private"]'],
  routes: [{ path: '/dashboard' }],
  // GET only; successful authenticated bodies must contain the account canary.
  probes: [{ path: '/api/private', deniedStatuses: [401, 403] }],
  scenarios: ['logout-ui', 'logout-session', 'account-switch', 'protected-routes', 'protected-api', 'stale-tab', 'storage-isolation'],
  // timeouts: { action: 10000, navigation: 15000, scenario: 90000 },
  // storage: { localStorage: true, sessionStorage: true, cookies: true, retention: 'observe' },
  // IndexedDB and CacheStorage are opt-in bounded inspections. Service workers are blocked.
  reports: { outputDir: 'authresidue-output', html: true },
});
`;
