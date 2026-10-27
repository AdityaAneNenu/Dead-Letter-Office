import { parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { AutoTokenizer, AutoModelForQuestionAnswering, env } from '@huggingface/transformers';
import { chunkText, selectAnswerSpan, evidenceForAnswer, extractiveReading } from './qa-core.mjs';

// Setup is the only networked path. User questions and archive text stay in-process.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFSCache = false;
let loaded;
function load() {
  return loaded ||= Promise.all([
    AutoTokenizer.from_pretrained(workerData.modelDir, { local_files_only: true }),
    AutoModelForQuestionAnswering.from_pretrained(workerData.modelDir, {
      local_files_only: true, dtype: 'q8', device: 'cpu',
      session_options: { intraOpNumThreads: Math.min(4, availableParallelism()), interOpNumThreads: 1 }
    })
  ]);
}

parentPort.on('message', async ({ id, question, fragments }) => {
  try {
    const [tokenizer, model] = await load();
    if (tokenizer.encode(question, { add_special_tokens: false }).length > 128) {
      parentPort.postMessage({ id, error: 'Shorten the question for the on-device model (up to 128 model tokens). Direct English questions work best.', status: 400 });
      return;
    }
    let best = null;
    for (const source of fragments) {
      const queue = chunkText(source.text);
      while (queue.length) {
        const chunk = queue.shift();
        const encoded = tokenizer.encode(question, { text_pair: chunk.text });
        if (encoded.length > 512) {
          const size = Math.max(32, Math.floor(chunk.text.length / 2));
          if (size >= chunk.text.length) continue;
          queue.unshift(...chunkText(chunk.text, size, Math.min(40, Math.floor(size / 4)))
            .map(part => ({ text: part.text, offset: chunk.offset + part.offset })));
          continue;
        }
        const inputs = tokenizer(question, { text_pair: chunk.text, truncation: true, max_length: 512 });
        const ids = inputs.input_ids.tolist()[0];
        const mask = inputs.attention_mask.tolist()[0];
        const separator = ids.findIndex(value => Number(value) === tokenizer.sep_token_id);
        const special = new Set(tokenizer.all_special_ids.map(Number));
        const contextMask = ids.map((value, index) => index > separator && Number(mask[index]) === 1 && !special.has(Number(value)));
        const { start_logits, end_logits } = await model(inputs);
        const span = selectAnswerSpan(start_logits[0].tolist(), end_logits[0].tolist(), contextMask);
        if (!span || (best && span.margin <= best.margin)) continue;
        const decoded = tokenizer.decode(ids.slice(span.start, span.end + 1), { skip_special_tokens: true, clean_up_tokenization_spaces: false });
        const evidence = evidenceForAnswer(source, chunk, decoded);
        if (evidence) best = { ...evidence, margin: span.margin };
      }
    }
    parentPort.postMessage({ id, reading: extractiveReading(best) });
  } catch {
    parentPort.postMessage({ id, error: 'The on-device model could not complete this reading. Run npm run setup:model to verify its files, then retry.', status: 503 });
  }
});
