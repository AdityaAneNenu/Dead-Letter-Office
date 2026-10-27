import { mkdir, rename, rm, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_DIRECTORY, MODEL_MANIFEST, verifyModelFile, verifyModelDirectory } from '../lib/local-ai.mjs';

export async function setupModel({ directory = MODEL_DIRECTORY, fetcher = fetch } = {}) {
  for (const entry of MODEL_MANIFEST.files) {
    const target = path.resolve(directory, entry.path);
    if (!target.startsWith(path.resolve(directory) + path.sep)) throw new Error('Invalid model path.');
    if (await verifyModelFile(target, entry).catch(() => false)) { console.log(`Verified ${entry.path}`); continue; }
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = target + '.download';
    let complete = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let file;
      try {
        console.log(`Downloading ${entry.path} (${(entry.size / 1000000).toFixed(1)} MB), attempt ${attempt}/3`);
        const url = `${MODEL_MANIFEST.source}/resolve/${MODEL_MANIFEST.revision}/${entry.path}?download=true`;
        const response = await fetcher(url, { signal: AbortSignal.timeout(180000) });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        file = await open(temporary, 'w');
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > entry.size) throw new Error('Download larger than pinned file.');
          await file.write(chunk);
        }
        await file.close(); file = null;
        if (!await verifyModelFile(temporary, entry)) throw new Error('Pinned checksum did not match.');
        await rename(temporary, target);
        complete = true; break;
      } catch (error) {
        await file?.close();
        await rm(temporary, { force: true });
        if (attempt === 3) throw new Error(`Could not download verified ${entry.path}: ${error.message}`);
      }
    }
    if (!complete) throw new Error(`Incomplete model file: ${entry.path}`);
  }
  if (!await verifyModelDirectory(directory)) throw new Error('Model verification failed.');
  console.log(`Ready: ${MODEL_MANIFEST.id} (${MODEL_MANIFEST.license}). No API key or model server is required.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setupModel().catch(error => { console.error(error.message); process.exitCode = 1; });
}
