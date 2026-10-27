// These decisions are deterministic and tested independently of the neural model.
// Logit margins rank model preferences; they are not calibrated truth probabilities.
export function selectAnswerSpan(start, end, contextMask, { maxTokens = 48, minimumMargin = 2 } = {}) {
  if (!start.length || start.length !== end.length || start.length !== contextMask.length) return null;
  const nullScore = Number(start[0]) + Number(end[0]);
  if (!Number.isFinite(nullScore)) return null;
  let best = null;
  for (let i = 1; i < start.length; i++) {
    if (!contextMask[i] || !Number.isFinite(Number(start[i]))) continue;
    for (let j = i; j < Math.min(start.length, i + maxTokens); j++) {
      if (!contextMask[j]) break;
      const score = Number(start[i]) + Number(end[j]);
      if (Number.isFinite(score) && (!best || score > best.score)) best = { start: i, end: j, score, margin: score - nullScore };
    }
  }
  return best && best.margin >= minimumMargin ? best : null;
}

export function chunkText(text, maxChars = 1000, overlap = 120) {
  if (!Number.isInteger(maxChars) || maxChars < 32 || !Number.isInteger(overlap) || overlap < 0 || overlap >= maxChars)
    throw new Error('Invalid chunk size or overlap.');
  const chunks = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + maxChars);
    // Do not split a UTF-16 surrogate pair at a chunk boundary.
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    chunks.push({ text: text.slice(start, end), offset: start });
    if (end === text.length) break;
    start = end - overlap;
    if (/[\uDC00-\uDFFF]/.test(text[start])) start++;
  }
  return chunks;
}

// The decoder must point to real source characters. No fuzzy/invented spans enter UI.
export function evidenceForAnswer(source, chunk, answer) {
  if (typeof answer !== 'string' || !answer.trim()) return null;
  const clean = answer.trim();
  const position = chunk.text.indexOf(clean);
  if (position < 0) return null;
  const start = chunk.offset + position;
  const end = start + clean.length;
  if (source.text.slice(start, end) !== clean) return null;
  let left = start;
  let right = end;
  while (left > 0 && !/[.!?\n]/.test(source.text[left - 1]) && start - left < 260) left--;
  while (right < source.text.length && !/[.!?\n]/.test(source.text[right]) && right - end < 260) right++;
  if (right < source.text.length && /[.!?]/.test(source.text[right])) right++;
  const quote = source.text.slice(left, right).trim();
  if (quote.length < 12) return null;
  return { sourceId: source.id, quote, answer: clean };
}

export function extractiveReading(candidate) {
  if (!candidate) return {
    title: 'Some things are still quiet',
    reading: 'The on-device model did not identify a sufficiently supported answer in the considered fragments.',
    evidence: [],
    uncertainty: 'This is not proof that an answer is absent. Try a direct factual question or add another fragment. The English question-answering model can miss evidence.'
  };
  return {
    title: 'A passage to return to',
    reading: `The on-device model selected “${candidate.answer}” from this fragment. Read the surrounding quotation before treating it as an answer.`,
    evidence: [{ sourceId: candidate.sourceId, quote: candidate.quote }],
    uncertainty: 'This is an extractive reading: the model selects existing words, rather than writing a new story. The quoted text is verified, but its relevance to the question still needs your judgment.'
  };
}
