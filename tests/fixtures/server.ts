import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { testEnvironment } from './config.js';

export type Mode =
  | 'secure'
  | 'cache-leak'
  | 'broken-logout'
  | 'public-api'
  | 'stale-tab'
  | 'wrong-identity'
  | 'ambiguous-api'
  | 'encoded-denial';

/** Loopback-only deterministic fixture; never deployed. All data is synthetic. */
export async function startFixture(mode: Mode = 'secure') {
  const sessions = new Map<string, 'a' | 'b'>();
  const issuedSessions: string[] = [];
  const canary = (account: 'a' | 'b') =>
    account === 'a' ? 'A_PRIVATE_CANARY_001' : 'B_PRIVATE_CANARY_002';
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const session = /(?:^|;\s*)authresidue_fixture_session=([^;]+)/.exec(
      request.headers.cookie ?? '',
    )?.[1];
    const account = session ? sessions.get(session) : undefined;
    response.setHeader('Cache-Control', 'no-store');
    const html = (body: string) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        `<!doctype html><html><head><meta charset="utf-8"><title>AuthResidue fixture</title></head><body>${body}</body></html>`,
      );
    };
    const redirect = (location: string) => {
      response.statusCode = 303;
      response.setHeader('Location', location);
      response.end();
    };
    if (path === '/login' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 4096) {
          response.statusCode = 413;
          response.end();
          return;
        }
      }
      const form = new URLSearchParams(body);
      const identity =
        form.get('email') === testEnvironment.AUTHRESIDUE_A_EMAIL &&
        form.get('password') === testEnvironment.AUTHRESIDUE_A_PASSWORD
          ? 'a'
          : form.get('email') === testEnvironment.AUTHRESIDUE_B_EMAIL &&
              form.get('password') === testEnvironment.AUTHRESIDUE_B_PASSWORD
            ? 'b'
            : undefined;
      if (!identity) {
        response.statusCode = 401;
        html('Invalid synthetic credentials');
        return;
      }
      const id = randomUUID();
      sessions.set(id, identity);
      issuedSessions.push(id);
      response.setHeader(
        'Set-Cookie',
        `authresidue_fixture_session=${id}; Path=/; HttpOnly; SameSite=Lax`,
      );
      redirect('/dashboard');
      return;
    }
    if (path === '/logout' && request.method === 'POST') {
      if (session && mode !== 'broken-logout') sessions.delete(session);
      response.setHeader(
        'Set-Cookie',
        'authresidue_fixture_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      );
      response.end('logged out');
      return;
    }
    if (path === '/api/private') {
      response.setHeader('Content-Type', 'application/json');
      if (!account && mode === 'encoded-denial') {
        response.statusCode = 401;
        response.setHeader('Content-Encoding', 'gzip');
        response.end(gzipSync(JSON.stringify({ private: canary('a') })));
        return;
      }
      if (mode === 'ambiguous-api') {
        response.end(
          JSON.stringify({ message: 'No configured private marker' }),
        );
        return;
      }
      if (!account && mode !== 'public-api') {
        response.statusCode = 401;
        response.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      response.end(
        JSON.stringify({
          private: canary(account ?? 'a'),
          password: 'NEVER_EXPORT_RESPONSE_SECRET',
        }),
      );
      return;
    }
    const loginForm = `<form data-testid="login-form" method="post" action="/login"><input name="email" aria-label="Email"><input name="password" type="password" aria-label="Password"><button type="submit">Sign in</button></form>`;
    if (path === '/login') {
      html(loginForm);
      return;
    }
    if (path === '/dashboard') {
      if (!account) {
        if (mode === 'stale-tab')
          html(
            `${loginForm}<div data-testid="private"></div><script>document.querySelector('[data-testid="private"]').textContent=sessionStorage.getItem('stale-private')||''</script>`,
          );
        else redirect('/login');
        return;
      }
      html(`<div data-testid="identity">${mode === 'wrong-identity' ? 'Unknown' : account === 'a' ? 'Alice' : 'Bob'}</div><div data-testid="private">${canary(account)}</div><button data-testid="logout">Log out</button><script>
      const marker=${JSON.stringify(canary(account))};
      ${mode === 'cache-leak' ? `if(!localStorage.getItem('private-cache'))localStorage.setItem('private-cache',marker);document.querySelector('[data-testid="private"]').textContent=localStorage.getItem('private-cache');` : `localStorage.setItem('private-cache',marker);`}
      sessionStorage.setItem('stale-private',marker);
      document.querySelector('[data-testid="logout"]').onclick=async()=>{await fetch('/logout',{method:'POST'});${mode === 'cache-leak' ? '' : "localStorage.removeItem('private-cache');"}sessionStorage.clear();location.href='/login'};
      </script>`);
      return;
    }
    if (path === '/big') {
      response.end('x'.repeat(100000));
      return;
    }
    if (path === '/redirect') {
      response.statusCode = 302;
      response.setHeader('Location', 'http://unapproved.invalid/private');
      response.end();
      return;
    }
    if (path === '/slow') {
      /* Remain pending until transport deadline or cancellation closes the socket. */ return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No fixture address');
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    issuedSessions,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
