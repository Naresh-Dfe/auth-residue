import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { resultSchema, statuses } from '../core/results.js';
import type { RunResult } from '../core/results.js';
import { SetupError } from '../config/schema.js';
import { sanitize } from '../evidence/redactor.js';
import { catalog } from '../scenarios/catalog.js';

export function escapeHTML(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}
const script = `const filters=[...document.querySelectorAll('[data-filter]')];function apply(){let shown=0;for(const row of document.querySelectorAll('tbody tr')){const visible=filters.every(input=>{const value=input.value.toLowerCase();return !value||(input.dataset.filter==='search'?row.textContent.toLowerCase().includes(value):row.dataset[input.dataset.filter].toLowerCase()===value)});row.hidden=!visible;if(visible)shown++}document.getElementById('count').textContent=shown+' findings shown'}for(const filter of filters)filter.addEventListener('input',apply);apply();`;

export function renderHTML(input: RunResult): string {
  const result = resultSchema.parse(sanitize(input));
  const e = escapeHTML;
  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      result.findings.filter((finding) => finding.status === status).length,
    ]),
  );
  const rows = result.findings
    .map(
      (finding) =>
        `<tr data-status="${e(finding.status)}" data-scenario="${e(finding.scenarioId)}" data-severity="${e(finding.severity)}"><td><span class="badge ${finding.status.toLowerCase()}">${finding.status}</span></td><td><details><summary>${e(finding.title)}<small>${e(finding.scenarioName)} · ${e(finding.phase)}${finding.route ? ` · ${e(finding.route)}` : ''}</small></summary><div class="detail"><dl><dt>Expected</dt><dd>${e(finding.expected)}</dd><dt>Observed</dt><dd>${e(finding.actual)}</dd><dt>Evidence</dt><dd><pre>${e(JSON.stringify(finding.evidence, null, 2))}</pre></dd><dt>Reproduce</dt><dd><ol>${finding.reproduction.map((step) => `<li>${e(step)}</li>`).join('')}</ol></dd><dt>Remediation</dt><dd>${e(finding.remediation)}</dd><dt>Limitations</dt><dd>${finding.limitations.map((item) => `<p>${e(item)}</p>`).join('')}</dd><dt>Metadata</dt><dd>${e(finding.id)} · ${e(finding.timestamp)} · ${finding.durationMs} ms</dd></dl></div></details></td><td>${e(finding.severity)}</td></tr>`,
    )
    .join('');
  const hash = createHash('sha256').update(script).digest('base64');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'"><title>AuthResidue · Identity transition report</title><style>
