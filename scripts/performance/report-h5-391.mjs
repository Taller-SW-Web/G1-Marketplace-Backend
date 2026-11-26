import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Provide the directory produced by run-h5-391-suite.ps1.');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/^\uFEFF/, '');
const json = (path) => JSON.parse(read(path));
const stages = [20, 50, 100, 200, 400, 800, 1000];
const stressRuns = readdirSync(root).filter((name) => /^stress-\d+$/.test(name))
  .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));
const names = ['smoke', 'baseline-warmup', 'baseline-catalog-load', 'baseline-cart-load',
  ...stressRuns, 'spike', 'cache-off-warmup', 'cache-off-catalog-load', 'cache-off-cart-load',
  'cache-on-warmup', 'cache-on-catalog-load', 'cache-on-cart-load', 'soak'];

function resources(samples) {
  const peaks = {};
  for (const entry of samples) {
    const service = entry.container.includes('backend') ? 'BFF'
      : entry.container.includes('postgres') ? 'PostgreSQL' : 'k6';
    const [, size, unit] = /^(\d+(?:\.\d+)?)(B|KiB|MiB|GiB)/.exec(entry.memory) ?? [];
    const sampleSize = Number(size) * { B: 1 / 1048576, KiB: 1 / 1024, MiB: 1, GiB: 1024 }[unit];
    const peak = (peaks[service] ??= { cpu: 0, memoryMiB: 0, samples: 0 });
    if (!Number.isFinite(sampleSize)) throw new Error(`Unrecognized Docker memory sample: ${entry.memory}`);
    peak.cpu = Math.max(peak.cpu, Number.parseFloat(entry.cpu));
    peak.memoryMiB = Math.max(peak.memoryMiB, sampleSize);
    peak.samples++;
  }
  return peaks;
}

function stats(metrics, suffix = '', duration) {
  const latency = metrics[`http_req_duration${suffix}`];
  const count = metrics[`http_reqs${suffix}`];
  const failure = metrics[`http_req_failed${suffix}`];
  return {
    p50: latency['p(50)'], p95: latency['p(95)'], p99: latency['p(99)'],
    errorRate: failure.value,
    requests: count?.count ?? failure.passes + failure.fails,
    rps: duration ? count.count / duration : count?.rate,
  };
}

const runs = Object.fromEntries(names.map((name) => {
  const metadata = json(`${name}/metadata.json`);
  const metrics = json(`${name}/summary.json`).metrics;
  const samples = read(`${name}/docker-stats.jsonl`).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const summary = stats(metrics, metadata.profile === 'load' || metadata.profile === 'soak' ||
    metadata.profile === 'smoke' ? '{measured:yes}' : '');
  summary.rps ??= metadata.workload === 'cart'
    ? metrics['http_reqs{operation:remove}'].rate + metrics['http_reqs{operation:replay}'].rate
    : metrics.http_reqs.rate;
  return [name, { metadata, summary, metrics, samples, resources: resources(samples) }];
}));

function phaseRows(run, labels) {
  return labels.map(([phase, label]) => ({ phase, label, ...stats(run.metrics, `{phase:${phase}}`, 15) }));
}

const lastStress = stressRuns.at(-1);
const stress = runs[lastStress];
const stressStages = phaseRows(stress, [
  ...stages.filter((vus) => vus <= stress.metadata.maxStressVus).map((vus) => [`vu${vus}`, String(vus)]),
  ['recovery', '10 (recuperación)'],
]);
const spikeStages = phaseRows(runs.spike, [['low', '10'], ['burst', '200'], ['recovery', '10 (recuperación)']]);
const quiebre = stressStages.find((stage) => stage.phase !== 'recovery' &&
  (stage.p95 > 500 || stage.errorRate > 0.01));
const recovery = stressStages.at(-1);
const without = runs['cache-off-catalog-load'];
const withCache = runs['cache-on-catalog-load'];
const observed = { without: json('cache-off-response.json'), withCache: json('cache-on-response.json') };
if (without.metadata.sha !== withCache.metadata.sha ||
    JSON.stringify(without.metadata.containers) !== JSON.stringify(withCache.metadata.containers) ||
    without.metadata.catalogCacheTtlMs !== 0 || withCache.metadata.catalogCacheTtlMs !== 120000 ||
    [without, withCache].some((run) => run.metadata.stubLatencyMs.g6 !== 120 || run.metadata.stubLatencyMs.g5 !== 120) ||
    observed.without.bodySha256 !== observed.withCache.bodySha256) {
  throw new Error('The two cache conditions did not preserve the image, stub settings or response.');
}

const ms = (amount) => amount.toFixed(2).replace('.', ',');
const percent = (fraction) => `${ms(fraction * 100)} %`;
const latencyGain = 100 * (1 - withCache.summary.p95 / without.summary.p95);
const format = ({ p50, p95, p99, rps, errorRate }) =>
  `${ms(p50)} | ${ms(p95)} | ${ms(p99)} | ${ms(rps)} | ${percent(errorRate)}`;
