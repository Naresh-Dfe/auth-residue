const sensitiveKey =
  /password|passwd|secret|token|authorization|^cookies?$|^set-cookie$|session.?id|api.?key|credential/i;
export function redactText(
  value: string,
  secrets: readonly string[] = [],
): string {
  let clean = value;
  for (const secret of [...secrets]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    for (const variant of new Set([secret, encodeURIComponent(secret)]))
      clean = clean.split(variant).join('[REDACTED]');
  }
  clean = clean.replace(/\b(Bearer|Basic)\s+[^\s<>"']+/gi, '$1 [REDACTED]');
  clean = clean.replace(/([?&][^=\s&]+)=([^&#\s"'<>]+)/g, '$1=[REDACTED]');
  return clean;
}

/** Defense in depth; collection itself must already use allowlisted fields. */
export function sanitize<T>(input: T, secrets: readonly string[] = []): T {
  function visit(value: unknown): unknown {
    if (typeof value === 'string') return redactText(value, secrets);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          redactText(key, secrets),
          sensitiveKey.test(key) ? '[REDACTED]' : visit(entry),
        ]),
      );
    return value;
  }
  // visit preserves the structure of allowlisted reports, except sensitive values.
  return visit(input) as T;
}

export function safeRoute(value: string, baseURL: string): string {
  return new URL(value, baseURL).pathname;
}
