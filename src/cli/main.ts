#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { existsSync, realpathSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/loader.js';
import { scenarioIds, SetupError, validateConfig } from '../config/schema.js';
import { run } from '../core/engine.js';
import { exitCode } from '../core/results.js';
import { readResults, writeReports } from '../reporters/reports.js';
import { renderTerminal } from '../reporters/terminal.js';
import { catalog } from '../scenarios/catalog.js';
import { template } from './template.js';
import { doctor } from './doctor.js';

function milliseconds(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1000 || number > 600000)
    throw new InvalidArgumentError(
      'Use an integer from 1000 to 600000 milliseconds.',
    );
  return number;
}

export function createCLI(): Command {
  const program = new Command()
    .name('authresidue')
    .description(
      'Test what survives after the user leaves. Authorized local identity-transition testing.',
    )
    .version('0.1.1')
    .showHelpAfterError()
    .exitOverride();
  program
    .command('init')
    .description(
      'Create a documented configuration without overwriting existing files.',
    )
    .option(
      '--non-interactive',
      'Never prompt; existing configuration is an error.',
    )
    .action(async () => {
      try {
        await writeFile(resolve('authresidue.config.ts'), template, {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'EEXIST'
        )
          throw new SetupError(
            'EXISTS',
            'authresidue.config.ts already exists. Review/edit it explicitly; init never overwrites configuration.',
          );
        throw new SetupError(
          'WRITE',
          'Cannot create configuration in this directory. Check filesystem permissions.',
        );
      }
      console.log(
        'Created authresidue.config.ts. Create two distinct synthetic test accounts, set AUTHRESIDUE_A_EMAIL, AUTHRESIDUE_A_PASSWORD, AUTHRESIDUE_B_EMAIL, AUTHRESIDUE_B_PASSWORD, and adapt selectors and private canaries. Run authresidue doctor. Configuration is trusted executable code.',
      );
    });
  program
    .command('list')
    .description('List supported scenarios, prerequisites, and limitations.')
    .action(() => {
      for (const id of scenarioIds) {
        const info = catalog[id];
        console.log(
          `${id} [supported]\n  ${info.description}\n  Requires: ${info.requires}\n  Limits: ${info.limitations}`,
        );
      }
      console.log('Service worker behavior: NOT_TESTED (unsupported).');
    });
  program
    .command('doctor')
    .description('Check setup; exercises a synthetic A login and logout.')
    .option(
      '--config <path>',
      'Trusted TypeScript configuration.',
      'authresidue.config.ts',
    )
    .action(async (options: { config: string }) => {
      const config = await loadConfig(options.config);
      const checks = await doctor(config);
      for (const entry of checks)
        console.log(
          `${entry.ok ? 'OK' : 'ERROR'} ${entry.name}: ${entry.message}`,
        );
      process.exitCode = checks.every((entry) => entry.ok) ? 0 : 2;
    });
  program
    .command('test')
    .description(
      'Run configured identity transitions sequentially in Chromium.',
    )
    .option(
      '--config <path>',
      'Trusted configuration.',
      'authresidue.config.ts',
    )
    .option(
      '--scenario <id...>',
      'Run only these configured scenario identifiers.',
    )
    .option('--output <directory>', 'Report directory.')
    .option('--headless', 'Run without a browser window (default).')
    .option('--headed', 'Show the browser.')
    .option('--timeout <milliseconds>', 'Per-scenario deadline.', milliseconds)
    .option(
      '--verbose',
      'Print scenario progress to stderr; raw browser diagnostics are withheld.',
    )
    .option('--json', 'Print only structured sanitized results to stdout.')
    .option('--fail-on-inconclusive', 'Exit 2 on inconclusive results.')
    .action(
      async (options: {
        config: string;
        scenario?: string[];
        output?: string;
        headless?: boolean;
        headed?: boolean;
        timeout?: number;
        verbose?: boolean;
        json?: boolean;
        failOnInconclusive?: boolean;
      }) => {
        if (options.headless && options.headed)
          throw new SetupError(
            'OPTIONS',
            'Choose either --headless or --headed.',
          );
        const loaded = await loadConfig(options.config);
        if (
          options.scenario?.some(
            (id) =>
              !loaded.scenarios.includes(id as (typeof scenarioIds)[number]),
          )
        )
          throw new SetupError(
            'SCENARIO',
            'Choose scenario identifiers enabled in the configuration; run authresidue list for prerequisites.',
          );
        const config = validateConfig({
          ...loaded,
          ...(options.scenario ? { scenarios: options.scenario } : {}),
          reports: {
            ...loaded.reports,
            ...(options.output ? { outputDir: options.output } : {}),
          },
          timeouts: {
            ...loaded.timeouts,
            ...(options.timeout ? { scenario: options.timeout } : {}),
          },
        });
        const cancellation = new AbortController();
        const abort = () => cancellation.abort();
        process.once('SIGINT', abort);
        process.once('SIGTERM', abort);
        try {
          if (!options.json)
            console.error(
              `Target: ${new URL(config.baseURL).origin}\nScenarios: ${config.scenarios.join(', ')}`,
            );
          const result = await run(config, {
            headless: !options.headed,
            signal: cancellation.signal,
            onProgress: (event) => {
              if (options.verbose || (!options.json && process.stderr.isTTY))
                console.error(
                  `${event.state === 'start' ? 'Running' : 'Finished'} ${event.scenario}`,
                );
            },
          });
          const paths = await writeReports(
            result,
            config.reports.outputDir,
            config.reports.html,
          );
          console.log(
            options.json
              ? JSON.stringify(result)
              : `${renderTerminal(result)}\nJSON: ${paths.json}${paths.html ? `\nHTML: ${paths.html}` : ''}`,
          );
          process.exitCode = exitCode(result, options.failOnInconclusive);
        } finally {
          process.removeListener('SIGINT', abort);
          process.removeListener('SIGTERM', abort);
        }
      },
    );
  program
    .command('report')
    .description(
      'Regenerate an offline HTML report from sanitized saved results.',
    )
    .argument(
      '[results]',
      'Existing schema 1.0 JSON file.',
      'authresidue-output/results.json',
    )
    .option('--output <directory>', 'Report directory.', 'authresidue-output')
    .action(async (file: string, options: { output: string }) => {
      const paths = await writeReports(
        await readResults(file),
        options.output,
        true,
      );
      console.log(`HTML: ${paths.html}`);
    });
  return program;
}

export async function main(args = process.argv): Promise<void> {
  try {
    await createCLI().parseAsync(args);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code.startsWith('commander.')
    ) {
      process.exitCode = [
        'commander.helpDisplayed',
        'commander.version',
        'commander.help',
      ].includes(error.code)
        ? 0
        : 2;
      return;
    }
    console.error(
      error instanceof SetupError
        ? `ERROR ${error.code}: ${error.message}`
        : 'ERROR: Operation failed. Check configuration, application availability, and output permissions. Raw diagnostics are withheld to protect secrets.',
    );
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  // npm uses executable symlinks on Unix; compare the files they resolve to.
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  await main();
