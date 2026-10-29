import http from 'node:http';
import net from 'node:net';
import type { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import { launchControlledBrowser } from '../../src/browser/launcher.js';
import { startOriginProxy } from '../../src/browser/origin-proxy.js';
import { navigate } from '../../src/browser/navigation.js';
import { validateConfig } from '../../src/config/schema.js';
import { fixtureConfig } from '../fixtures/config.js';

const servers: net.Server[] = [];
const sockets = new Set<Socket>();
const cleanup: (() => Promise<void>)[] = [];
async function listen(server: net.Server): Promise<string> {
  servers.push(server);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture port unavailable');
  return `http://127.0.0.1:${address.port}`;
}
function configFor(origin: string) {
  return validateConfig({ ...fixtureConfig(origin), scenarios: ['logout-ui'] });
}
async function browserFor(origin: string) {
  const controlled = await launchControlledBrowser(configFor(origin));
  cleanup.push(controlled.close);
  // Omit Playwright routing deliberately: these tests prove the transport guard itself.
  const context = await controlled.browser.newContext({
    serviceWorkers: 'block',
  });
  return context.newPage();
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map((close) => close()));
  for (const socket of sockets) socket.destroy();
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

describe('browser origin guard', () => {
  it('closes the loopback listener when Chromium cannot launch', async () => {
    const created = vi.spyOn(http, 'createServer');
    vi.spyOn(chromium, 'launch').mockRejectedValue(
      new Error('SYNTHETIC_LAUNCH_FAILURE'),
    );
    await expect(
      launchControlledBrowser(configFor('http://127.0.0.1:3000')),
    ).rejects.toMatchObject({ code: 'CHROMIUM' });
    const result = created.mock.results.at(-1);
    expect(result?.type).toBe('return');
    if (result?.type !== 'return')
      throw new Error('No origin guard listener was created');
    if (result.value.listening) servers.push(result.value);
    expect(result.value.listening).toBe(false);
  });
  it('blocks an unapproved destination after multiple allowed HTTP redirect hops (regression)', async () => {
    let targetRequests = 0;
    const target = await listen(
      http.createServer((_request, response) => {
        targetRequests++;
        response.end('UNAPPROVED_ORIGIN');
      }),
    );
    const source = await listen(
      http.createServer((request, response) => {
        response.writeHead(302, {
          Location: request.url === '/start' ? '/hop' : target,
        });
        response.end();
      }),
    );
    const page = await browserFor(source);
    const response = await page.goto(`${source}/start`);
    expect(response?.status()).toBe(403);
    expect(targetRequests).toBe(0);
    await expect(navigate(page, '/start', configFor(source))).rejects.toThrow(
      'outside explicitly allowed',
    );
    expect(targetRequests).toBe(0);
  });
  it('preserves allowed redirects, response cookies and browser URL behavior', async () => {
    let cookieReceived = false;
    const source = await listen(
      http.createServer((request, response) => {
        if (request.url === '/start') {
          response.writeHead(303, {
            Location: '/dashboard',
            'Set-Cookie':
              'fixture=SYNTHETIC_ONLY; Path=/; HttpOnly; SameSite=Lax',
          });
          response.end();
        } else {
          cookieReceived =
            request.headers.cookie?.includes('fixture=SYNTHETIC_ONLY') ?? false;
          response.end('ALLOWED_REDIRECT_COMPLETE');
        }
      }),
    );
    const page = await browserFor(source);
    await page.goto(`${source}/start`);
    expect(page.url()).toBe(`${source}/dashboard`);
    expect(await page.textContent('body')).toBe('ALLOWED_REDIRECT_COMPLETE');
    expect(cookieReceived).toBe(true);
  });
  it('blocks redirects issued by a dedicated web worker before the unapproved server receives anything', async () => {
    let targetRequests = 0;
    const target = await listen(
      http.createServer((_request, response) => {
        targetRequests++;
        response.end('UNAPPROVED_ORIGIN');
      }),
    );
    const source = await listen(
      http.createServer((request, response) => {
        if (request.url === '/worker.js') {
          response.setHeader('Content-Type', 'application/javascript');
          response.end(
            "fetch('/redirect').then(r=>postMessage(r.ok?'unexpected':'blocked')).catch(()=>postMessage('blocked'));",
          );
        } else if (request.url === '/redirect') {
          response.writeHead(302, { Location: target });
          response.end();
        } else response.end('<!doctype html><title>Worker fixture</title>');
      }),
    );
    const page = await browserFor(source);
    await page.goto(source);
    const result = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const worker = new Worker('/worker.js');
          worker.onmessage = (event: MessageEvent<string>) => {
            resolve(event.data);
            worker.terminate();
          };
          worker.onerror = () => {
            worker.terminate();
            reject(new Error('Worker failed'));
          };
        }),
    );
    expect(result).toBe('blocked');
    expect(targetRequests).toBe(0);
  });
  it('rejects HTTPS CONNECT for unapproved origins before establishing a target connection', async () => {
    let targetConnections = 0;
    const targetServer = net.createServer();
    targetServer.on('connection', () => targetConnections++);
    const target = await listen(targetServer);
    const source = await listen(
      http.createServer((_request, response) =>
        response.end('Allowed fixture'),
      ),
    );
    const page = await browserFor(source);
    await expect(
      page.goto(target.replace('http:', 'https:'), { timeout: 5000 }),
    ).rejects.toThrow();
    expect(targetConnections).toBe(0);
  });
  it('streams an authorized CONNECT tunnel and closes resources idempotently', async () => {
    const target = await listen(
      net.createServer((socket) =>
        socket.on('data', (chunk: Buffer) => socket.write(chunk)),
      ),
    );
    const origin = target.replace('http:', 'https:');
    const guard = await startOriginProxy(configFor(origin));
    cleanup.push(guard.close);
    const proxy = new URL(guard.settings.server);
    const client = net.createConnection({
      host: proxy.hostname,
      port: Number(proxy.port),
    });
    sockets.add(client);
    client.once('close', () => sockets.delete(client));
    await once(client, 'connect');
    const established = readUntil(client, '\r\n\r\n');
    client.write(
      `CONNECT ${new URL(target).host} HTTP/1.1\r\nHost: ${new URL(target).host}\r\n\r\n`,
    );
    expect(await established).toContain('200 Connection Established');
    const echoed = readUntil(client, 'SYNTHETIC_TUNNEL_PAYLOAD');
    client.write(
      Buffer.concat([
        Buffer.from([0x16, 0x03, 0x03, 0, 0]),
        Buffer.from('SYNTHETIC_TUNNEL_PAYLOAD'),
      ]),
    );
    expect(await echoed).toContain('SYNTHETIC_TUNNEL_PAYLOAD');
    const closed = once(client, 'close', { signal: AbortSignal.timeout(5000) });
    await guard.close();
    await guard.close();
    await closed;
    expect(client.destroyed || client.readableEnded).toBe(true);
  });
  it.each(['http', 'https'] as const)(
    'does not let CONNECT confuse %s with the other scheme at the same authority',
    async (scheme) => {
      let connections = 0;
      const server = net.createServer();
      server.on('connection', () => connections++);
      const target = await listen(server);
      const origin = target.replace('http:', `${scheme}:`);
      const guard = await startOriginProxy(configFor(origin));
      cleanup.push(guard.close);
      const proxy = new URL(guard.settings.server);
      const client = net.createConnection({
        host: proxy.hostname,
        port: Number(proxy.port),
      });
      sockets.add(client);
      client.once('close', () => sockets.delete(client));
      await once(client, 'connect');
      const established = readUntil(client, '\r\n\r\n');
      client.write(
        `CONNECT ${new URL(target).host} HTTP/1.1\r\nHost: ${new URL(target).host}\r\n\r\n`,
      );
      expect(await established).toContain('200');
      const closed = once(client, 'close', {
        signal: AbortSignal.timeout(5000),
      });
      client.write(
        scheme === 'http'
          ? Buffer.from([0x16, 0x03, 0x03, 0, 0])
          : `GET / HTTP/1.1\r\nHost: ${new URL(target).host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
      );
      await closed;
      expect(connections).toBe(0);
    },
  );
  it('supports allowed WebSocket upgrades and blocks unapproved WebSocket connections', async () => {
    let upgrades = 0;
    const sourceServer = http.createServer((_request, response) =>
      response.end('<!doctype html><title>Socket fixture</title>'),
    );
    sourceServer.on('upgrade', (request, socket) => {
      upgrades++;
      const key = request.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }
      const accept = createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );
    });
    const source = await listen(sourceServer);
    let unapprovedConnections = 0;
    const targetServer = net.createServer();
    targetServer.on('connection', () => unapprovedConnections++);
    const target = await listen(targetServer);
    const page = await browserFor(source);
    await page.goto(source);
    const connects = (url: string) =>
      page.evaluate(
        (target) =>
          new Promise<boolean>((resolve) => {
            const socket = new WebSocket(target);
            socket.onopen = () => {
              socket.close();
              resolve(true);
            };
            socket.onerror = () => resolve(false);
          }),
        url,
      );
    expect(await connects(source.replace('http:', 'ws:'))).toBe(true);
    expect(upgrades).toBe(1);
    expect(await connects(target.replace('http:', 'ws:'))).toBe(false);
    expect(unapprovedConnections).toBe(0);
  });
});

function readUntil(socket: Socket, marker: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    const finish = (error?: Error) => {
      clearTimeout(timer);
      socket.off('data', data);
      socket.off('error', failed);
      if (error) reject(error);
      else resolve(text);
    };
    const data = (chunk: Buffer) => {
      text += chunk.toString();
      if (text.includes(marker)) finish();
      else if (text.length > 4096)
        finish(new Error('Fixture tunnel exceeded bounds'));
    };
    const failed = () => finish(new Error('Fixture tunnel failed'));
    const timer = setTimeout(
      () => finish(new Error('Fixture tunnel deadline exceeded')),
      5000,
    );
    socket.on('data', data);
    socket.once('error', failed);
  });
}
