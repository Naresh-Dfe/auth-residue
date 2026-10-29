import type { Page } from 'playwright';
import type {
  AccountId,
  Config,
  resolveCredentials,
} from '../config/schema.js';
import { navigate } from '../browser/navigation.js';

export type Credentials = ReturnType<typeof resolveCredentials>;
export async function confirmIdentity(
  page: Page,
  config: Config,
  account: AccountId,
): Promise<void> {
  const expected = config.accounts[account];
  if (!expected) throw new Error('Missing account');
  const identity = page.locator(config.auth.identitySelector);
  await identity.waitFor({ state: 'visible' });
  await page.waitForFunction(
    ({ selector, expected }) =>
      document.querySelector<HTMLElement>(selector)?.innerText.trim() ===
      expected,
    { selector: config.auth.identitySelector, expected: expected.identity },
  );
}

export async function login(
  page: Page,
  config: Config,
  credentials: Credentials,
  account: AccountId,
): Promise<void> {
  const secret = credentials[account];
  if (!secret) throw new Error('Missing credentials');
  await navigate(page, config.auth.loginPath, config);
  if (config.auth.hooks?.login)
    await config.auth.hooks.login({ page, account, credentials: secret });
  else {
    await page.locator(config.auth.emailSelector).fill(secret.email);
    await page.locator(config.auth.passwordSelector).fill(secret.password);
    await page.locator(config.auth.submitSelector).click();
  }
  await confirmIdentity(page, config, account);
}

/** Caller records the anonymous UI assertion separately from server authorization. */
export async function logout(
  page: Page,
  config: Config,
  account: AccountId,
): Promise<boolean> {
  if (config.auth.hooks?.logout)
    await config.auth.hooks.logout({ page, account });
  else await page.locator(config.auth.logoutSelector).click();
  try {
    await page
      .locator(config.auth.anonymousSelector)
      .waitFor({ state: 'visible' });
    return true;
  } catch {
    return false;
  }
}
