import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isIP } from 'node:net';
import { AppError, validateRequest, retrieve, makeMessages, validateReading } from './lib/archive.mjs';
import { createLocalAI, MODEL_MANIFEST } from './lib/local-ai.mjs';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']],
  ['/archive.js', ['archive.js', 'text/javascript']], ['/collections.js', ['collections.js', 'text/javascript']],
  ['/reading-export.js', ['reading-export.js', 'text/javascript']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);

export function modelBase(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('AI_BASE_URL must be a hosted HTTPS API URL.'); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.port || isIP(hostname) || !hostname.includes('.') ||
      /(^|\.)(localhost|local|internal)$/.test(hostname) || hostname.endsWith('.'))
    throw new Error('AI_BASE_URL must use a hosted HTTPS hostname on port 443, without credentials, query, or fragment.');
  return url.href.replace(/\/+$/, '');
}

async function body(req) {
  let size = 0; const chunks = [];
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > 300000) throw new AppError('Archive is too large.', 413);
      chunks.push(chunk);
    }
  } catch (error) { req.resume(); throw error; }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('Request must contain valid JSON.'); }
}

async function providerJson(response) {
  const chunks = []; let size = 0;
  try {
    if (!response.body) throw new Error();
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1000000) throw new Error();
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
    throw new AppError('The AI provider returned an invalid or oversized response. This reading was withheld.', 502);
  }
}

function upstreamError(status) {
  if (status === 401 || status === 403) return new AppError('The AI provider rejected the credentials. Check AI_API_KEY and model access in your server configuration.', 503);
  if (status === 429) return new AppError('The AI provider rate limit was reached. Wait a moment before trying again.', 429);
  if (status === 404) return new AppError('The configured model or endpoint was not found. Check AI_BASE_URL and AI_MODEL.', 502);
  return new AppError('The AI provider could not complete this reading. Check your configuration and try again.', 502);
}

function safeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const result = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    if (Number.isSafeInteger(usage[key]) && usage[key] >= 0) result[key] = usage[key];
  }
  return Object.keys(result).length ? result : null;
}

