const text = value => typeof value === 'string' ? value : '';
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

// Copy only the displayed reading and cited metadata. Never export whole archives
// or arbitrary provider fields; the result remains independent of later edits.
export function createReadingSnapshot({ collection, question, reading, createdAt = new Date().toISOString() }) {
  if (!collection || !Array.isArray(collection.fragments) || !reading || !['sample', 'live', 'local'].includes(reading.mode))
    throw new Error('A completed reading and its collection are required.');
  const timestamp = new Date(createdAt);
  if (Number.isNaN(timestamp.getTime())) throw new Error('The reading needs a valid timestamp.');
  if (!Array.isArray(reading.evidence)) throw new Error('The reading needs an evidence list.');
  const evidence = reading.evidence.map(item => {
    const source = collection.fragments.find(fragment => fragment.id === item.sourceId);
    if (!source || typeof item.quote !== 'string' || !item.quote || !source.text.includes(item.quote))
      throw new Error('A reading quotation no longer matches its source.');
    return {
      sourceId: source.id, title: text(source.title), quote: item.quote,
      date: text(source.date), from: text(source.from), note: text(source.note)
    };
  });
  const cited = new Set(evidence.map(item => item.sourceId));
  const considered = [];
  if (reading.mode !== 'sample' && Array.isArray(reading.retrieved)) {
    for (const item of reading.retrieved) {
      const source = collection.fragments.find(fragment => fragment.id === item.id);
      if (source && !considered.some(fragment => fragment.id === source.id))
        considered.push({ id: source.id, title: text(source.title), cited: cited.has(source.id) });
    }
  }
  return freeze({
    version: 1, createdAt: timestamp.toISOString(), question: text(question),
    collectionTitle: text(collection.title), title: text(reading.title), reading: text(reading.reading),
    uncertainty: text(reading.uncertainty), mode: reading.mode,
    model: reading.mode !== 'sample' ? text(reading.model) : null,
    provider: reading.mode === 'live' ? text(reading.provider) : null,
    evidence, considered, totalFragments: collection.fragments.length
  });
}

// Escape markup and autolink punctuation before putting untrusted words in a
// portable Markdown file. Each multiline passage stays inside one blockquote.
const escapeMarkdown = value => text(value).replace(/&/g, '&amp;').replace(/[\\`*_{}\[\]()<>#+.!|~:@\-]/g, '\\$&');
const inline = value => escapeMarkdown(text(value).replace(/\s+/g, ' ').trim());
const block = value => text(value).replace(/\r\n?/g, '\n').split('\n').map(line => `> ${escapeMarkdown(line)}`).join('\n');

export function readingMarkdown(snapshot) {
  const lines = [
    `# ${inline(snapshot.title)}`, '',
    snapshot.mode === 'live' ? '**HOSTED AI READING**' : snapshot.mode === 'local'
      ? '**ON-DEVICE AI · EXTRACTIVE READING**' : '**AUTHORED SAMPLE — NOT AI-GENERATED**', '',
    `Collection: ${inline(snapshot.collectionTitle)}`, '',
    `Recorded: ${inline(snapshot.createdAt)}`, '',
    '## Question', '', block(snapshot.question), '',
    '## Reading', '', block(snapshot.reading), '',
    '## Source quotations', ''
  ];
  if (!snapshot.evidence.length) lines.push('No supporting quotations were returned.', '');
  for (const source of snapshot.evidence) {
    lines.push(`### ${inline(source.sourceId)} · ${inline(source.title)}`, '', block(source.quote), '');
    if (source.date) lines.push(`Date: ${inline(source.date)}`, '');
    if (source.from) lines.push(`Attribution: ${inline(source.from)}`, '');
    if (source.note) lines.push('Archivist note:', '', block(source.note), '');
  }
  lines.push('## What remains unknown', '', block(snapshot.uncertainty), '');
  if (snapshot.mode !== 'sample') {
    lines.push('## Generation details', '', `${snapshot.mode === 'local' ? 'Model' : 'Requested model'}: ${inline(snapshot.model || 'Not recorded')}`, '');
    if (snapshot.mode === 'live') lines.push(`Provider: ${inline(snapshot.provider || 'Not recorded')}`, '');
    else lines.push('Extractive inference ran on this device. The model selects source text instead of generating a free-form answer.', '');
    if (snapshot.considered.length) {
      lines.push(`Fragments considered: ${snapshot.considered.length} of ${snapshot.totalFragments}.`, '');
      for (const source of snapshot.considered)
        lines.push(`- ${inline(source.id)} · ${inline(source.title)} — ${source.cited ? 'cited' : 'considered, not cited'}`);
      lines.push('');
      if (snapshot.considered.length < snapshot.totalFragments)
        lines.push('Only part of the collection was considered. Other fragments may contain relevant evidence.', '');
    } else lines.push('The retrieval list was not recorded.', '');
  }
  lines.push('A matching quotation verifies its source, not every interpretation. This file contains a snapshot of the reading and cited quotations, not a collection backup.', '');
  return lines.join('\n');
}

export function readingFilename(snapshot) {
  const stem = snapshot.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 70);
  return `${stem || 'archive'}-reading.md`;
}
