import type { ConfigInput } from '../../src/config/schema.js';

export const testEnvironment = {
  AUTHRESIDUE_A_EMAIL: 'alice@authresidue.invalid',
  AUTHRESIDUE_A_PASSWORD: 'SYNTHETIC_PASSWORD_A_ONLY',
  AUTHRESIDUE_B_EMAIL: 'bob@authresidue.invalid',
  AUTHRESIDUE_B_PASSWORD: 'SYNTHETIC_PASSWORD_B_ONLY',
};
export function fixtureConfig(baseURL = 'http://127.0.0.1:3000'): ConfigInput {
  return {
    baseURL,
    allowedOrigins: [baseURL],
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
    probes: [{ path: '/api/private' }],
    // Shared CI workers need headroom for Chromium actionability and identity readiness.
    // Deadline-specific tests supply their own short limits; assertions are never retried.
    timeouts: { action: 15000, navigation: 15000, scenario: 60000 },
  };
}
