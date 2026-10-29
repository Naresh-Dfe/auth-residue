import { describe, expect, it } from 'vitest';
import { createCLI } from '../../src/cli/main.js';
import { template } from '../../src/cli/template.js';

describe('CLI contract', () => {
  it('exposes all requested commands and test flags', () => {
    const cli = createCLI();
    expect(cli.commands.map((command) => command.name())).toEqual([
      'init',
      'list',
      'doctor',
      'test',
      'report',
    ]);
    const test = cli.commands.find((command) => command.name() === 'test')!;
    for (const flag of [
      'config',
      'scenario',
      'output',
      'headless',
      'headed',
      'timeout',
      'verbose',
      'json',
      'fail-on-inconclusive',
    ])
      expect(test.options.some((option) => option.long === `--${flag}`)).toBe(
        true,
      );
  });
  it('rejects invalid timeout arguments', () => {
    const option = createCLI()
      .commands.find((command) => command.name() === 'test')!
      .options.find((option) => option.long === '--timeout')!;
    expect(() => option.parseArg!('oops', undefined)).toThrow('integer');
  });
  it('generates only environment references and synthetic marker examples', () => {
    expect(template).toContain('AUTHRESIDUE_A_PASSWORD');
    expect(template).toContain('defineConfig');
    expect(template).not.toContain('password:');
  });
});
