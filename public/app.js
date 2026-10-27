import { archive, tourQuestions, tourReadings } from './archive.js';
import { formatDate, parseCollection } from './collections.js';
import { createReadingSnapshot, readingMarkdown, readingFilename } from './reading-export.js';

const $ = id => document.getElementById(id);
const storageKey = 'dead-letter-office.collections.v1';
const iconPaths = {
  letter: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 6 9 7 9-7"/>',
  photograph: '<rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4"/>',
  transcript: '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
  note: '<path d="M5 3h11l4 4v14H5zM15 3v5h5M8 12h9M8 16h7"/>',
  postcard: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M13 8v8M6 10h4M6 13h4M16 8h2v3h-2z"/>'
};
let customs = [];
let remember = false;
let storageWarning = false;
let current = archive;
let selectedId = archive.fragments[0].id;
let mode = 'sample';
let ready = false;
let model = null;
let provider = null;
let configured = false;
let runtime = 'local';
let allowHosted = false;
let connectionCheck = 0;
let selectedTour = 0;
let editingId = null;
let confirmAction = null;
let requestController = null;
let requestVersion = 0;
let busy = false;
let toastTimer;
let readingSnapshot = null;

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function icon(kind = 'note') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  // Only application-owned paths enter this SVG; archive text uses textContent.
  svg.innerHTML = iconPaths[kind] || iconPaths.note;
  return svg;
}
function arrow() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 12h16m-6-6 6 6-6 6'); svg.append(path); return svg;
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function isSample() { return current.id === archive.id; }
function saveCollections() {
  if (!remember) return;
  try { localStorage.setItem(storageKey, JSON.stringify({ version:1, collections:customs })); storageWarning=false; }
  catch { remember = false; storageWarning=true; $('remember-collections').checked = false; updateStorageNotice(); toast('Browser storage is unavailable or full. An older copy may remain. Export your current collection to keep it.'); }
}
function loadCollections() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    const raw = JSON.parse(saved);
    if (raw.version !== 1 || !Array.isArray(raw.collections) || raw.collections.length > 20) throw new Error();
    customs = raw.collections.map(parseCollection); remember = true;
  } catch { storageWarning=true; toast('Saved collections could not be read. You can import a previously exported copy.'); }
}
function updateStorageNotice() {
  $('storage-bar').hidden = isSample();
  $('remember-collections').checked = remember;
  $('storage-label').textContent = storageWarning ? 'Browser storage could not be updated or read. An older copy may remain. Export your current collection.' : remember ? 'Custom collections are saved on this browser, without encryption.' : 'This collection lives in this tab. Export it before you leave.';
}
function renderCollectionOptions() {
  $('collection-select').replaceChildren(...[archive, ...customs].map(item => {
    const option = element('option', '', item.title); option.value = item.id; return option;
  }));
  $('collection-select').value = current.id;
}
function clearReading() {
  requestVersion += 1;
  requestController?.abort(); requestController = null; busy = false;
  $('reading-error').hidden = true;
  const empty = element('div','reading-empty');
  empty.append(element('div','fine-line'), element('p','',isSample() ? '“I want someone to know\nthey can.”' : 'Every story begins\nwith something kept.'), element('span','', 'A THREAD WAITING TO BE FOLLOWED'));
  $('reading-result').replaceChildren(empty);
  $('reading-result').removeAttribute('aria-busy');
  readingSnapshot = null;
}
function chooseCollection(id) {
  current = [archive,...customs].find(item => item.id === id) || archive;
  selectedId = current.fragments[0]?.id || null;
  $('fragment-search').value = ''; selectedTour = 0;
  mode = isSample() ? 'sample' : ready ? 'live' : 'offline';
  clearReading(); renderCollection();
}
function renderCollection() {
  renderCollectionOptions();
  $('collection-title').textContent = current.title + (current.title.endsWith('.') ? '' : '.');
  if (isSample()) { $('collection-title').replaceChildren(document.createTextNode('The light at'),document.createElement('br'),document.createTextNode('Bellwether.')); }
  $('collection-description').textContent = current.description || 'A collection of words worth keeping.';
  const dates = current.fragments.map(f=>f.date?.slice(0,4)).filter(Boolean).sort();
  $('collection-years').textContent = current.years || (dates.length ? dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} — ${dates.at(-1)}` : 'A story in progress');
  $('collection-count').textContent = `${current.fragments.length} fragment${current.fragments.length === 1 ? '' : 's'}`;
  $('fiction-label').textContent = current.fictional ? isSample() ? 'An original fictional collection' : 'A fictional collection' : 'Your personal collection';
  $('fragment-count').textContent = String(current.fragments.length).padStart(2,'0');
  $('add-fragment-button').hidden = isSample();
  $('add-fragment-button').disabled = current.fragments.length >= 30;
  updateStorageNotice(); renderFragments(); renderDocument(); renderMode();
}
function renderFragments() {
  const query = $('fragment-search').value.trim().toLocaleLowerCase();
  const matches = current.fragments.filter(f => `${f.title} ${f.text} ${f.from} ${f.kind}`.toLocaleLowerCase().includes(query));
  $('fragment-list').replaceChildren(...matches.map(f => {
    const button = element('button','fragment-button');
    button.setAttribute('aria-current',String(f.id === selectedId));
    button.setAttribute('aria-label',`${f.title}, ${f.id}`);
    const symbol = element('span','fragment-icon'); symbol.append(icon(f.kind));
    const info = element('span','fragment-info');
    info.append(element('strong','',f.title),element('small','',f.displayDate || formatDate(f.date)),element('span','fragment-type',f.kind));
    button.append(symbol, info); button.addEventListener('click',()=> selectFragment(f.id)); return button;
  }));
  if (!matches.length) $('fragment-list').append(element('p','empty-fragments',current.fragments.length ? 'No fragments match. Try another word.' : 'Your drawer is empty. Add the first piece of your story.'));
}
function selectFragment(id, quote = '') {
  selectedId = id; renderFragments(); renderDocument(quote);
  if (quote) { $('document-paper').focus({preventScroll:true}); $('document-paper').scrollIntoView({behavior:'auto',block:'nearest'}); }
}
function renderDocument(quote = '') {
  const position = current.fragments.findIndex(f=>f.id === selectedId);
  const f = current.fragments[position];
  $('document-position').textContent = f ? `${position+1} / ${current.fragments.length}` : '0 / 0';
  $('previous-fragment').disabled = position <= 0;
  $('next-fragment').disabled = position < 0 || position >= current.fragments.length - 1;
  $('document-edit-actions').hidden = isSample() || !f;
  $('document-kind').textContent = f ? `${f.kind.toUpperCase()} · ${f.id}` : 'AN EMPTY DRAWER';
  $('document-date').textContent = f ? f.displayDate || formatDate(f.date) : 'READY WHEN YOU ARE';
  $('document-title').textContent = f?.title || 'Every fragment matters.';
  $('document-from').textContent = f?.from || '';
  $('document-note').textContent = f?.note || '';
  const text = f?.text || 'A handwritten letter. A recipe with a note in the margin. The story someone told you a hundred times.\n\nAdd a fragment to begin keeping it here.';
  const match = quote ? text.indexOf(quote) : -1;
  if (match >= 0) $('document-text').replaceChildren(document.createTextNode(text.slice(0,match)),element('mark','',quote),document.createTextNode(text.slice(match+quote.length)));
  else $('document-text').textContent = text;
  $('document-caption').textContent = f ? 'The ordinary things hold the most.' : 'Use “Add a fragment” to put something on the desk.';
}
function renderMode() {
  const sample = mode === 'sample';
  $('sample-mode').disabled = !isSample() || busy;
  $('sample-mode').setAttribute('aria-pressed',String(sample));
  $('live-mode').disabled = busy;
  $('live-mode').setAttribute('aria-pressed',String(mode === 'live'));
  $('live-mode').classList.toggle('connected',ready);
  $('mode-explanation').textContent = sample ? 'Four authored readings to explore the story. No model is running for this tour.' : runtime === 'local'
    ? ready ? 'Ask a factual question in English. The model selects passages on this computer; nothing is sent to a provider.' : 'Download the small on-device model once using the instructions in AI settings. No API key is needed.'
    : ready ? allowHosted ? `Your question and up to six fragments go to ${provider}. Quotations are checked before the reading appears.` : 'Review hosted AI settings to choose whether to send your question and fragments.' : 'Check your hosted provider connection in AI settings.';
  $('question').readOnly = sample;
  $('question').disabled = busy || !current.fragments.length;
  $('ask-button').disabled = busy || !current.fragments.length || (!sample && !ready);
  $('ask-button').replaceChildren(document.createTextNode(busy ? 'Reading…' : sample ? 'Read the sample' : runtime === 'hosted' && !allowHosted ? 'Review AI settings' : 'Read the archive'),arrow());
  $('cancel-reading').hidden = !busy;
  $('question-suggestions').replaceChildren();
  if (isSample()) {
    tourQuestions.forEach((question,i) => {
      const button = element('button','suggestion',question); button.type = 'button'; button.disabled = busy;
      button.setAttribute('aria-pressed',String(sample && i === selectedTour));
      button.append(arrow()); button.addEventListener('click',()=> { selectedTour=i; $('question').value=question; updateQuestionCount(); performReading(); });
      $('question-suggestions').append(button);
    });
  }
  if (sample) $('question').value = tourQuestions[selectedTour];
  else if (!isSample() && tourQuestions.includes($('question').value)) $('question').value = '';
  updateQuestionCount();
}
function updateQuestionCount() { $('question-count').textContent = `${$('question').value.length} / 600`; }
function renderReading(reading, question, collection = current) {
  readingSnapshot = createReadingSnapshot({ collection, question, reading });
  const snapshot = readingSnapshot;
  const result = $('reading-result'); result.replaceChildren();
  result.append(element('p','result-badge',reading.mode === 'live' ? 'HOSTED AI READING' : reading.mode === 'local' ? 'ON-DEVICE AI · EXTRACTIVE READING' : 'AUTHORED SAMPLE · NOT AI-GENERATED'));
  result.append(element('h3','',reading.title),element('p','reading-prose',reading.reading));
  if (reading.evidence.length) {
    result.append(element('p','evidence-heading', `${reading.evidence.length} SOURCE QUOTATION${reading.evidence.length === 1 ? '' : 'S'}`));
    reading.evidence.forEach(e => {
      const source = current.fragments.find(f=>f.id === e.sourceId);
      if (!source) return;
      const card = element('button','evidence-card'); card.type = 'button';
      card.setAttribute('aria-label',`View source ${source.id}: ${source.title}`);
      const footer = element('span','',`${source.id} · ${source.title}`); footer.append(arrow());
      card.append(element('blockquote','',`“${e.quote}”`),footer);
      card.addEventListener('click',()=>selectFragment(e.sourceId,e.quote)); result.append(card);
    });
  }
  const uncertainty = element('p','uncertainty'); uncertainty.append(element('strong','', 'WHAT REMAINS UNKNOWN'),document.createTextNode(reading.uncertainty)); result.append(uncertainty);
  if (reading.mode !== 'sample') {
    const tokens = Number.isFinite(reading.usage?.completion_tokens) ? ` · ${reading.usage.completion_tokens} output tokens` : '';
    result.append(element('p','reading-metadata',`${reading.model || 'AI model'} · ${(reading.durationMs/1000).toFixed(1)}s${tokens} · ${reading.retrieved?.length || current.fragments.length} fragments considered`));
    const details = element('details','retrieval-details');
    details.append(element('summary','', 'Fragments considered'));
    details.append(element('p','',snapshot.considered.length
      ? `${snapshot.considered.length} of ${snapshot.totalFragments} fragments were considered. A considered fragment is not necessarily cited.`
      : 'The retrieval list was not recorded.'));
    if (snapshot.considered.length && snapshot.considered.length < snapshot.totalFragments)
      details.append(element('p','retrieval-note','Only part of this collection was considered. Other fragments may contain relevant evidence.'));
    for (const source of snapshot.considered) {
      const button = element('button','considered-source',`${source.id} · ${source.title}`);
      button.type = 'button';
      button.setAttribute('aria-label',`Open considered fragment ${source.id}: ${source.title}`);
      button.append(element('span','',source.cited ? 'Cited' : 'Considered, not cited'));
      button.addEventListener('click',()=> {
        selectFragment(source.id);
        $('document-paper').focus({preventScroll:true});
        $('document-paper').scrollIntoView({behavior:'auto',block:'nearest'});
      });
      details.append(button);
    }
    result.append(details);
  }
  const actions = element('div','reading-actions');
  const save = element('button','quiet-button','Save reading');
  save.id = 'save-reading'; save.type = 'button';
  save.setAttribute('aria-label','Save reading as Markdown');
  save.addEventListener('click',()=> {
    if (readingSnapshot !== snapshot) return;
    const url = URL.createObjectURL(new Blob([readingMarkdown(snapshot)],{type:'text/markdown;charset=utf-8'}));
    const anchor = element('a'); anchor.href = url; anchor.download = readingFilename(snapshot);
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Reading saved with its original question and source quotations.');
  });
  actions.append(save,element('span','','Markdown · includes cited quotations'));
  result.append(actions);
}
async function performReading() {
  if (busy) return;
  $('reading-error').hidden = true;
  if (mode === 'sample') {
    renderReading({...tourReadings[selectedTour],mode:'sample'},tourQuestions[selectedTour]); renderMode(); return;
  }
  if (!ready || (runtime === 'hosted' && !allowHosted)) { $('settings-dialog').showModal(); return; }
  const question = $('question').value.trim();
  if (!question) { readingSnapshot=null; $('reading-result').replaceChildren(); $('reading-error').textContent='Write a question for the archive first.'; $('reading-error').hidden=false; $('question').focus(); return; }
  if (!current.fragments.length) return;
  const readingCollection = structuredClone(current);
  readingSnapshot = null;
  busy = true; requestController = new AbortController();
  const version = ++requestVersion;
  renderMode();
  const loading = element('div','loading-reading'); loading.append(element('span','loading-ring'),document.createTextNode('Following the thread…'));
  $('reading-result').replaceChildren(loading); $('reading-result').setAttribute('aria-busy','true');
  try {
    const response = await fetch('/api/read',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,fragments:current.fragments,allowHosted:runtime === 'hosted' && allowHosted}),signal:AbortSignal.any([requestController.signal,AbortSignal.timeout(190000)]) });
    const data = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok) throw new Error(data.error || 'The hosted model could not complete this reading.');
    renderReading(data,question,readingCollection);
  } catch (error) {
    if (version !== requestVersion || error.name === 'AbortError') return;
    $('reading-result').replaceChildren();
    readingSnapshot = null;
    $('reading-error').textContent = error.name === 'TimeoutError' ? 'The reading took too long. Please try again.' : error instanceof TypeError ? 'The archive server could not be reached. Check that the app is running, then retry.' : error.message || 'The hosted model could not be reached. Check AI settings.';
    $('reading-error').hidden = false;
  } finally {
    if (version === requestVersion) { busy=false; requestController=null; $('reading-result').removeAttribute('aria-busy'); renderMode(); }
  }
}
function updateHostedConsent() {
  const hosted = runtime === 'hosted';
  $('hosted-consent-section').hidden = !hosted;
  $('local-settings').hidden = hosted;
  $('runtime-description').textContent = hosted
    ? 'Live readings use your configured hosted open-weight model. Your question and up to six fragments leave this computer only when you request a reading after opting in.'
    : 'The open-weight question-answering model runs on your CPU. It selects exact passages from the archive, with no API key, hosted inference, or separate model server.';
  $('live-mode').replaceChildren(element('span','status-dot'),document.createTextNode(hosted ? ' Hosted AI' : ' On-device AI'));
  $('hosted-consent').checked = allowHosted;
  $('hosted-consent').disabled = !ready || !hosted;
  $('use-hosted-button').disabled = !ready || (hosted && !allowHosted);
  $('use-hosted-button').textContent = hosted ? 'Use hosted AI' : 'Use on-device AI';
  $('hosted-consent-label').textContent = provider
    ? `Allow my question and up to six fragments to be sent to ${provider} when I request a reading in this tab.`
    : 'Allow my question and up to six fragments to be sent to the configured provider when I request a reading in this tab.';
}
async function checkConnection() {
  const version = ++connectionCheck;
  $('reconnect-button').disabled = true;
  $('settings-status').textContent = 'Checking the model…';
  let error = '';
  try {
    const response = await fetch('/api/health',{signal:AbortSignal.timeout(6000)});
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (version !== connectionCheck) return;
    if (provider !== data.provider || model !== data.model) allowHosted = false;
    runtime = data.runtime === 'hosted' ? 'hosted' : 'local';
    ready = data.ready === true; configured = data.configured === true;
    model = typeof data.model === 'string' ? data.model : null;
    provider = typeof data.provider === 'string' ? data.provider : null;
    error = typeof data.error === 'string' ? data.error : '';
  } catch {
    if (version !== connectionCheck) return;
    ready = false; error = 'The archive server could not be reached. Check that the app is running.';
  }
  $('settings-button').classList.toggle('connected',ready);
  $('connection-label').textContent = ready ? runtime === 'local' ? 'On-device AI ready' : 'Hosted AI connected' : 'AI settings';
  $('settings-status').textContent = ready ? `${runtime === 'local' ? 'Ready on CPU' : 'Connected'} · ${model}${provider ? ` · ${provider}` : ''}` : error || (configured
    ? 'The hosted model is unavailable. Check the provider configuration, then try again.'
    : 'Hosted AI is not configured. The sample tour and archive editor work without credentials.');
  $('reconnect-button').disabled = false;
  updateHostedConsent();
  if (!busy) {
    if (!ready && mode === 'live') mode = 'offline';
    else if (ready && mode === 'offline') mode = 'live';
    renderMode();
  }
}
function newCollection() {
  if (customs.length >= 20) { toast('You can keep up to 20 collections. Export and remove an older one first.'); return; }
  $('collection-form').reset(); $('collection-dialog').showModal();
}
function editFragment(id = null) {
  if (isSample()) return;
  editingId=id; $('fragment-form').reset(); $('fragment-error').hidden=true;
  $('fragment-dialog-title').textContent=id ? 'Keep the details right.' : 'Add a fragment.';
  const f = current.fragments.find(item=>item.id===id);
  if (f) for (const field of ['title','kind','date','from','text','note']) $(`fragment-${field}`).value=f[field] || '';
  $('fragment-dialog').showModal();
}
function confirmDelete(title, description, action) {
  $('confirm-title').textContent=title; $('confirm-description').textContent=description;
  confirmAction=action; $('confirm-dialog').showModal();
}
function exportCollection() {
  const data = JSON.stringify({version:1,...current},null,2);
  const url = URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const anchor=element('a'); anchor.href=url; anchor.download=(current.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').slice(0,70) || 'archive')+'.json';
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Collection exported. Keep the JSON file somewhere safe.');
}

$('fragment-search').addEventListener('input',renderFragments);
$('collection-select').addEventListener('change',event=>chooseCollection(event.target.value));
$('previous-fragment').addEventListener('click',()=> { const i=current.fragments.findIndex(f=>f.id===selectedId); if (i>0) selectFragment(current.fragments[i-1].id); });
$('next-fragment').addEventListener('click',()=> { const i=current.fragments.findIndex(f=>f.id===selectedId); if (i<current.fragments.length-1) selectFragment(current.fragments[i+1].id); });
$('sample-mode').addEventListener('click',()=> { if (!isSample() || busy) return; clearReading(); mode='sample'; renderMode(); });
$('live-mode').addEventListener('click',()=> { if (busy) return; if (!ready || (runtime === 'hosted' && !allowHosted)) { $('settings-dialog').showModal(); checkConnection(); return; } clearReading(); mode='live'; renderMode(); });
$('question-form').addEventListener('submit',event=> { event.preventDefault(); performReading(); });
$('question').addEventListener('input',updateQuestionCount);
$('settings-button').addEventListener('click',()=> { $('settings-dialog').showModal(); checkConnection(); });
$('reconnect-button').addEventListener('click',checkConnection);
$('hosted-consent').addEventListener('change',event=> {
  allowHosted = event.target.checked && ready;
  if (!allowHosted && busy) clearReading();
  updateHostedConsent(); renderMode();
});
$('use-hosted-button').addEventListener('click',()=> {
  if (!ready || (runtime === 'hosted' && !allowHosted)) return;
  clearReading(); mode='live'; renderMode(); $('settings-dialog').close(); $('question').focus();
});
$('cancel-reading').addEventListener('click',()=> {
  clearReading(); renderMode(); toast('Reading cancelled. You can ask another question.'); $('question').focus();
});
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('new-collection-button').addEventListener('click',newCollection);
$('collection-form').addEventListener('submit',event=> {
  event.preventDefault();
  const title=$('new-title').value.trim(); if (!title) { $('new-title').setCustomValidity('Give this collection a title.'); $('new-title').reportValidity(); return; }
  const item = parseCollection({title,person:$('new-person').value,description:$('new-description').value,fragments:[]});
  customs.push(item); saveCollections(); $('collection-dialog').close(); chooseCollection(item.id); toast('A new drawer is ready. Add your first fragment.'); editFragment();
});
$('new-title').addEventListener('input',()=> $('new-title').setCustomValidity(''));
$('remember-collections').addEventListener('change',event=> {
  remember=event.target.checked;
  if (remember) { saveCollections(); if (remember) toast('Custom collections will be kept on this browser.'); }
  else { try { localStorage.removeItem(storageKey); storageWarning=false; toast('Browser copy removed. Your open collections stay in this tab.'); } catch { remember=true; storageWarning=true; toast('Browser storage could not be cleared. Remove this site’s data in your browser settings.'); } }
  updateStorageNotice();
});
$('delete-collection-button').addEventListener('click',()=> {
  if (isSample()) return;
  const target=current.id;
  confirmDelete('Delete this collection?',`“${current.title}” and its ${current.fragments.length} fragments will be removed from this app. Export a copy first if you want to keep them.`,()=> {
    customs=customs.filter(item=>item.id!==target); saveCollections(); chooseCollection(archive.id); toast('Collection removed.');
  });
});
$('add-fragment-button').addEventListener('click',()=> { if (current.fragments.length<30) editFragment(); });
$('edit-fragment-button').addEventListener('click',()=>editFragment(selectedId));
$('delete-fragment-button').addEventListener('click',()=> {
  const target=selectedId; const f=current.fragments.find(item=>item.id===target); if (!f || isSample()) return;
  confirmDelete('Delete this fragment?',`“${f.title}” will be removed from this collection. This cannot be undone here.`,()=> {
    current.fragments=current.fragments.filter(item=>item.id!==target); selectedId=current.fragments[0]?.id || null;
    clearReading(); saveCollections(); renderCollection(); toast('Fragment removed.');
  });
});
$('confirm-delete').addEventListener('click',()=> { const action=confirmAction; confirmAction=null; $('confirm-dialog').close(); action?.(); });
$('confirm-dialog').addEventListener('close',()=> { confirmAction=null; });
$('fragment-form').addEventListener('submit',event=> {
  event.preventDefault(); if (isSample()) return;
  const values=Object.fromEntries(new FormData(event.target));
  const nextNumber=Array.from({length:999},(_,i)=>i+1).find(i=>!current.fragments.some(f=>f.id===`F${String(i).padStart(2,'0')}`));
  const id=editingId || `F${String(nextNumber).padStart(2,'0')}`;
  const fragment={id,...values};
  const next=current.fragments.some(f=>f.id===id) ? current.fragments.map(f=>f.id===id ? fragment : f) : [...current.fragments,fragment];
  try { const checked=parseCollection({...current,fragments:next}); current.fragments=checked.fragments; }
  catch(error) { $('fragment-error').textContent=error.message; $('fragment-error').hidden=false; return; }
  selectedId=id; clearReading(); saveCollections(); $('fragment-dialog').close(); renderCollection(); toast('Fragment kept in your collection.');
});
$('export-button').addEventListener('click',exportCollection);
$('import-button').addEventListener('click',()=> $('import-file').click());
$('import-file').addEventListener('change',async event=> {
  const file=event.target.files[0]; event.target.value=''; if (!file) return;
  try {
    if (customs.length>=20) throw new Error('You can keep up to 20 collections. Remove one before importing another.');
    if (file.size>300000) throw new Error('Choose a JSON archive under 300 KB.');
    const item=parseCollection(JSON.parse(await file.text()));
    customs.push(item); saveCollections(); chooseCollection(item.id); toast('Collection imported. The original file is unchanged.');
  } catch(error) { toast(error instanceof SyntaxError ? 'That file is not valid JSON. Choose an exported archive file.' : error.message); }
});
window.addEventListener('beforeunload',event=> { if (customs.length && !remember) { event.preventDefault(); event.returnValue=''; } });

loadCollections(); renderCollection(); checkConnection();
