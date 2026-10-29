import type { RunResult } from '../core/results.js';
import { statuses } from '../core/results.js';

function terminalText(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return (
        code === 9 ||
        code === 10 ||
        (code >= 32 && !(code >= 127 && code <= 159))
      );
    })
    .join('');
}
export function renderTerminal(result: RunResult): string {
  const lines = [
    `AuthResidue · ${result.targetOrigin}`,
    ...result.findings.map(
      (finding) =>
        `${finding.status.padEnd(12)} ${finding.scenarioId} · ${finding.title}${finding.route ? ` (${finding.route})` : ''}${['FAIL', 'INCONCLUSIVE'].includes(finding.status) ? `\n             ${finding.actual}` : ''}`,
    ),
    statuses
      .map(
        (status) =>
          `${status}: ${result.findings.filter((finding) => finding.status === status).length}`,
      )
      .join(' | '),
    `Duration: ${(result.durationMs / 1000).toFixed(2)} s`,
    'Passing configured checks does not prove application security.',
  ];
  return terminalText(lines.join('\n'));
}
