import http from 'node:http';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';
import { once } from 'node:events';
import type { Config } from '../config/schema.js';
import { SetupError } from '../config/schema.js';
import { authorizedURL } from './network.js';

const MAX_CONNECTIONS = 128;
const MAX_UPGRADE_HEADER_BYTES = 16384;

export interface OriginProxy {
  settings: { server: string; bypass: string };
  close: () => Promise<void>;
}

/**
 * Chromium routing skips subsequent HTTP redirect hops. A private loopback
 * proxy checks each actual network destination, including CONNECT and upgrades.
 * Payloads only stream through memory; nothing is logged or retained.
 */
export async function startOriginProxy(config: Config): Promise<OriginProxy> {
  const sockets = new Set<Duplex>();
  const track = (socket: Duplex) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  };
  const headers = (incoming: http.IncomingMessage, target: URL) => {
    const forwarded: http.OutgoingHttpHeaders = {
      ...incoming.headers,
      host: target.host,
    };
    delete forwarded['proxy-authorization'];
    delete forwarded['proxy-connection'];
    return forwarded;
  };
  const httpTarget = (value: string | undefined) => {
    if (!value) throw new Error('Missing proxy destination');
    const target = authorizedURL(value.replace(/^ws:/, 'http:'), config);
    if (target.protocol !== 'http:') throw new Error('HTTPS requires CONNECT');
    return target;
  };
  const server = http.createServer((incoming, outgoing) => {
    let target: URL;
    try {
      target = httpTarget(incoming.url);
    } catch {
      outgoing.writeHead(403);
      outgoing.end('Origin not authorized');
      return;
    }

    const upstream = http.request(
      target,
      {
        method: incoming.method,
        headers: headers(incoming, target),
        timeout: config.timeouts.navigation,
        agent: false,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
        outgoing.once('close', () => response.destroy());
        response.once('error', () => outgoing.destroy());
      },
    );
    upstream.on('socket', track);
    upstream.once('timeout', () =>
      upstream.destroy(new Error('Proxy request deadline')),
    );
    upstream.once('error', () => {
      if (outgoing.destroyed) return;
      if (outgoing.headersSent) {
        outgoing.destroy();
        return;
      }
      outgoing.writeHead(502);
      outgoing.end('Target unavailable');
    });
    incoming.once('aborted', () => upstream.destroy());
    outgoing.once('close', () => upstream.destroy());
    incoming.pipe(upstream);
  });

  const tunnel = (
    client: Duplex,
    target: URL,
    head: Buffer,
    prefix = '',
    acknowledged = false,
  ) => {
    const upstream = connect({
      host: target.hostname.replace(/^\[|\]$/g, ''),
      port: Number(target.port || (target.protocol === 'https:' ? 443 : 80)),
    });
    track(upstream);
    upstream.setTimeout(config.timeouts.scenario, () => upstream.destroy());
    upstream.once('connect', () => {
      if (client.destroyed) {
        upstream.destroy();
        return;
      }
      if (prefix) upstream.write(prefix);
      else if (!acknowledged)
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    client.once('error', () => upstream.destroy());
    client.once('close', () => upstream.destroy());
    upstream.once('error', () => client.destroy());
    upstream.once('close', () => client.destroy());
  };

  server.on('connect', (incoming, client, head) => {
    let tlsTarget: URL;
    let plainTarget: URL;
    try {
      if (
        !incoming.url ||
        !/^(\[[^\]]+\]|[^:\s/\\?#@]+):[0-9]+$/.test(incoming.url)
      )
        throw new Error('Invalid CONNECT authority');
      tlsTarget = new URL(`https://${incoming.url}`);
      plainTarget = new URL(`http://${incoming.url}`);
      if (
        !config.allowedOrigins.includes(tlsTarget.origin) &&
        !config.allowedOrigins.includes(plainTarget.origin)
      )
        throw new Error('Unapproved CONNECT authority');
    } catch {
      client.end(
        'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    // Chromium uses CONNECT for both TLS and plain WebSockets. Confirm the
    // actual protocol before connecting, so allowing http never permits https.
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    let buffered = Buffer.alloc(0);
    const clear = () => {
      clearTimeout(timer);
      client.off('data', inspect);
      client.off('close', clear);
      client.off('error', failed);
    };
    const failed = () => {
      clear();
      client.destroy();
    };
    const forward = (target: URL) => {
      client.pause();
      clear();
      tunnel(client, target, buffered, '', true);
    };
    const inspect = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < 3) return;
      if (buffered[0] === 0x16 && buffered[1] === 0x03) {
        if (config.allowedOrigins.includes(tlsTarget.origin))
          forward(tlsTarget);
        else failed();
        return;
      }
      if (
        !config.allowedOrigins.includes(plainTarget.origin) ||
        buffered.length > MAX_UPGRADE_HEADER_BYTES
      ) {
        failed();
        return;
      }
      const end = buffered.indexOf('\r\n\r\n');
      if (end < 0) return;
      const [requestLine, ...lines] = buffered
        .subarray(0, end)
        .toString('latin1')
        .split('\r\n');
      const fields = lines.map((line) => {
        const separator = line.indexOf(':');
        return [
          line.slice(0, separator).toLowerCase(),
          line.slice(separator + 1).trim(),
        ] as const;
      });
      const hosts = fields.filter(([name]) => name === 'host');
      try {
        if (
          !requestLine ||
          !/^GET \/[^\s]* HTTP\/1\.1$/.test(requestLine) ||
          hosts.length !== 1 ||
          new URL(`http://${hosts[0]![1]}`).origin !== plainTarget.origin ||
          !fields.some(
            ([name, value]) =>
              name === 'upgrade' && value.toLowerCase() === 'websocket',
          ) ||
          !fields.some(
            ([name, value]) =>
              name === 'connection' &&
              value
                .toLowerCase()
                .split(/\s*,\s*/)
                .includes('upgrade'),
          )
        ) {
          failed();
          return;
        }
      } catch {
        failed();
        return;
      }
      forward(plainTarget);
    };
    const timer = setTimeout(
      failed,
      Math.min(config.timeouts.action, config.timeouts.scenario),
    );
    client.on('data', inspect);
    client.once('close', clear);
    client.once('error', failed);
    if (head.length) inspect(head);
  });
  server.on('upgrade', (incoming, client, head) => {
    let target: URL;
    try {
      target = httpTarget(incoming.url);
    } catch {
      client.end(
        'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    const forwarded = Object.entries(headers(incoming, target)).flatMap(
      ([name, value]) =>
        value === undefined
          ? []
          : (Array.isArray(value) ? value : [value]).map(
              (entry) => `${name}: ${entry}`,
            ),
    );
    tunnel(
      client,
      target,
      head,
      [
        `GET ${target.pathname}${target.search} HTTP/1.1`,
        ...forwarded,
        '',
        '',
      ].join('\r\n'),
    );
  });
  server.on('connection', track);
  server.on('clientError', (_error, socket) => socket.destroy());
  server.maxConnections = MAX_CONNECTIONS;
  server.requestTimeout = config.timeouts.scenario;
  server.headersTimeout = Math.min(
    config.timeouts.action,
    config.timeouts.scenario,
  );
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }));
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  } catch {
    await close();
    throw new SetupError(
      'NETWORK_GUARD',
      'Cannot start the private loopback origin guard. Check local port permissions.',
    );
  }
  // Fail closed on a later server error; browser operations then become inconclusive.
  server.on('error', () => {
    void close();
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await close();
    throw new SetupError(
      'NETWORK_GUARD',
      'Cannot determine the private origin guard address.',
    );
  }
  return {
    settings: {
      server: `http://127.0.0.1:${address.port}`,
      bypass: '<-loopback>',
    },
    close,
  };
}