const row = (label, run) => {
  const status = run.metadata.profile === 'spike' ? 'Medido'
    : run.metadata.exitCode === 0 ? 'Pasa umbrales' : 'Incumple umbral';
  return `| ${label} | ${format(run.summary)} | ${run.metrics.iterations.count} | ${status} |`;
};
const table = (points) => points.map((point) => `| ${point.label} | ${format(point)} |`).join('\n');
const resourceTable = ['smoke', 'baseline-catalog-load', 'baseline-cart-load', ...stressRuns, 'spike',
  'cache-off-catalog-load', 'cache-on-catalog-load', 'soak'].map((name) => {
  const { resources: peaks } = runs[name];
  const peak = (service) => peaks[service]
    ? `${ms(peaks[service].cpu)} % / ${ms(peaks[service].memoryMiB)} MiB` : 'Sin muestra';
  return `| ${name} | ${peak('BFF')} | ${peak('PostgreSQL')} | ${peak('k6')} |`;
}).join('\n');

const report = `# BE #391 y #306 · Carga, quiebre, recuperación y caché

Pruebas de G1 en Docker local con PostgreSQL 16 y k6 1.2.3. G5, G6 y G7 fueron simulados. El BFF y k6 compartieron loopback dentro de una red interna sin puertos publicados. Los [datos de cada corrida](./datos-finales.json) incluyen SHA, imagen, hora UTC, iteraciones, código de k6 y muestras de recursos.

${quiebre ? `**Primer quiebre observado con ${quiebre.label} VUs.** p95 de ${ms(quiebre.p95)} ms, ${ms(quiebre.rps)} RPS y ${percent(quiebre.errorRate)} de errores. El p95 bajó a ${ms(recovery.p95)} ms al volver a 10 VUs, con ${percent(recovery.errorRate)} de errores en recuperación.`
  : `**El límite de la corrida fue ${stress.metadata.maxStressVus} VUs.** Las mesetas probadas quedaron bajo el criterio de quiebre.`}

![Curva de latencia bajo estrés y comparación de caché](./grafico-final.svg)

## Carga, spike y soak

Carga de 10 VUs constantes durante 30 s. El carrito usa una sesión sintética por VU y comprueba que repetir el DELETE conserva \`X-Cart-Version\`. Sus métricas excluyen el POST que restablece el ítem. El spike sube de 10 a 200 VUs en un segundo y vuelve a 10. El soak dura 5 minutos con 10 VUs, caché a 120 s y G6 simulado a 120 ms.

| Escenario | p50 ms | p95 ms | p99 ms | RPS | Error HTTP | Iteraciones | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${row('Carga de catálogo', runs['baseline-catalog-load'])}
${row('Carga de carrito idempotente', runs['baseline-cart-load'])}
${row('Spike completo', runs.spike)}
${row('Soak de catálogo', runs.soak)}

| Meseta del spike, VUs | p50 ms | p95 ms | p99 ms | RPS | Error HTTP |
| --- | ---: | ---: | ---: | ---: | ---: |
${table(spikeStages)}

## Estrés del catálogo

Criterio de quiebre de Jim por meseta de 15 s. p95 mayor a 500 ms o errores HTTP mayores a 1 %. El runner amplía el límite por corridas de 400, 800 o 1000 VUs y conserva la recuperación. El RPS por meseta es el total de solicitudes de esa meseta dividido por 15 s. La tabla corresponde a la corrida \`${lastStress}\`.

| Meseta, VUs | p50 ms | p95 ms | p99 ms | RPS | Error HTTP |
| --- | ---: | ---: | ---: | ---: | ---: |
${table(stressStages)}

## Antes/después de la caché de #345

Se usó la misma imagen, SHA \`${without.metadata.sha}\`, calentamiento y dataset en ambas condiciones. El Compose simula 120 ms antes de llamar al proveedor de catálogo para que una lectura de caché pueda evitar esa espera. También configura 120 ms para el stub de Ventas. Los escenarios medidos usan catálogo y carrito, por lo que el resultado de optimización corresponde a G6. Se obtuvo el mismo contenido de ${observed.without.bytes} bytes y la misma cabecera \`Cache-Control: no-store\` en ambas condiciones.

| Escenario | p50 ms | p95 ms | p99 ms | RPS | Error HTTP | Iteraciones | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${row('Catálogo antes, TTL 0', without)}
${row('Catálogo después, TTL 120 s', withCache)}
${row('Carrito de control antes', runs['cache-off-cart-load'])}
${row('Carrito de control después', runs['cache-on-cart-load'])}

${latencyGain > 0 ? `El p95 del catálogo bajó de ${ms(without.summary.p95)} a ${ms(withCache.summary.p95)} ms, una reducción de ${ms(latencyGain)} % bajo la latencia simulada. La mejora se midió con terceros simulados y TTL aplicado al proceso local.`
  : `El p95 del catálogo cambió de ${ms(without.summary.p95)} a ${ms(withCache.summary.p95)} ms. Este experimento dejó pendiente demostrar una mejora.`}

Base de carga, estrés y spike en \`${runs['baseline-catalog-load'].metadata.sha}\`. El carrito es el escenario idempotente de escritura. La optimización se evaluó solo en el candidato publicado en #345.

## CPU y memoria máximas observadas

Docker expresa 100 % de CPU como el uso de un núcleo. Los límites del BFF y PostgreSQL son 2 CPUs cada uno. k6 tiene su propio límite de 2 CPUs.

| Corrida | BFF CPU / RAM | PostgreSQL CPU / RAM | k6 CPU / RAM |
| --- | ---: | ---: | ---: |
${resourceTable}

## Un comando para reproducir

Desde la raíz del Backend, con Docker, Git, Node y PowerShell 7 instalados, usar un directorio de salida nuevo.

\`\`\`powershell
pwsh -NoProfile -File scripts/performance/run-h5-391-suite.ps1 -OutputDirectory ../be391-final
\`\`\`

El runner construye o reutiliza imágenes de SHA conocidos, prueba los perfiles secuencialmente, conserva las salidas originales y genera reporte, gráfico y datos en ese directorio. Usa un proyecto Compose exclusivo y desmonta los contenedores al terminar. Para el smoke de CI, usar el mismo comando con \`-SmokeOnly\` y un directorio nuevo. Ese modo construye el \`HEAD\` del checkout de CI y prueba una lectura de catálogo con 1 VU durante 5 s.
`;

