const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const project = path.resolve(__dirname, '..');
const artifacts = path.join(project, 'test-results');

(async () => {
  const { createServer } = await import(pathToFileURL(path.join(project, 'server.mjs')).href);
  let inferenceCalls = 0;
  let holdReading = false;
  let failReading = false;
  let cancelled = false;
  let notifyCancelled;
  let notifyStarted;
  const cancellation = new Promise(resolve => { notifyCancelled = resolve; });
  const started = new Promise(resolve => { notifyStarted = resolve; });
  async function within(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Provider fixture timed out')), 5000); })]); }
    finally { clearTimeout(timer); }
  }
  const fetcher = async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'mock-open-weight' }] });
    inferenceCalls++;
    if (failReading) return new Response('fixture failure', { status: 500 });
    if (holdReading) await new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => { cancelled = true; notifyCancelled(); reject(options.signal.reason); }, { once: true });
      notifyStarted();
    });
    return Response.json({
      model: 'mock-open-weight', choices: [{ message: { content: JSON.stringify({
        title: 'A light for someone', reading: 'Nora wanted others to know they could return.',
        evidence: [{ sourceId: 'F01', quote: 'I am not waiting for someone to come back. I want someone to know they can.' }],
        uncertainty: 'This does not establish what everyone felt.'
      }) } }], usage: { completion_tokens: 30 }
    });
  };
  const offline = createServer({ baseUrl: '', apiKey: '', modelName: '',
    localAI: { status: async () => ({ready:false,model:'tinyroberta',error:'Run npm run setup:model to download the on-device model.'}),
      read: async () => {throw new Error('not expected');}, close: async () => {} } });
  const live = createServer({ baseUrl: 'https://provider.example/v1', apiKey: 'test-only-key', modelName: 'mock-open-weight', fetcher });
  const servers = [offline, live];
  let browser;
  const errors = [];
  try {
  for (const server of servers) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  const offlineUrl = `http://127.0.0.1:${offline.address().port}`;
  const liveUrl = `http://127.0.0.1:${live.address().port}`;
  await fs.mkdir(artifacts, { recursive: true });
  browser = await chromium.launch({ headless: process.env.PW_HEADLESS === '1' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    const externalRequests = [];
    page.on('request', request => { if (!request.url().startsWith(offlineUrl) && !request.url().startsWith(liveUrl)) externalRequests.push(request.url()); });
    await page.goto(offlineUrl);
    await page.getByRole('button', { name: 'Read the sample', exact: true }).click();
    assert.match(await page.locator('#reading-result').innerText(), /AUTHORED SAMPLE/);
    assert.match(await page.locator('#reading-result').innerText(), /Elsie/);
    await page.getByRole('button', { name: 'View source F01: A letter never sent' }).click();
    assert.match(await page.locator('#document-text mark').innerText(), /I want someone to know/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'document-paper');
    await page.getByRole('button', { name: 'What was Nora', exact: false }).click();
    assert.match(await page.locator('#reading-result').innerText(), /no favourite song/i);
    await page.getByRole('button', { name: 'AI settings', exact: true }).click();
    await page.locator('#settings-status').getByText('Run npm run setup:model', { exact: false }).waitFor();
    assert.equal(await page.locator('#hosted-consent').isDisabled(), true);
    await page.getByRole('button', { name: 'Close AI settings' }).click();
    for (const width of [1440, 1024, 768, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No overflow at ${width}px`);
      await page.screenshot({ path: path.join(artifacts, `archive-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.getByLabel('Search fragments').fill('unfindable-search');
    await page.getByText('No fragments match. Try another word.').waitFor();
    await page.getByLabel('Search fragments').clear();
    await page.getByRole('button', { name: 'New collection' }).click();
    await page.getByLabel('Collection title').fill('A kept story');
    await page.getByRole('button', { name: 'Create collection' }).click();
    await page.locator('#fragment-title').fill('<img src=x onerror=alert(1)>');
    await page.getByLabel('The original words').fill('The lamp stayed lit until the last ferry.\n\n' + 'x'.repeat(250));
    await page.getByLabel('Date', { exact: false }).fill('2024-02-29');
    await page.getByRole('button', { name: 'Keep this fragment' }).click();
    assert.equal(await page.locator('#document-title').innerText(), '<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#document-title img').count(), 0);
    assert.equal(await page.locator('#document-date').innerText(), '29 FEB 2024');
    await page.setViewportSize({ width: 375, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Long words wrap on mobile');
    await page.getByRole('button', { name: 'Edit fragment', exact: true }).click();
    await page.locator('#fragment-title').fill('A window at dusk');
    await page.getByRole('button', { name: 'Keep this fragment' }).click();
    await page.getByLabel('Remember on this browser').check();
    await page.reload();
    await page.getByLabel('Choose collection').selectOption({ label: 'A kept story' });
    assert.equal(await page.locator('#document-title').innerText(), 'A window at dusk');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;
    const exportFile = path.join(artifacts, 'browser-test-collection.json');
    await download.saveAs(exportFile);
    const exported = JSON.parse(await fs.readFile(exportFile, 'utf8'));
    assert.equal(exported.version, 1);
    assert.equal(exported.fragments[0].title, 'A window at dusk');
    await page.locator('#import-file').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...exported, version: 2 })) });
    await page.getByText('This archive format is not supported.', { exact: false }).waitFor();
    await page.locator('#import-file').setInputFiles(exportFile);
    await page.getByText('Collection imported. The original file is unchanged.').waitFor();
    await page.getByRole('button', { name: 'Delete fragment', exact: true }).click();
    await page.getByRole('button', { name: 'Keep it', exact: true }).click();
    assert.equal(await page.locator('#fragment-count').innerText(), '01');
    await page.getByRole('button', { name: 'Delete fragment', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByText('Your drawer is empty.', { exact: false }).waitFor();
    assert.equal(await page.locator('#ask-button').isDisabled(), true);
    assert.deepEqual(externalRequests, []);

    // Real local HTTP integration with an explicitly mocked hosted provider.
    await page.goto(liveUrl);
    await page.getByRole('button', { name: 'Hosted AI connected', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hosted AI', exact: true }).click();
    await page.locator('#settings-dialog[open]').waitFor();
    assert.equal(await page.locator('#use-hosted-button').isDisabled(), true);
    assert.equal(inferenceCalls, 0);
    await page.locator('#hosted-consent').check();
    await page.getByRole('button', { name: 'Use hosted AI', exact: true }).click();
    assert.equal(inferenceCalls, 0, 'Consent does not automatically send a reading');
    await page.getByRole('button', { name: 'Read the archive', exact: true }).click();
    await page.getByText('HOSTED AI READING', { exact: true }).waitFor();
    assert.equal(inferenceCalls, 1);
    const originalQuestion = await page.locator('#question').inputValue();
    await page.locator('#question').fill('A different unsent question');
    const savedReading = page.waitForEvent('download');
    await page.getByRole('button', {name:'Save reading as Markdown'}).click();
    const readingFile = path.join(artifacts,'saved-reading.md');
    await (await savedReading).saveAs(readingFile);
    const markdown = await fs.readFile(readingFile,'utf8');
    assert.ok(markdown.includes(originalQuestion));
    assert.ok(!markdown.includes('A different unsent question'));
    await page.getByText('Fragments considered', {exact:true}).click();
    assert.match(await page.locator('.retrieval-details').innerText(), /F01/);
    await page.locator('#question').fill(originalQuestion);
    await page.getByRole('button', { name: 'View source F01: A letter never sent' }).click();
    assert.match(await page.locator('#document-text mark').innerText(), /I want someone/);
    holdReading = true;
    await page.getByRole('button', { name: 'Read the archive', exact: true }).click();
    await within(started);
    await page.getByRole('button', { name: 'Cancel reading', exact: true }).click();
    await page.getByText('Reading cancelled.', { exact: false }).waitFor();
    assert.equal(await page.locator('#question').isDisabled(), false);
    await page.waitForFunction(() => !document.querySelector('#reading-result').hasAttribute('aria-busy'));
    await within(cancellation);
    assert.equal(cancelled, true, 'Cancellation reaches the provider request');
    holdReading = false;
    failReading = true;
    await page.getByRole('button', { name: 'Read the archive', exact: true }).click();
    await page.locator('#reading-error').waitFor({ state: 'visible' });
    assert.match(await page.locator('#reading-error').innerText(), /provider could not complete/);
    assert.equal(await page.locator('#question').isDisabled(), false);
    assert.equal(await page.getByText('HOSTED AI READING', { exact: true }).count(), 0);
    failReading = false;
    await page.getByRole('button', { name: 'Read the archive', exact: true }).click();
    await page.getByText('HOSTED AI READING', { exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Hosted AI connected', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hosted AI', exact: true }).click();
    assert.equal(await page.locator('#hosted-consent').isChecked(), false, 'Consent is not persisted');
    assert.deepEqual(errors, []);
    console.log('PASS: sample/source navigation; offline state; 4 responsive widths; search; collection create/edit/delete; persistence; export/import/version rejection; XSS text handling; hosted consent; mocked HTTP reading; cancellation; provider error and retry; non-persisted consent; zero browser errors.');
    console.log(`Screenshots: ${artifacts}`);
  } finally {
    await browser?.close();
    for (const server of servers) { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
