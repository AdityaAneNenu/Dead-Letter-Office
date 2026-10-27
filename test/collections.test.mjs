import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, validDate, parseCollection } from '../public/collections.js';
import { archive } from '../public/archive.js';

const collection = overrides => ({ version: 1, title: 'Memories', fragments: [{ id: 'F01', title: 'A note', text: 'Words worth keeping.', date: '2024-02-29' }], ...overrides });

test('collection import preserves text and source IDs without trusting metadata or mutating input', () => {
  const raw = collection({ id: 'bellwether', unexpected: 'ignored', fragments: [{ id: 'F01', title: '  A note  ', text: '<script>alert(1)</script>', date: '', kind: '__proto__', displayDate: 'INVENTED' }] });
  const before = structuredClone(raw);
  const imported = parseCollection(raw);
  assert.deepEqual(raw, before);
  assert.match(imported.id, /^collection-/);
  assert.equal(imported.fragments[0].id, 'F01');
  assert.equal(imported.fragments[0].title, 'A note');
  assert.equal(imported.fragments[0].text, '<script>alert(1)</script>');
  assert.equal(imported.fragments[0].kind, 'note');
  assert.equal(imported.fragments[0].displayDate, 'UNDATED');
  assert.ok(!('unexpected' in imported));
});

test('imports accept version 1 and original collections but reject unknown versions', () => {
  assert.equal(parseCollection(collection()).title, 'Memories');
  assert.equal(parseCollection({ ...archive }).fragments.length, 6);
  for (const version of [2, 0, '1', null, false]) assert.throws(() => parseCollection(collection({ version })), /format is not supported/);
});

test('calendar validation rejects normalized impossible dates and accepts leap days', () => {
  for (const date of ['2023-02-29', '2024-02-30', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-01', '2026-01-01T00:00:00Z', 123]) {
    assert.equal(validDate(date), false);
    assert.throws(() => parseCollection(collection({ fragments: [{ id: 'F01', title: 'Date', text: 'Words', date }] })), /real calendar dates/);
  }
  for (const date of ['2024-02-29', '2000-02-29', '2026-10-31', '0099-01-01']) assert.equal(validDate(date), true);
  assert.equal(formatDate('2024-02-29'), '29 FEB 2024');
  assert.equal(formatDate('2026-02-31'), 'UNDATED');
});

test('empty archives can be edited but invalid fragments and duplicate IDs cannot import', () => {
  assert.deepEqual(parseCollection(collection({ fragments: [] })).fragments, []);
  const f = collection().fragments[0];
  for (const fragments of [[f, f], [null], [{ ...f, id: 'F1' }], [{ ...f, title: ' ' }], [{ ...f, text: ' ' }], [{ ...f, text: 'x'.repeat(6001) }]])
    assert.throws(() => parseCollection(collection({ fragments })));
});

test('collection count, title, fragment and total-text limits hold for imported data', () => {
  for (const title of ['', ' ', 'x'.repeat(121), null]) assert.throws(() => parseCollection(collection({ title })));
  const makeFragments = (count, text) => Array.from({ length: count }, (_, i) => ({ id: `F${String(i + 1).padStart(2, '0')}`, title: 'A note', text }));
  assert.equal(parseCollection(collection({ fragments: makeFragments(30, 'Words') })).fragments.length, 30);
  assert.throws(() => parseCollection(collection({ fragments: makeFragments(31, 'Words') })), /30 fragments/);
  assert.equal(parseCollection(collection({ fragments: makeFragments(10, 'x'.repeat(6000)) })).fragments.length, 10);
  assert.throws(() => parseCollection(collection({ fragments: makeFragments(11, 'x'.repeat(6000)) })), /60,000/);
});

test('exported collections can be reimported with all evidence text and metadata intact', () => {
  const imported = parseCollection({ version: 1, ...archive });
  const roundtrip = parseCollection(JSON.parse(JSON.stringify({ version: 1, ...imported })));
  assert.notEqual(imported.id, roundtrip.id);
  assert.deepEqual(imported.fragments, roundtrip.fragments);
  assert.equal(roundtrip.fictional, true);
});