:root{color-scheme:dark;--bg:#0b1017;--panel:#121b27;--edge:#2b3b4f;--muted:#a9bbd0;--text:#eaf0f7;--accent:#91e5d0}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:1240px;margin:auto;padding:40px 28px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid var(--edge);padding-bottom:26px}h1{font-size:32px;letter-spacing:-1px;margin:0}h2{font-size:20px;margin:32px 0 14px}.eyebrow{color:var(--accent);letter-spacing:.12em;font-size:11px;text-transform:uppercase}.muted,small,dt{color:var(--muted)}small{display:block;font-size:12px}p{margin:6px 0}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:26px 0}.stat{padding:18px;border:1px solid var(--edge);border-radius:10px;background:var(--panel)}.stat strong{display:block;font-size:28px}.stat span{font-size:12px;color:var(--muted)}.notice{border-left:3px solid var(--accent);padding:14px 18px;background:var(--panel)}.filters{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}label{font-size:12px;color:var(--muted);flex:1;min-width:145px}input,select{display:block;width:100%;margin-top:5px;border:1px solid var(--edge);border-radius:6px;background:var(--panel);color:var(--text);padding:10px;font:inherit}table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--edge)}th,td{text-align:left;padding:14px;border-bottom:1px solid var(--edge);vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:500}th:first-child{width:145px}.badge{font-size:11px;letter-spacing:.05em;border:1px solid currentColor;border-radius:4px;padding:4px 7px;white-space:nowrap}.pass{color:#9be3b4}.fail{color:#ffb1b1}.inconclusive{color:#f1cf8a}.not_tested{color:#b5c4d6}summary{cursor:pointer}summary small{margin-left:18px}.detail{padding:16px 0}dl{margin:0;display:grid;grid-template-columns:105px minmax(0,1fr);gap:14px}dd{margin:0;overflow-wrap:anywhere}pre{white-space:pre-wrap;font:12px/1.6 ui-monospace,Consolas,monospace;margin:0}ol{padding-left:20px;margin:0}.coverage{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.coverage article{border:1px solid var(--edge);padding:16px;border-radius:8px}.coverage strong{color:var(--accent)}footer{margin:32px 0 0;border-top:1px solid var(--edge);padding-top:20px;color:var(--muted);font-size:12px}:focus-visible{outline:2px solid var(--accent);outline-offset:4px}[hidden]{display:none!important}@media(max-width:700px){main{padding:22px 14px}.stats{grid-template-columns:repeat(2,1fr)}header{display:block}header>div+div{margin-top:15px}th,td{padding:10px 6px}th:first-child{width:108px}td:last-child,th:last-child{display:none}dl{display:block}dt{margin-top:12px}.badge{font-size:10px}}
</style></head><body><main><header><div><div class="eyebrow">Local evidence · v${e(result.toolVersion)}</div><h1>AuthResidue<span style="color:var(--accent)">.</span></h1><p class="muted">Test what survives after the user leaves.</p></div><div><strong>Identity transition report</strong><small>${e(result.targetOrigin)}</small><small>${e(result.startedAt)} · ${(result.durationMs / 1000).toFixed(2)} s</small></div></header><section aria-label="Executive summary"><div class="stats"><div class="stat"><strong>${result.selectedScenarios.length}</strong><span>Selected scenarios</span></div>${statuses.map((status) => `<div class="stat"><strong>${counts[status]}</strong><span>${status.replace('_', ' ')} assertions</span></div>`).join('')}</div><p class="notice">These results describe configured observations. Passing checks cannot prove application security.${result.interrupted ? ' Execution was interrupted; coverage is incomplete.' : ''}</p></section><section aria-labelledby="findings"><h2 id="findings">Findings</h2><div class="filters"><label>Search<input type="search" data-filter="search" placeholder="Find an assertion, route, or phase"></label><label>Status<select data-filter="status"><option value="">All statuses</option>${statuses.map((value) => `<option>${value}</option>`).join('')}</select></label><label>Scenario<select data-filter="scenario"><option value="">All scenarios</option>${result.selectedScenarios.map((value) => `<option value="${value}">${e(catalog[value].name)}</option>`).join('')}</select></label><label>Impact<select data-filter="severity"><option value="">All impacts</option><option>high</option><option>medium</option><option>low</option><option>none</option></select></label></div><p id="count" class="muted" role="status">${result.findings.length} findings</p><table><thead><tr><th scope="col">Status</th><th scope="col">Assertion and evidence</th><th scope="col">Impact</th></tr></thead><tbody>${rows}</tbody></table><small>High: configured private data reached an unauthorized identity. Medium: configured private UI exposure. Low: explicit storage retention policy mismatch. None: no confirmed failure.</small></section><section><h2>Scenario coverage</h2><div class="coverage">${Object.entries(
    catalog,
  )
    .map(([id, info]) => {
      const selected = result.selectedScenarios.includes(
        id as RunResult['selectedScenarios'][number],
      );
      const executed = result.findings.filter(
        (finding) => finding.scenarioId === id,
      );
      return `<article><strong>${e(info.name)}</strong><small>${e(id)} · ${selected ? `${executed.filter((finding) => !['NOT_TESTED', 'INCONCLUSIVE'].includes(finding.status)).length} completed assertions / ${executed.length} recorded` : 'NOT_TESTED · not selected'}</small><p>${e(info.description)}</p><small>${e(info.limitations)}</small></article>`;
    })
    .join(
      '',
    )}</div></section><section><h2>Environment</h2><p>${e(result.environment.browser)} · Node ${e(result.environment.node)} · ${e(result.environment.platform)}</p><small>Run ${e(result.runId)} · schema ${result.schemaVersion} · ${result.configuration.routeCount} configured routes · ${result.configuration.probeCount} GET probes · deadlines ${result.configuration.actionTimeoutMs}/${result.configuration.navigationTimeoutMs}/${result.configuration.scenarioTimeoutMs} ms · storage: ${e(result.configuration.storageCategories.join(', '))} (${e(result.configuration.retentionPolicy)}) · sequential contexts · service workers blocked · screenshots and traces disabled</small></section><section><h2>Report limitations</h2><ul>${result.limitations.map((item) => `<li>${e(item)}</li>`).join('')}</ul></section><footer>Generated locally by AuthResidue. Contains sanitized assertion metadata only. No external assets, telemetry, or network connections are required.</footer></main><script>${script}</script></body></html>`;
}

export async function readResults(filename: string): Promise<RunResult> {
  try {
    if ((await stat(filename)).size > 20 * 1024 * 1024)
      throw new Error('Oversized');
    return resultSchema.parse(
      sanitize(JSON.parse(await readFile(filename, 'utf8'))),
    );
  } catch {
    throw new SetupError(
      'RESULTS',
      'Cannot read results: file is missing, too large, corrupt, or not AuthResidue schema 1.0.',
    );
  }
}

async function atomicWrite(filename: string, contents: string): Promise<void> {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: 'wx' });
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function writeReports(
  input: RunResult,
  outputDir: string,
  html = true,
): Promise<{ json: string; html?: string }> {
  const result = resultSchema.parse(sanitize(input));
  const directory = resolve(outputDir);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const json = join(directory, 'results.json');
  await atomicWrite(json, `${JSON.stringify(result, null, 2)}\n`);
  if (!html) return { json };
  const report = join(directory, 'report.html');
  await atomicWrite(report, renderHTML(result));
  return { json, html: report };
}
