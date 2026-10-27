import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';
import { archive } from '../public/archive.js';
import { MODEL_MANIFEST } from '../lib/local-ai.mjs';

const cases = [
  { name: 'Recorded closing date', question: 'When was the final day of service at Bellwether post office?',
    fragments: archive.fragments, source: 'F05', expected: /31 October 1997/ },
  { name: 'Recorded key holder', question: 'Who would hold the key to the reading room?',
    fragments: archive.fragments, source: 'F05', expected: /night librarian/i },
  { name: 'Fresh fictional collection', question: 'What did Amara keep in the blue tin?',
    fragments: [{ id: 'F01', title: 'A pantry note', text: 'Amara kept her grandmother’s handwritten recipes in a blue tin on the kitchen shelf. The tin was given to her in 2004.' },
      { id: 'F02', title: 'The library key', text: 'The spare library key was stored in a wooden box in the wardrobe.' }],
    source: 'F01', expected: /handwritten recipes/i },
  { name: 'Unrecorded favourite song', question: 'What was Nora’s favourite song?', fragments: archive.fragments, absent: true }
];

const report = { checkedAt: new Date().toISOString(), node: process.version, model: MODEL_MANIFEST.id,
  revision: MODEL_MANIFEST.revision, runtime: 'CPU, in-process ONNX worker; remote model access disabled',
  realInference: true, apiKeyRequired: false, cases: [] };
const server = createServer({ baseUrl: '', apiKey: '', modelName: '', timeoutMs: 180000,
  fetcher: async () => { throw new Error('Hosted requests are forbidden in this verification.'); } });
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(url + '/api/health').then(response => response.json());
  assert.equal(status.ready, true, status.error || 'Run npm run setup:model first.');
  for (const item of cases) {
    const response = await fetch(url + '/api/read', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: item.question, fragments: item.fragments, allowHosted: false }),
      signal: AbortSignal.timeout(190000) });
    const reading = await response.json();
    const passed = response.ok && reading.mode === 'local' && (item.absent ? reading.evidence.length === 0
      : reading.evidence.some(evidence => evidence.sourceId === item.source && item.expected.test(evidence.quote)));
    report.cases.push({ name: item.name, question: item.question, passed, status: response.status, reading });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${item.name}: ${reading.durationMs ?? 0}ms`);
  }
  report.passed = report.cases.every(item => item.passed);
  await writeFile(new URL('../docs/verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  assert.equal(report.passed, true, 'Inspect docs/verification.json for failed real-model checks.');
  console.log('Real CPU inference verified. Evidence: docs/verification.json');
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
