const kinds = new Set(['letter', 'photograph', 'receipt', 'transcript', 'note', 'postcard']);
const stringField = (value, max, fallback = '') => typeof value === 'string' ? value.slice(0, max).trim() : fallback;

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function formatDate(date) {
  if (!validDate(date)) return 'UNDATED';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(date + 'T12:00:00Z')).toUpperCase();
}

// Validate imports, saved browser data and editor changes through the same boundary.
// Missing version accepts collections from the original app; future formats must be explicit.
export function parseCollection(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 120)
    throw new Error('The collection needs a title of 1–120 characters.');
  if (Object.hasOwn(raw, 'version') && raw.version !== 1)
    throw new Error('This archive format is not supported. Import a version 1 export.');
  if (!Array.isArray(raw.fragments) || raw.fragments.length > 30) throw new Error('A collection can hold up to 30 fragments.');
  const ids = new Set();
  const fragments = raw.fragments.map(f => {
    if (!f || typeof f !== 'object' || Array.isArray(f) || typeof f.id !== 'string' || !/^F\d{2,3}$/.test(f.id) || ids.has(f.id))
      throw new Error('Each fragment needs a unique ID such as F01.');
    ids.add(f.id);
    if (typeof f.title !== 'string' || !f.title.trim() || f.title.length > 120 || typeof f.text !== 'string' || !f.text.trim() || f.text.length > 6000)
      throw new Error('Fragments need a title (up to 120 characters) and text (up to 6,000).');
    const date = f.date ?? '';
    if (date !== '' && !validDate(date)) throw new Error('Fragment dates must be real calendar dates in YYYY-MM-DD format, or left empty.');
    return {
      id: f.id, title: f.title.trim(), text: f.text.trim(), kind: kinds.has(f.kind) ? f.kind : 'note',
      date, displayDate: formatDate(date), from: stringField(f.from, 160, 'From the collection'), note: stringField(f.note, 300)
    };
  });
  if (fragments.reduce((sum, f) => sum + f.text.length, 0) > 60000)
    throw new Error('Keep the collection under 60,000 characters of fragment text.');
  return {
    id: 'collection-' + crypto.randomUUID(), title: raw.title.trim(), person: stringField(raw.person, 120),
    description: stringField(raw.description, 700, 'A collection of words worth keeping.'), fictional: raw.fictional === true, fragments
  };
}
