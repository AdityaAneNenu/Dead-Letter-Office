import { Worker } from 'node:worker_threads';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { AppError } from './archive.mjs';

export const MODEL_MANIFEST = JSON.parse(await readFile(new URL('../docs/model-manifest.json', import.meta.url), 'utf8'));
export const MODEL_DIRECTORY = fileURLToPath(new URL('../.runtime/models/tinyroberta/', import.meta.url));

export async function verifyModelFile(filename, entry) {
  const info = await stat(filename);
  if (!info.isFile() || info.size !== entry.size) return false;
  const hash = createHash(entry.sha256 ? 'sha256' : 'sha1');
  if (!entry.sha256) hash.update(`blob ${info.size}\0`);
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex') === (entry.sha256 || entry.gitBlob);
}

export async function verifyModelDirectory(directory = MODEL_DIRECTORY) {
  try {
    for (const entry of MODEL_MANIFEST.files) {
      if (!await verifyModelFile(path.join(directory, entry.path), entry)) return false;
    }
    return true;
  } catch { return false; }
}

export function createLocalAI({ modelDir = MODEL_DIRECTORY, checkModel = verifyModelDirectory,
  workerFactory = () => new Worker(new URL('./qa-worker.mjs', import.meta.url), { workerData: { modelDir } }) } = {}) {
  let worker = null;
  let pending = null;
  let sequence = 0;
  let verifiedSignature = null;
  let verified = false;
  const unavailable = () => new AppError('The on-device model is missing or damaged. Run npm run setup:model, then check the connection again.', 503);
  async function status() {
    try {
      const files = await Promise.all(MODEL_MANIFEST.files.map(entry => stat(path.join(modelDir, entry.path))));
      const signature = files.map(file => `${file.size}:${file.mtimeMs}`).join('|');
      if (signature !== verifiedSignature) { verified = await checkModel(modelDir); verifiedSignature = signature; }
    } catch { verified = false; verifiedSignature = null; }
    return { ready: verified, model: MODEL_MANIFEST.id, ...(verified ? {} : { error: unavailable().message }) };
  }
  function settle(error, result) {
    if (!pending) return;
    const operation = pending; pending = null;
    operation.signal?.removeEventListener('abort', operation.abort);
    error ? operation.reject(error) : operation.resolve(result);
  }
  function ensureWorker() {
    if (worker) return;
    const active = workerFactory(); worker = active;
    active.on('message', message => {
      if (worker !== active || message.id !== pending?.id) return;
      if (message.error) settle(new AppError(message.error, message.status === 400 ? 400 : 503));
      else settle(null, message.reading);
    });
    active.on('error', () => {
      if (worker !== active) return;
      worker = null; settle(new AppError('The on-device model could not run. Check model setup and retry.', 503));
    });
    active.on('exit', () => {
      if (worker !== active) return;
      worker = null; settle(new AppError('The on-device model stopped. Please retry the reading.', 503));
    });
  }
  async function read(question, fragments, { signal } = {}) {
    signal?.throwIfAborted();
    if (pending) throw new AppError('The archivist is finishing another reading. Try again in a moment.', 429);
    if (!(await status()).ready) throw unavailable();
    signal?.throwIfAborted();
    // A second request might enter while integrity checks await disk I/O.
    if (pending) throw new AppError('The archivist is finishing another reading. Try again in a moment.', 429);
    ensureWorker();
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const abort = () => {
        const abandoned = worker; worker = null;
        settle(signal.reason || new DOMException('Reading cancelled', 'AbortError'));
        abandoned?.terminate();
      };
      pending = { id, resolve, reject, signal, abort };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      worker.postMessage({ id, question, fragments });
    });
  }
  async function close() {
    const current = worker; worker = null;
    settle(new DOMException('Archive closed', 'AbortError'));
    await current?.terminate();
  }
  return { status, read, close };
}
