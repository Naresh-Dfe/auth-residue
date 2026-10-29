import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { SetupError, validateConfig } from './schema.js';
import type { Config } from './schema.js';

/** Configuration is trusted executable project code, like a test runner config. */
export async function loadConfig(
  filename = 'authresidue.config.ts',
): Promise<Config> {
  const absolute = resolve(filename);
  try {
    await access(absolute);
  } catch {
    throw new SetupError(
      'CONFIG_MISSING',
      'Configuration not found. Run authresidue init, or pass --config with an existing file.',
    );
  }
  let input: unknown;
  try {
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      fsCache: false,
      alias: {
        authresidue: fileURLToPath(new URL('../index.js', import.meta.url)),
      },
    });
    const module = await jiti.import<{ default?: unknown }>(
      pathToFileURL(absolute).href,
    );
    input = module.default ?? module;
  } catch {
    throw new SetupError(
      'CONFIG_LOAD',
      'Cannot load configuration. Check its imports, TypeScript syntax, and trusted hooks. Raw loader errors are withheld to avoid exposing secrets.',
    );
  }
  return validateConfig(input);
}