export function createServer({ baseUrl = process.env.AI_BASE_URL || '', apiKey = process.env.AI_API_KEY || '',
  modelName = process.env.AI_MODEL || '', fetcher = fetch, timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60000),
  localAI = createLocalAI() } = {}) {
  if (![baseUrl, apiKey, modelName].every(value => typeof value === 'string')) throw new Error('AI configuration must contain strings.');
  baseUrl = baseUrl.trim(); apiKey = apiKey.trim(); modelName = modelName.trim();
  if (baseUrl) baseUrl = modelBase(baseUrl);
  const configured = Boolean(baseUrl && apiKey && modelName);
  if (!configured && (baseUrl || apiKey || modelName)) throw new Error('Set AI_BASE_URL, AI_MODEL and AI_API_KEY together, or leave all three empty for on-device AI.');
  if (/[\r\n]/.test(apiKey) || apiKey.length > 4096 || /[\x00-\x1f\x7f]/.test(modelName) || modelName.length > 200)
    throw new Error('AI credentials or model configuration has an invalid format.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000) throw new Error('AI_TIMEOUT_MS must be an integer between 1000 and 180000.');
  const provider = configured ? new URL(baseUrl).hostname : null;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  let busy = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const json = (status, data) => {
      if (res.destroyed || res.writableEnded) return;
      if (status === 429) res.setHeader('Retry-After', '30');
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
    };
    try {
      const host = req.headers.host;
      if (!host || !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host))
        throw new AppError('Use the local address to open this archive.', 403);
      if (req.headers.origin && req.headers.origin !== `http://${host}`)
        throw new AppError('Cross-origin requests are not permitted.', 403);
      const pathname = new URL(req.url, `http://${host}`).pathname;
      if (req.method === 'GET' && pathname === '/api/health') {
        if (!configured) {
          const status = await localAI.status();
          json(200, { ...status, configured: status.ready, provider: null, runtime: 'local' }); return;
        }
        const health = { ready: false, configured, model: configured ? modelName : null, provider, runtime: 'hosted' };
        try {
          const result = await fetcher(baseUrl + '/models', { headers, signal: AbortSignal.timeout(3000), redirect: 'error' });
          if (!result.ok) { await result.body?.cancel(); throw upstreamError(result.status); }
          const data = await providerJson(result);
          if (!Array.isArray(data?.data) || !data.data.some(item => item?.id === modelName))
            throw new AppError('The configured model is not in this provider’s model list. Check AI_MODEL and account access.', 503);
          json(200, { ...health, ready: true });
        } catch (error) { json(200, { ...health, error: error instanceof AppError ? error.message : 'The hosted AI provider could not be reached. Check your connection and server configuration.' }); }
        return;
      }
      if (req.method === 'POST' && pathname === '/api/read') {
        if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AppError('Use application/json.', 415);
        const payload = await body(req);
        const input = validateRequest(payload);
        if (configured && payload.allowHosted !== true) throw new AppError('Allow sending your question and selected fragments to the hosted AI provider in AI settings first.', 403);
        if (busy) throw new AppError('The archivist is finishing another reading. Try again in a moment.', 429);
        busy = true;
        const controller = new AbortController();
        const disconnect = () => { if (!res.writableEnded) controller.abort(); };
        res.once('close', disconnect);
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
        try {
          const context = retrieve(input.question, input.fragments);
          const start = performance.now();
          if (!configured) {
            const raw = await localAI.read(input.question, context, { signal });
            const reading = validateReading(raw, context);
            json(200, { ...reading, mode: 'local', model: MODEL_MANIFEST.id, provider: null,
              durationMs: Math.round(performance.now() - start), usage: null,
              retrieved: context.map(({ id, score }) => ({ id, score })) });
            return;
          }
          const result = await fetcher(baseUrl + '/chat/completions', {
            method: 'POST', headers,
            body: JSON.stringify({ model: modelName, messages: makeMessages(input.question, context),
              temperature: 0.2, max_completion_tokens: 4096, stream: false,
              response_format: { type: 'json_object' } }),
            signal, redirect: 'error'
          });
          if (!result.ok) { await result.body?.cancel(); throw upstreamError(result.status); }
          const data = await providerJson(result);
          const choice = data?.choices?.[0];
          if (choice?.message?.refusal || (choice?.finish_reason && choice.finish_reason !== 'stop'))
            throw new AppError('The model refused or stopped before completing this reading. This reading was withheld. Try a shorter question.', 502);
          let raw;
          try { raw = JSON.parse(choice?.message?.content || ''); }
          catch { throw new AppError('The model returned invalid JSON. This reading was withheld. Try again.', 502); }
          const reading = validateReading(raw, context);
          json(200, { ...reading, mode: 'live', model: modelName, provider,
            durationMs: Math.round(performance.now() - start), usage: safeUsage(data.usage),
            retrieved: context.map(({ id, score }) => ({ id, score })) });
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof AppError) throw error;
          throw new AppError(error.name === 'TimeoutError' || signal.reason?.name === 'TimeoutError'
            ? 'The model took too long. Try fewer fragments or a shorter question.'
            : configured ? 'The hosted AI provider could not be reached. Check your connection and AI settings.'
              : 'The on-device model could not complete the reading. Check model setup and retry.', 503);
        } finally { busy = false; res.removeListener('close', disconnect); }
        return;
      }
      if (req.method === 'GET' && files.has(pathname)) {
        const [name, mime] = files.get(pathname);
        const content = await readFile(path.join(root, name));
        res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(content); return;
      }
      json(404, { error: 'This drawer is empty. Page not found.' });
    } catch (error) { json(error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' }); }
  });
  server.once('close', () => { Promise.resolve(localAI.close()).catch(() => {}); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const port = Number(process.env.PORT || 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
    const server = createServer();
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'That port is in use. Set a different PORT in .env.' : 'The archive server could not start.'); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Dead Letter Office → http://127.0.0.1:${port}`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
