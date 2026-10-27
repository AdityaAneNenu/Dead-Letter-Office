import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createServer, modelBase } from '../server.mjs';
import { AppError } from '../lib/archive.mjs';

const config = { baseUrl: 'https://api.example.com/v1', apiKey: 'test-secret', modelName: 'test-open-model' };
const fragment = { id: 'F01', title: 'The window', text: 'The lamp stayed lit until the last ferry.' };
const input = { question: 'When was the lamp lit?', fragments: [fragment], allowHosted: true };
const reading = { title: 'A light at the window', reading: 'The lamp stayed lit until the last ferry.', evidence: [{ sourceId: 'F01', quote: fragment.text }], uncertainty: 'No other details are recorded.' };
const completion = (raw = reading, overrides = {}) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }], model: 'untrusted-provider-name', usage: { prompt_tokens: 100, completion_tokens: 40 }, ...overrides });

async function start(t, options = {}) {
  const server = createServer({ ...config, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const done = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await done;
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function post(url, payload = input, extra = {}) {
  const { headers, ...options } = extra;
  return fetch(url + '/api/read', { method: 'POST', body: JSON.stringify(payload), ...options,
    headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers } });
}

function rawRequest(url, { method = 'GET', path = '/', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url + path, { method, headers: { Connection: 'close', ...headers } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('model endpoint requires a hosted HTTPS hostname and no embedded credentials', () => {
  assert.equal(modelBase('https://api.example.com/v1/'), config.baseUrl);
  assert.equal(modelBase('https://api.example.com:443/v1'), config.baseUrl);
  for (const value of [
    'http://api.example.com/v1', 'https://127.0.0.1/v1', 'https://[::1]/v1', 'https://10.0.0.1/v1',
    'https://8.8.8.8/v1', 'https://localhost/v1', 'https://host.local/v1', 'https://host.internal/v1',
    'https://host.localhost/v1', 'https://api.example.com./v1', 'https://api.example.com:8081/v1',
    'https://user:password@api.example.com/v1', 'https://api.example.com/v1?key=secret',
    'https://api.example.com/v1#fragment', 'file:///models', 'not a url',
  ]) assert.throws(() => modelBase(value), undefined, value);
});

test('explicit createServer configuration cannot bypass endpoint or credential validation', () => {
  for (const options of [
    { baseUrl: 'http://127.0.0.1:8081/v1' }, { baseUrl: '' }, { modelName: '' }, { apiKey: '' },
    { apiKey: 'test\r\nInjected: secret' }, { modelName: 'name\u0000hidden' }, { apiKey: 123 },
    { timeoutMs: 999 }, { timeoutMs: 180001 }, { timeoutMs: 1000.5 }, { timeoutMs: NaN },
  ]) assert.throws(() => createServer({ ...config, ...options }));
});

test('missing model files leave the sample available without contacting a provider', async t => {
  let calls = 0;
  const url = await start(t, { baseUrl: '', apiKey: '', modelName: '', fetcher: async () => { calls++; throw new Error(); },
    localAI: { status: async () => ({ready: false, model: 'tinyroberta', error: 'Run npm run setup:model'}),
      read: async () => {throw new AppError('Run npm run setup:model', 503);}, close: async () => {} } });
  const health = await (await fetch(url + '/api/health')).json();
  assert.equal(health.ready, false);
  assert.equal(health.configured, false);
  assert.equal(health.model, 'tinyroberta');
  assert.equal(health.provider, null);
  assert.equal(health.runtime, 'local');
  assert.match(health.error, /setup:model/);
  assert.equal((await post(url)).status, 503);
  assert.equal((await fetch(url + '/')).status, 200);
  assert.equal(calls, 0);
});

test('on-device readings require no hosted consent and still validate quotations', async t => {
  let called; let output = reading; let networkCalls = 0;
  const url = await start(t, { baseUrl: '', apiKey: '', modelName: '', fetcher: async () => {networkCalls++; throw new Error();},
    localAI: { status: async () => ({ready:true,model:'tinyroberta'}),
      read: async (...args) => {called=args; return output;}, close: async () => {} } });
  const response = await post(url, {...input,allowHosted:false});
  assert.equal(response.status,200);
  const result = await response.json();
  assert.equal(result.mode,'local'); assert.equal(result.provider,null);
  assert.deepEqual(result.evidence,reading.evidence);
  assert.equal(called[0],input.question); assert.equal(called[1][0].id,fragment.id);
  assert.ok(called[2].signal instanceof AbortSignal);
  output = {...reading,evidence:[{sourceId:'F01',quote:'This quote was never in the source.'}]};
  assert.equal((await post(url,{...input,allowHosted:false})).status,422);
  assert.equal(networkCalls,0);
});

test('health validates the configured model and keeps credentials server-side', async t => {
  let called;
  const url = await start(t, { fetcher: async (endpoint, options) => {
    called = { endpoint, options };
    return Response.json({ data: [{ id: 'another-model' }, { id: config.modelName }] });
  } });
  const response = await fetch(url + '/api/health');
  assert.deepEqual(await response.json(), { ready: true, configured: true, model: config.modelName, provider: 'api.example.com', runtime: 'hosted' });
  assert.equal(called.endpoint, config.baseUrl + '/models');
  assert.equal(called.options.headers.Authorization, 'Bearer test-secret');
  assert.equal(called.options.redirect, 'error');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('health rejects errors, malformed lists, and a list without the configured model', async t => {
  const cases = [
    ['network error', async () => { throw new Error('private network details test-secret'); }],
    ['upstream error', async () => new Response('test-secret', { status: 503 })],
    ['empty list', async () => Response.json({ data: [] })],
    ['missing list', async () => Response.json({ unexpected: true })],
    ['different model', async () => Response.json({ data: [{ id: 'wrong-model' }] })],
    ['non-JSON', async () => new Response('not JSON')],
    ['null', async () => Response.json(null)],
  ];
  for (const [name, fetcher] of cases) await t.test(name, async st => {
    const url = await start(st, { fetcher });
    const response = await fetch(url + '/api/health');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ready, false);
    assert.equal(result.configured, true);
    assert.equal(result.model, config.modelName);
    assert.equal(result.provider, 'api.example.com');
    assert.equal(result.runtime, 'hosted');
    assert.equal(typeof result.error, 'string');
    assert.doesNotMatch(JSON.stringify(result), /test-secret|private network details/);
  });
});

test('live read sends only retrieved archive text and returns checked evidence', async t => {
  let called;
  const url = await start(t, { fetcher: async (endpoint, options) => {
    called = { endpoint, options, payload: JSON.parse(options.body) }; return completion();
  } });
  const response = await post(url, { ...input, fragments: [{ ...fragment, privateNote: 'never send unused metadata' }] });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, 'live');
  assert.equal(result.model, config.modelName);
  assert.equal(result.provider, 'api.example.com');
  assert.deepEqual(result.evidence, reading.evidence);
  assert.deepEqual(result.usage, { prompt_tokens: 100, completion_tokens: 40 });
  assert.ok(Number.isInteger(result.durationMs) && result.durationMs >= 0);
  assert.equal(result.retrieved[0].id, fragment.id);
  assert.equal(called.endpoint, config.baseUrl + '/chat/completions');
  assert.equal(called.options.headers.Authorization, 'Bearer test-secret');
  assert.equal(called.options.redirect, 'error');
  assert.equal(called.payload.model, config.modelName);
  assert.equal(called.payload.stream, false);
  assert.deepEqual(called.payload.response_format, { type: 'json_object' });
  assert.ok(!('chat_template_kwargs' in called.payload));
  const prompt = JSON.parse(called.payload.messages.at(-1).content);
  assert.equal(prompt.archive[0].sourceId, fragment.id);
  assert.equal(prompt.archive[0].text, fragment.text);
  assert.doesNotMatch(JSON.stringify(called.payload), /never send unused metadata|test-secret/);
  assert.doesNotMatch(JSON.stringify(result), /test-secret/);
});

test('a live request must explicitly consent to hosted processing', async t => {
  let calls = 0;
  const url = await start(t, { fetcher: async () => { calls++; return completion(); } });
  for (const allowHosted of [undefined, false, 'true', 1, null]) {
    const response = await post(url, { ...input, allowHosted });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /hosted AI provider/);
  }
  assert.equal(calls, 0);
});

test('invalid requests never reach the model', async t => {
  let calls = 0;
  const url = await start(t, { fetcher: async () => { calls++; return completion(); } });
  for (const body of [null, {}, { ...input, question: '' }, { ...input, fragments: [] }]) assert.equal((await post(url, body)).status, 400);
  const malformed = await rawRequest(url, { method: 'POST', path: '/api/read', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(malformed.status, 400);
  for (const type of ['text/plain', 'application/jsonp']) {
    const wrongType = await rawRequest(url, { method: 'POST', path: '/api/read', headers: { 'Content-Type': type }, body: JSON.stringify(input) });
    assert.equal(wrongType.status, 415);
  }
  assert.equal(calls, 0);
});

test('oversized HTTP request receives 413 without calling the model', async t => {
  let calls = 0;
  const url = await start(t, { fetcher: async () => { calls++; return completion(); } });
  const response = await rawRequest(url, { method: 'POST', path: '/api/read', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, question: 'x'.repeat(310000) }) });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test('foreign Host and Origin headers are rejected before model use', async t => {
  let calls = 0;
  const url = await start(t, { fetcher: async () => { calls++; return completion(); } });
  for (const headers of [{ Host: 'evil.example' }, { Host: '127.0.0.1.evil.example' }, { Origin: 'https://evil.example' }, { Origin: 'null' }]) {
    const response = await rawRequest(url, { path: '/api/health', headers });
    assert.equal(response.status, 403);
  }
  assert.equal(calls, 0);
  const allowed = await post(url, input, { headers: { 'Content-Type': 'Application/JSON; charset=utf-8', Origin: url } });
  assert.equal(allowed.status, 200);
});

test('network and timeout responses are safe and never substitute sample readings', async t => {
  for (const error of [new Error('private connection details test-secret'), new DOMException('expired', 'TimeoutError')]) {
    await t.test(error.name, async st => {
      const url = await start(st, { fetcher: async () => { throw error; } });
      const response = await post(url);
      assert.equal(response.status, 503);
      const result = await response.json();
      assert.match(result.error, error.name === 'TimeoutError' ? /too long/ : /could not be reached/);
      assert.ok(!('reading' in result));
      assert.doesNotMatch(JSON.stringify(result), /test-secret|private connection details/);
    });
  }
});

test('provider authentication, rate limit and server failures have actionable safe errors', async t => {
  for (const [upstream, expected] of [[401, 503], [403, 503], [429, 429], [404, 502], [500, 502]]) {
    await t.test(`upstream ${upstream}`, async st => {
      const url = await start(st, { fetcher: async () => new Response('private provider error test-secret', { status: upstream }) });
      const response = await post(url);
      assert.equal(response.status, expected);
      if (upstream === 429) assert.ok(Number(response.headers.get('retry-after')) > 0);
      const result = await response.json();
      assert.equal(typeof result.error, 'string');
      assert.doesNotMatch(JSON.stringify(result), /test-secret|private provider error/);
      assert.ok(!('reading' in result));
    });
  }
});

test('malformed, oversized, refused and fabricated provider readings are withheld', async t => {
  const cases = [
    { name: 'non-JSON upstream', fetcher: async () => new Response('<html>bad gateway</html>'), status: 502 },
    { name: 'oversized upstream', fetcher: async () => new Response('x'.repeat(1000001)), status: 502 },
    { name: 'non-JSON model content', fetcher: async () => Response.json({ choices: [{ message: { content: 'Here is your answer' } }] }), status: 502 },
    { name: 'invalid schema', fetcher: async () => completion({ ...reading, evidence: 'not an array' }), status: 502 },
    { name: 'refusal with plausible content', fetcher: async () => completion(reading, { choices: [{ message: { refusal: 'Cannot answer', content: JSON.stringify(reading) }, finish_reason: 'stop' }] }), status: 502 },
    { name: 'truncated valid JSON', fetcher: async () => completion(reading, { choices: [{ message: { content: JSON.stringify(reading) }, finish_reason: 'length' }] }), status: 502 },
    { name: 'fabricated quote', fetcher: async () => completion({ ...reading, evidence: [{ sourceId: 'F01', quote: 'Nora loved to sing on the ferry.' }] }), status: 422 },
  ];
  for (const item of cases) await t.test(item.name, async st => {
    const url = await start(st, { fetcher: item.fetcher });
    const response = await post(url);
    assert.equal(response.status, item.status);
    const result = await response.json();
    assert.equal(typeof result.error, 'string');
    assert.ok(!('reading' in result));
  });
});

test('untrusted usage fields and provider metadata are not exposed', async t => {
  const url = await start(t, { fetcher: async () => completion(reading, { usage: { prompt_tokens: -1, completion_tokens: '40', total_tokens: 140, private_detail: 'test-secret' } }) });
  const response = await post(url);
  const result = await response.json();
  assert.deepEqual(result.usage, { total_tokens: 140 });
  assert.equal(result.model, config.modelName);
  assert.doesNotMatch(JSON.stringify(result), /test-secret|untrusted-provider-name/);
});

test('an answer without evidence is replaced by an abstention', async t => {
  const url = await start(t, { fetcher: async () => completion({ ...reading, reading: 'An invented secret.', evidence: [] }) });
  const response = await post(url);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.evidence, []);
  assert.match(result.reading, /has not established an answer/);
  assert.doesNotMatch(result.reading, /invented secret/);
});

test('one model request runs at a time and capacity is released after completion', async t => {
  let release;
  let entered;
  const running = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const url = await start(t, { fetcher: async () => { calls++; entered(); await gate; return completion(); } });
  const first = post(url);
  await running;
  try {
    const second = await post(url);
    assert.equal(second.status, 429);
    assert.match((await second.json()).error, /another reading/);
    assert.equal(calls, 1);
  } finally { release(); }
  assert.equal((await first).status, 200);
  assert.equal((await post(url)).status, 200);
  assert.equal(calls, 2);
});

test('failed inference releases capacity for a subsequent reading', async t => {
  let calls = 0;
  const url = await start(t, { fetcher: async () => { if (++calls === 1) throw new Error('offline'); return completion(); } });
  assert.equal((await post(url)).status, 503);
  assert.equal((await post(url)).status, 200);
});

test('browser cancellation aborts upstream work and releases capacity', { timeout: 5000 }, async t => {
  let entered;
  let aborted;
  const running = new Promise(resolve => { entered = resolve; });
  const cancelled = new Promise(resolve => { aborted = resolve; });
  let calls = 0;
  const url = await start(t, { fetcher: async (_endpoint, { signal }) => {
    if (++calls > 1) return completion();
    entered();
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted(); reject(signal.reason); }, { once: true });
    });
  } });
  const controller = new AbortController();
  const request = post(url, input, { signal: controller.signal });
  const rejected = assert.rejects(request, { name: 'AbortError' });
  await running;
  controller.abort();
  await rejected;
  await cancelled;
  await nextTurn();
  assert.equal((await post(url)).status, 200);
  assert.equal(calls, 2);
});

test('configured deadline actually aborts a pending provider request', { timeout: 5000 }, async t => {
  let signalSeen;
  const url = await start(t, { timeoutMs: 1000, fetcher: async (_endpoint, { signal }) => {
    signalSeen = signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const response = await post(url);
  assert.equal(response.status, 503);
  assert.equal(signalSeen.aborted, true);
  assert.match((await response.json()).error, /too long/);
});

test('static allowlist serves assets and prevents arbitrary file disclosure', async t => {
  const url = await start(t, { fetcher: async () => { throw new Error('not expected'); } });
  const response = await fetch(url + '/archive.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/javascript/);
  assert.match(await response.text(), /The light at Bellwether/);
  for (const path of ['/server.mjs', '/.env', '/.env.example', '/.git/config', '/lib/archive.mjs', '/%2e%2e/server.mjs', '/unknown']) {
    const result = await rawRequest(url, { path });
    assert.equal(result.status, 404);
    assert.match(JSON.parse(result.body).error, /Page not found/);
  }
});
