import http from 'node:http';
import https from 'node:https';
import type { BrowserContext } from 'playwright';
import type { Config } from '../config/schema.js';
import { SetupError } from '../config/schema.js';

export function authorizedURL(
  value: string,
  config: Pick<Config, 'baseURL' | 'allowedOrigins'>,
): URL {
  const url = new URL(value, config.baseURL);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !config.allowedOrigins.includes(url.origin)
  )
    throw new SetupError(
      'TARGET',
      'Network target is outside explicitly allowed http(s) origins.',
    );
  return url;
}

export async function restrictContext(
  context: BrowserContext,
  config: Config,
): Promise<void> {
  await context.route('**/*', async (route) => {
    try {
      authorizedURL(route.request().url(), config);
    } catch {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => {
    try {
      authorizedURL(socket.url().replace(/^ws/, 'http'), config);
      socket.connectToServer();
    } catch {
      socket.close();
    }
  });
}

export interface GetResponse {
  status: number;
  body: string;
  truncated: boolean;
  redirected: boolean;
  encoded: boolean;
}

/** Bounded, GET-only transport. Never follows redirects, including same-origin redirects. */
export function boundedGet(
  url: URL,
  options: {
    timeout: number;
    maxBytes: number;
    cookie?: string;
    signal?: AbortSignal;
  },
): Promise<GetResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: GetResponse) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const request = (url.protocol === 'https:' ? https : http).get(
      url,
      {
        headers: {
          Accept: 'application/json,text/plain;q=0.9,*/*;q=0.1',
          'Accept-Encoding': 'identity',
          ...(options.cookie ? { Cookie: options.cookie } : {}),
        },
        ...(options.signal ? { signal: options.signal } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const status = response.statusCode ?? 0;
        const result = (truncated: boolean): GetResponse => ({
          status,
          body: Buffer.concat(chunks).toString('utf8'),
          truncated,
          redirected: status >= 300 && status < 400,
          encoded: Boolean(
            response.headers['content-encoding'] &&
            response.headers['content-encoding'].toLowerCase() !== 'identity',
          ),
        });
        response.on('data', (chunk: Buffer) => {
          const remaining = options.maxBytes - size;
          chunks.push(chunk.subarray(0, Math.max(0, remaining)));
          size += chunk.length;
          if (size > options.maxBytes) {
            finish(result(true));
            response.destroy();
          }
        });
        response.on('end', () => finish(result(false)));
        response.on('error', (error: Error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      },
    );
    const deadline = setTimeout(
      () => request.destroy(new Error('GET deadline exceeded')),
      options.timeout,
    );
    request.on('close', () => clearTimeout(deadline));
    request.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

export async function probe(
  context: BrowserContext,
  config: Config,
  definition: Config['probes'][number],
  signal?: AbortSignal,
): Promise<GetResponse> {
  const url = authorizedURL(definition.path, config);
  const cookies = await context.cookies(url.href);
  return boundedGet(url, {
    timeout: config.timeouts.action,
    maxBytes: definition.maxBytes,
    cookie: cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; '),
    ...(signal ? { signal } : {}),
  });
}

export async function verifyReachable(
  config: Config,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const response = await boundedGet(
      authorizedURL(config.auth.loginPath, config),
      {
        timeout: config.timeouts.navigation,
        maxBytes: 1024,
        ...(signal ? { signal } : {}),
      },
    );
    if (response.status >= 500) throw new Error('Unavailable');
    if (response.redirected) throw new Error('Redirect');
  } catch {
    throw new SetupError(
      'UNREACHABLE',
      'Login URL is unreachable, redirects, or returns a server error. Start the authorized application and configure its directly reachable login path.',
    );
  }
}
