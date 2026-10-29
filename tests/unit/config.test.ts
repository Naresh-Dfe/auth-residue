import { describe, expect, it } from 'vitest';
import {
  validateConfig,
  resolveCredentials,
  SetupError,
} from '../../src/config/schema.js';
import { authorizedURL } from '../../src/browser/network.js';
import { fixtureConfig, testEnvironment } from '../fixtures/config.js';

describe('configuration', () => {
  it('applies defaults without inventing accounts or assertions', () => {
    const config = validateConfig(fixtureConfig());
    expect(config.auth.loginPath).toBe('/login');
    expect(config.storage.retention).toBe('observe');
    expect(config.retry.navigation).toBe(0);
  });
  it('resolves environment references without modifying configuration', () => {
    const config = validateConfig(fixtureConfig());
    expect(resolveCredentials(config, testEnvironment).a?.email).toBe(
      testEnvironment.AUTHRESIDUE_A_EMAIL,
    );
    expect(JSON.stringify(config)).not.toContain(
      testEnvironment.AUTHRESIDUE_A_PASSWORD,
    );
  });
  it('reports missing environment names without values', () => {
    expect(() =>
      resolveCredentials(validateConfig(fixtureConfig()), {}),
    ).toThrow('AUTHRESIDUE_A_EMAIL');
  });
  it('rejects missing second accounts before browser startup', () => {
    const config = fixtureConfig();
    delete config.accounts.b;
    expect(() => validateConfig(config)).toThrow('second synthetic account');
  });
  it('allows A-only scenarios when selected', () => {
    const config = fixtureConfig();
    delete config.accounts.b;
    config.scenarios = ['logout-session'];
    expect(validateConfig(config).scenarios).toEqual(['logout-session']);
  });
  it.each(['POST', 'DELETE', 'PATCH', 'PUT'])(
    'rejects %s API probes',
    (method) => {
      expect(() =>
        validateConfig({
          ...fixtureConfig(),
          probes: [{ path: '/api/private', method }],
        }),
      ).toThrow();
    },
  );
  it('requires configured probes for replay', () => {
    expect(() => validateConfig({ ...fixtureConfig(), probes: [] })).toThrow(
      'read-only GET',
    );
  });
  it('rejects unapproved origins and URL credentials', () => {
    expect(() =>
      validateConfig({
        ...fixtureConfig(),
        allowedOrigins: ['http://example.invalid'],
      }),
    ).toThrow('authorize');
    expect(() =>
      validateConfig({
        ...fixtureConfig(),
        baseURL: 'http://secret@127.0.0.1:3000',
      }),
    ).toThrow();
  });
  it.each([
    '//evil.invalid',
    '/\\evil.invalid',
    'https://evil.invalid',
    '/path#fragment',
  ])('rejects unsafe route %s', (path) => {
    expect(() =>
      validateConfig({ ...fixtureConfig(), routes: [{ path }] }),
    ).toThrow();
  });
  it('rejects overlapping canaries and repeated scenarios', () => {
    const config = fixtureConfig();
    config.accounts.b!.privateMarker = 'A_PRIVATE_CANARY_001_suffix';
    expect(() => validateConfig(config)).toThrow('contain each other');
    expect(() =>
      validateConfig({
        ...fixtureConfig(),
        scenarios: ['logout-ui', 'logout-ui'],
      }),
    ).toThrow('only once');
  });
  it('rejects unknown fields and hardcoded credential properties', () => {
    expect(() =>
      validateConfig({ ...fixtureConfig(), password: 'bad' }),
    ).toThrow(SetupError);
  });
  it('enforces origins for runtime URLs including encoded authority tricks', () => {
    const config = validateConfig(fixtureConfig());
    expect(authorizedURL('/dashboard', config).origin).toBe(config.baseURL);
    for (const url of [
      'http://evil.invalid',
      'file:///etc/passwd',
      'http://user:pass@127.0.0.1:3000',
      '//evil.invalid',
    ])
      expect(() => authorizedURL(url, config)).toThrow(SetupError);
  });
  it('bounds timeouts and inspection budgets', () => {
    expect(() =>
      validateConfig({ ...fixtureConfig(), timeouts: { scenario: 0 } }),
    ).toThrow();
  });
});
