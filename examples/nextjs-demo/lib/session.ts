import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

export const modes = [
  'secure',
  'cache-leak',
  'broken-logout',
  'public-api',
  'stale-tab',
] as const;
export type Mode = (typeof modes)[number];
export type Identity = 'a' | 'b';
const memory = globalThis as typeof globalThis & {
  authresidueDemoSessions?: Map<
    string,
    { identity: Identity; expires: number }
  >;
};
const sessions = (memory.authresidueDemoSessions ??= new Map());
export const cookieName = 'authresidue_demo_session';
export function demoMode(): Mode {
  const value = process.env.AUTHRESIDUE_DEMO_MODE ?? 'secure';
  if (!modes.includes(value as Mode))
    throw new Error(
      'Invalid AUTHRESIDUE_DEMO_MODE. See the local demo README.',
    );
  return value as Mode;
}
export function account(identity: Identity) {
  return identity === 'a'
    ? {
        name: 'Alice',
        canary: 'A_PRIVATE_CANARY_001',
        project: 'Alice test workspace',
        number: 'SYNTHETIC-A-001',
      }
    : {
        name: 'Bob',
        canary: 'B_PRIVATE_CANARY_002',
        project: 'Bob test workspace',
        number: 'SYNTHETIC-B-002',
      };
}
export function authenticate(
  email: string,
  password: string,
): Identity | undefined {
  for (const identity of ['a', 'b'] as const) {
    const prefix = `AUTHRESIDUE_${identity.toUpperCase()}`;
    const expectedEmail = process.env[`${prefix}_EMAIL`];
    const expectedPassword = process.env[`${prefix}_PASSWORD`];
    if (
      expectedEmail &&
      expectedPassword &&
      email === expectedEmail &&
      password === expectedPassword
    )
      return identity;
  }
  return undefined;
}
export function createSession(identity: Identity): string {
  for (const [id, session] of sessions)
    if (session.expires < Date.now()) sessions.delete(id);
  const id = randomUUID();
  sessions.set(id, { identity, expires: Date.now() + 30 * 60 * 1000 });
  return id;
}
export async function currentIdentity(): Promise<Identity | undefined> {
  const id = (await cookies()).get(cookieName)?.value;
  if (!id) return undefined;
  const session = sessions.get(id);
  if (!session || session.expires < Date.now()) {
    sessions.delete(id);
    return undefined;
  }
  return session.identity;
}
export async function revokeSession(): Promise<void> {
  const id = (await cookies()).get(cookieName)?.value;
  if (id && demoMode() !== 'broken-logout') sessions.delete(id);
}
/** Next's internal request URL can use localhost even when the public Host is 127.0.0.1. */
export function localOrigin(request: Request): string | undefined {
  const host = request.headers.get('host');
  if (!host) return undefined;
  try {
    const url = new URL(`http://${host}`);
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.host !== host ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
export function localRequest(request: Request): boolean {
  const origin = localOrigin(request);
  return (
    origin !== undefined &&
    (!request.headers.get('origin') || request.headers.get('origin') === origin)
  );
}
