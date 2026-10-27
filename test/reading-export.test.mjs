import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadingSnapshot, readingMarkdown, readingFilename } from '../public/reading-export.js';

const collection = () => ({ title: 'The window', fragments: [
  { id: 'F01', title: 'A letter', text: 'The lamp\nwas kept lit for the ferry. PRIVATE EXTRA TEXT', date: '1997-10-31', from: 'Nora', note: 'Found in a drawer' },
  { id: 'F02', title: 'A note', text: 'UNCITED PRIVATE TEXT', from: 'PRIVATE ATTRIBUTION' },
  { id: 'F03', title: 'A hidden fragment', text: 'UNRETRIEVED PRIVATE TEXT' }
] });
const reading = () => ({ mode: 'live', title: 'A light', reading: 'The lamp remained lit.', uncertainty: 'The date is not established.',
  evidence: [{ sourceId: 'F01', quote: 'The lamp\nwas kept lit for the ferry.' }],
  retrieved: [{ id: 'F01', score: 1 }, { id: 'F02', score: 0.5 }], model: 'open-weight', provider: 'api.example.com', apiKey: 'NEVER_EXPORT' });
const capture = overrides => createReadingSnapshot({ collection: collection(), question: 'Why was it lit?', reading: reading(), createdAt: '2026-10-27T12:00:00Z', ...overrides });

test('reading snapshots preserve question, source attribution and mode with minimal data', () => {
  const snapshot = capture();
  assert.equal(snapshot.createdAt, '2026-10-27T12:00:00.000Z');
  assert.equal(snapshot.evidence[0].from, 'Nora');
  assert.equal(snapshot.evidence[0].note, 'Found in a drawer');
  assert.equal(snapshot.evidence[0].date, '1997-10-31');
  assert.deepEqual(snapshot.considered, [
    { id: 'F01', title: 'A letter', cited: true }, { id: 'F02', title: 'A note', cited: false }
  ]);
  const output = JSON.stringify(snapshot) + readingMarkdown(snapshot);
  assert.doesNotMatch(output, /PRIVATE|NEVER_EXPORT/);
  assert.match(output, /Only part of the collection/);
  assert.match(output, /considered, not cited/);
});

test('export remains tied to the completed reading after source and input objects change', () => {
  const source = collection(); const answer = reading();
  const snapshot = capture({ collection: source, reading: answer });
  const before = readingMarkdown(snapshot);
  source.title = 'Changed collection'; source.fragments[0].text = 'Changed text';
  source.fragments[0].title = 'Changed title'; answer.evidence[0].quote = 'Changed quote'; answer.reading = 'Changed reading';
  assert.equal(readingMarkdown(snapshot), before);
  assert.throws(() => { snapshot.evidence[0].quote = 'mutation'; }, TypeError);
  assert.throws(() => { snapshot.question = 'Changed question'; }, TypeError);
});

test('Markdown escapes HTML, links, images, headings, fences and autolinks as literal words', () => {
  const attack = '<img src=x> ![image](https://evil.example)\n# title\n```html\n&copy;';
  const source = collection(); source.title = attack; source.fragments[0].text = attack;
  source.fragments[0].title = attack; source.fragments[0].note = attack;
  const answer = reading(); answer.title = attack; answer.reading = attack;
  answer.evidence[0].quote = attack;
  const markdown = readingMarkdown(capture({ collection: source, question: attack, reading: answer }));
  assert.doesNotMatch(markdown, /(?<!\\)<img|(?<!\\)!\[image\]\(|https:\/\/evil|^# title$|^```html$|&copy;/m);
  assert.match(markdown, /> \\<img src=x\\>/);
  assert.match(markdown, /> \\# title/);
  assert.match(markdown, /> \\`\\`\\`html/);
  assert.match(markdown, /&amp;copy;/);
});

test('authored sample and abstention are exported honestly without model claims', () => {
  const answer = { ...reading(), mode: 'sample', evidence: [] };
  const snapshot = capture({ reading: answer });
  assert.equal(snapshot.model, null); assert.equal(snapshot.provider, null);
  assert.deepEqual(snapshot.considered, []);
  const markdown = readingMarkdown(snapshot);
  assert.match(markdown, /AUTHORED SAMPLE — NOT AI-GENERATED/);
  assert.match(markdown, /No supporting quotations/);
  assert.doesNotMatch(markdown, /Requested model|Provider:/);
});

test('on-device extractive readings retain model provenance without hosted-provider claims', () => {
  const snapshot = capture({ reading: { ...reading(), mode: 'local' } });
  const markdown = readingMarkdown(snapshot);
  assert.equal(snapshot.model, 'open-weight'); assert.equal(snapshot.provider, null);
  assert.equal(snapshot.considered.length, 2);
  assert.match(markdown, /ON-DEVICE AI · EXTRACTIVE READING/);
  assert.match(markdown, /selects source text instead of generating/);
  assert.doesNotMatch(markdown, /HOSTED AI|Provider:|AUTHORED SAMPLE/);
});

test('only real source quotations can be captured, and unsupported retrieval IDs are ignored', () => {
  const answer = reading(); answer.evidence[0].quote = 'invented';
  assert.throws(() => capture({ reading: answer }), /no longer matches/);
  assert.throws(() => capture({ createdAt: 'not a date' }), /valid timestamp/);
  const known = reading(); known.retrieved.push({ id: 'F99' }, { id: 'F01' });
  assert.equal(capture({ reading: known }).considered.length, 2);
});

test('download names are bounded safe filenames with Unicode support', () => {
  assert.equal(readingFilename({ title: '../../<script> & ../Hello' }), 'script-hello-reading.md');
  assert.equal(readingFilename({ title: '🕯️' }), 'archive-reading.md');
  assert.equal(readingFilename({ title: 'Memória' }), 'memória-reading.md');
  assert.ok(readingFilename({ title: 'a'.repeat(200) }).length <= 81);
});
