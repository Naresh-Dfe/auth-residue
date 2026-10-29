import type { Page } from 'playwright';
import type { Config } from '../config/schema.js';

export interface StorageSummary {
  category: string;
  matched: boolean;
  complete: boolean;
  entries: number;
  secure?: number;
  httpOnly?: number;
  sameSiteStrict?: number;
}

/** Only synthetic-marker booleans and counts cross the browser boundary. */
export async function inspectStorage(
  page: Page,
  config: Config,
  marker: string,
): Promise<StorageSummary[]> {
  const summaries = await page.evaluate(
    async ({ settings, marker }) => {
      type Summary = {
        category: string;
        matched: boolean;
        complete: boolean;
        entries: number;
      };
      const results: Summary[] = [];
      for (const category of ['localStorage', 'sessionStorage'] as const) {
        if (!settings[category]) continue;
        const summary: Summary = {
          category,
          matched: false,
          complete: true,
          entries: 0,
        };
        try {
          const store = window[category];
          let bytes = 0;
          for (let index = 0; index < store.length; index++) {
            const key = store.key(index);
            if (key === null) continue;
            const value = store.getItem(key) ?? '';
            bytes += key.length + value.length;
            if (index >= settings.maxEntries || bytes > settings.maxBytes) {
              summary.complete = false;
              break;
            }
            summary.entries++;
            summary.matched ||= key.includes(marker) || value.includes(marker);
          }
        } catch {
          summary.complete = false;
        }
        results.push(summary);
      }
      if (settings.indexedDB) {
        const summary: Summary = {
          category: 'indexedDB',
          matched: false,
          complete: true,
          entries: 0,
        };
        let bytes = 0;
        try {
          const databases = await indexedDB.databases();
          if (databases.length > settings.maxEntries) summary.complete = false;
          for (const metadata of databases.slice(0, settings.maxEntries)) {
            if (!metadata.name) {
              summary.complete = false;
              continue;
            }
            const database = await new Promise<IDBDatabase>(
              (resolve, reject) => {
                const request = indexedDB.open(metadata.name!);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () =>
                  reject(new Error('IndexedDB unavailable'));
                request.onblocked = () =>
                  reject(new Error('IndexedDB blocked'));
              },
            );
            try {
              for (const name of Array.from(database.objectStoreNames)) {
                await new Promise<void>((resolve, reject) => {
                  const transaction = database.transaction(name, 'readonly');
                  const cursor = transaction.objectStore(name).openCursor();
                  cursor.onerror = () =>
                    reject(new Error('IndexedDB cursor unavailable'));
                  cursor.onsuccess = () => {
                    if (!cursor.result) {
                      resolve();
                      return;
                    }
                    let value: string;
                    try {
                      value = JSON.stringify([
                        cursor.result.key,
                        cursor.result.value,
                      ]);
                    } catch {
                      summary.complete = false;
                      resolve();
                      return;
                    }
                    bytes += value.length;
                    if (
                      summary.entries >= settings.maxEntries ||
                      bytes > settings.maxBytes
                    ) {
                      summary.complete = false;
                      resolve();
                      return;
                    }
                    summary.entries++;
                    summary.matched ||= value.includes(marker);
                    cursor.result.continue();
                  };
                });
                if (!summary.complete) break;
              }
            } finally {
              database.close();
            }
            if (!summary.complete) break;
          }
        } catch {
          summary.complete = false;
        }
        results.push(summary);
      }
      if (settings.cacheStorage) {
        const summary: Summary = {
          category: 'cacheStorage',
          matched: false,
          complete: true,
          entries: 0,
        };
        let bytes = 0;
        try {
          const names = await caches.keys();
          if (names.length > settings.maxEntries) summary.complete = false;
          for (const name of names.slice(0, settings.maxEntries)) {
            const cache = await caches.open(name);
            for (const request of await cache.keys()) {
              if (summary.entries >= settings.maxEntries) {
                summary.complete = false;
                break;
              }
              summary.entries++;
              const response = await cache.match(request);
              if (!response || response.type === 'opaque') {
                summary.complete = false;
                continue;
              }
              const reader = response.body?.getReader();
              if (!reader) continue;
              const decoder = new TextDecoder();
              let text = '';
              try {
                for (;;) {
                  const chunk = await reader.read();
                  if (chunk.done) break;
                  bytes += chunk.value.byteLength;
                  if (bytes > settings.maxBytes) {
                    summary.complete = false;
                    await reader.cancel();
                    break;
                  }
                  text += decoder.decode(chunk.value, { stream: true });
                }
              } finally {
                reader.releaseLock();
              }
              text += decoder.decode();
              summary.matched ||= text.includes(marker);
              if (!summary.complete) break;
            }
            if (!summary.complete) break;
          }
        } catch {
          summary.complete = false;
        }
        results.push(summary);
      }
      return results;
    },
    { settings: config.storage, marker },
  );
  const results: StorageSummary[] = summaries;
  if (config.storage.cookies) {
    const cookies = await page.context().cookies(page.url());
    const bounded = cookies.slice(0, config.storage.maxEntries);
    results.push({
      category: 'cookies',
      complete: cookies.length === bounded.length,
      entries: bounded.length,
      matched: bounded.some(
        (cookie) =>
          cookie.name.includes(marker) || cookie.value.includes(marker),
      ),
      secure: bounded.filter((cookie) => cookie.secure).length,
      httpOnly: bounded.filter((cookie) => cookie.httpOnly).length,
      sameSiteStrict: bounded.filter((cookie) => cookie.sameSite === 'Strict')
        .length,
    });
  }
  return results;
}
