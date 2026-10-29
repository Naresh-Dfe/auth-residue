import { defineConfig } from '../../dist/index.js';

export default defineConfig({
  baseURL: 'http://127.0.0.1:3000',
  allowedOrigins: ['http://127.0.0.1:3000'],
  accounts: {
    a: {
      emailEnv: 'AUTHRESIDUE_A_EMAIL',
      passwordEnv: 'AUTHRESIDUE_A_PASSWORD',
      identity: 'Alice',
      privateMarker: 'A_PRIVATE_CANARY_001',
    },
    b: {
      emailEnv: 'AUTHRESIDUE_B_EMAIL',
      passwordEnv: 'AUTHRESIDUE_B_PASSWORD',
      identity: 'Bob',
      privateMarker: 'B_PRIVATE_CANARY_002',
    },
  },
  routes: [{ path: '/dashboard', readySelector: '[data-testid="page-ready"]' }],
  probes: [{ path: '/api/private', deniedStatuses: [401, 403] }],
  timeouts: { action: 15000, navigation: 45000, scenario: 180000 },
  storage: { retention: 'observe' },
});