const maximum = Math.max(500, ...stressStages.map(({ p99 }) => p99));
const scale = 10 ** Math.ceil(Math.log10(maximum));
const chartY = (value) => 371 - (Math.log10(Math.max(1, value)) / Math.log10(scale)) * 256;
const chartX = (index) => 105 + (index * 598) / (stressStages.length - 1);
const text = (x, y, label, size = 18, color = '#213750') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${label}</text>`;
const rule = (y, color, dashed = '') => `<line x1="90" y1="${y}" x2="715" y2="${y}" stroke="${color}" ${dashed}/>`;
const ticks = [1, 10, 100, 500, 1000, 5000].filter((tick) => tick <= scale);
const latencyLines = [['p50', '#086a72'], ['p95', '#925c04'], ['p99', '#744390']].map(([key, color], index) =>
  `<polyline points="${stressStages.map((point, i) => `${chartX(i)},${chartY(point[key])}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3"/>` +
  stressStages.map((point, i) => `<circle cx="${chartX(i)}" cy="${chartY(point[key])}" r="4" fill="${color}"/>`).join('') +
  text(105 + 100 * index, 97, key, 16, color)).join('');
const maxBar = Math.max(without.summary.p95, withCache.summary.p95);
const bars = [[without.summary.p95, 'TTL 0', '#4b5d71'], [withCache.summary.p95, 'TTL 120 s', '#086a72']]
  .map(([value, condition, color], index) => {
    const y = 152 + 89 * index;
    return text(797, y, condition, 17) +
      `<rect x="797" y="${y + 12}" width="${Math.max(3, value * 238 / maxBar)}" height="25" rx="4" fill="${color}"/>` +
      text(807 + Math.max(3, value * 238 / maxBar), y + 31, `${ms(value)} ms`, 16, color);
  }).join('');
const graph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1160 454" role="img" aria-label="BE 391 performance local">
<rect width="1160" height="454" fill="#f5f8fa"/>
<g font-family="system-ui, sans-serif">
${text(36, 41, 'BE #391 · Estrés y experimento de caché', 27)}
<rect x="34" y="57" width="720" height="360" rx="9" fill="#fff"/>
<rect x="773" y="57" width="354" height="360" rx="9" fill="#fff"/>
${ticks.map((tick) => rule(chartY(tick), '#dce5ec') + text(43, chartY(tick) + 5, String(tick), 15)).join('')}
${rule(chartY(500), '#b44535', 'stroke-dasharray="5 5"')}
${text(535, chartY(500) - 6, 'Umbral p95 500 ms', 14, '#9f3b2e')}
${latencyLines}
${stressStages.map((point, i) => text(chartX(i) - 12, 397, point.phase === 'recovery' ? '10 rec.' : point.label, 15)).join('')}
${text(797, 94, 'Catálogo con G6 a 120 ms', 20)}
${bars}
${text(797, 342, 'p95 con el mismo dataset e imagen', 16, '#4b5d71')}
${text(36, 442, 'Latencia del estrés en escala logarítmica · VUs por meseta · k6 1.2.3', 14, '#4b5d71')}
</g></svg>`;

writeFileSync(join(root, 'reporte-final.md'), report);
writeFileSync(join(root, 'grafico-final.svg'), graph);
writeFileSync(join(root, 'datos-finales.json'), JSON.stringify({ runs, stressStages, spikeStages, observed }, null, 2) + '\n');
console.log(JSON.stringify({ quiebre, recovery, latencyGain, beforeP95: without.summary.p95,
  afterP95: withCache.summary.p95, soak: runs.soak.summary, smoke: runs.smoke.metadata.exitCode }));
