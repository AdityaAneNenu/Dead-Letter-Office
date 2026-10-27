// Record the real on-device app. There are no API/model fixtures in this script.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const project = path.resolve(__dirname, '..');

(async () => {
  const { createServer } = await import(pathToFileURL(path.join(project,'server.mjs')));
  const server = createServer({baseUrl:'',apiKey:'',modelName:'',timeoutMs:180000});
  let browser;
  const media = path.join(project,'docs/media');
  const images = path.join(project,'docs/images');
  const temporary = path.join(project,'.runtime/demo-capture');
  try {
    await Promise.all([media,images,temporary].map(directory => fs.mkdir(directory,{recursive:true})));
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(url+'/api/health').then(response=>response.json());
    assert.equal(health.ready,true,health.error);
    browser = await chromium.launch({headless:process.env.PW_HEADLESS==='1'});
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',
      recordVideo:{dir:temporary,size:{width:1440,height:1000}}});
    const page = await context.newPage(); page.setDefaultTimeout(180000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const pauseForViewer = () => page.waitForTimeout(2200);
    await page.goto(url);
    await page.getByRole('button',{name:'On-device AI ready',exact:true}).waitFor();
    await pauseForViewer();
    await page.getByRole('button',{name:'Read the sample',exact:true}).click();
    await page.locator('#reading-result').scrollIntoViewIfNeeded(); await pauseForViewer();
    await page.getByRole('button',{name:'On-device AI',exact:true}).click();
    await page.locator('#question').fill('Who would hold the key to the reading room?');
    await page.getByRole('button',{name:'Read the archive',exact:true}).click();
    await page.getByText('ON-DEVICE AI · EXTRACTIVE READING',{exact:true}).waitFor();
    await page.getByRole('button',{name:'View source F05: The closing-day notice',exact:true}).click();
    assert.match(await page.locator('#document-text mark').innerText(),/night librarian/);
    await page.screenshot({path:path.join(images,'archive-desktop.png'),fullPage:true});
    await pauseForViewer();
    await page.getByText('Fragments considered',{exact:true}).click(); await pauseForViewer();
    const download = page.waitForEvent('download');
    await page.getByRole('button',{name:'Save reading as Markdown'}).click();
    await (await download).saveAs(path.join(media,'demo-reading.md'));
    await page.locator('#question').fill('What was Nora’s favourite song?');
    await page.getByRole('button',{name:'Read the archive',exact:true}).click();
    await page.getByRole('heading',{name:'Some things are still quiet',exact:true}).waitFor();
    await pauseForViewer();
    await page.getByRole('button',{name:'New collection',exact:true}).click();
    await page.getByLabel('Collection title').fill('The recipe tin');
    await page.getByRole('button',{name:'Create collection'}).click();
    await page.locator('#fragment-title').fill('A pantry note');
    await page.getByLabel('The original words').fill('Amara kept her grandmother’s handwritten recipes in a blue tin on the kitchen shelf. The tin was given to her in 2004.');
    await page.getByRole('button',{name:'Keep this fragment'}).click();
    await page.locator('#question').fill('What did Amara keep in the blue tin?');
    await page.getByRole('button',{name:'Read the archive',exact:true}).click();
    await page.getByText('ON-DEVICE AI · EXTRACTIVE READING',{exact:true}).waitFor();
    assert.match(await page.locator('#reading-result').innerText(),/handwritten recipes/);
    await pauseForViewer();
    await page.setViewportSize({width:375,height:900});
    await page.screenshot({path:path.join(images,'archive-mobile.png'),fullPage:true});
    await page.locator('#reading-result').scrollIntoViewIfNeeded(); await pauseForViewer();
    assert.deepEqual(errors,[]);
    const video=page.video(); await context.close();
    await video.saveAs(path.join(media,'dead-letter-office-demo.webm'));
    console.log('Recorded real on-device inference, source inspection, abstention, custom collection and reading export.');
    console.log('Artifacts: docs/media/dead-letter-office-demo.webm and docs/images/*.png');
  } finally {
    await browser?.close(); server.closeAllConnections();
    if(server.listening) await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
