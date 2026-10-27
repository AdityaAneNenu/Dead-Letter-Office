# Dead Letter Office

An archive of things left unsaid. Keep letters, notes and transcribed memories, ask a factual question, and follow the answer back to the original fragment.

Built for [Hacktoberfest Open-Source AI Challenge: Week 4 — Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26). This interpretation of the theme honors the past through its surviving words. The default open-weight model selects passages on your CPU. **No API key, GPU, Ollama, or separate model server is required.**

## Run it

Requires **Node.js 22.9 or newer** and npm. Install dependencies and download the pinned model once:

```sh
npm ci
npm run setup:model
npm start
```

Open **http://127.0.0.1:4173**, select **On-device AI**, and ask a direct question such as “When did the post office close?” The first reading also loads the model into memory. Later readings reuse it. `npm run dev` restarts the server when source files change; Ctrl+C stops the app.

Model setup downloads about **85.7 MB** from Hugging Face into ignored `.runtime/models/tinyroberta/`. It verifies the quantized weights with SHA-256 and checks configuration/tokenizer files against pinned Git blob hashes. Downloads use an immutable model revision, retry boundedly, and replace files only after verification. Run setup again to check or repair the files. The manifest is in [docs/model-manifest.json](docs/model-manifest.json).

After setup, on-device inference loads only those local files with remote model loading disabled. The archive editor and authored sample tour also work without the model download. A missing model produces setup instructions rather than a fabricated reading. There is no database or build step.

The optional `.env` file is not needed for on-device AI. A startup notice about a missing `.env` is harmless. Leave `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY` empty to use the CPU model.

## Explore the archive

The six Bellwether fragments and their people are original fiction. Four prewritten readings are visibly labeled **AUTHORED SAMPLE · NOT AI-GENERATED**. They are never substituted for a failed model response.

- Search and navigate fragments. Select a quotation to focus and highlight its original words.
- Ask the on-device model a factual question. The result is labeled **ON-DEVICE AI · EXTRACTIVE READING** and includes a quotation or an abstention.
- Open **Fragments considered** to see which sources reached the model and which were cited. A partial-collection notice explains when retrieval omitted other fragments.
- Choose **Save reading** for a Markdown snapshot of the original question, answer, quotations, source attribution, uncertainty, model and timestamp. Editing the question afterward does not rewrite the saved reading. This export is separate from a collection backup.
- Create up to 20 collections, with up to 30 fragments each, 6,000 characters per fragment and 60,000 total fragment-text characters. Questions are limited to 600 characters; on-device questions also have a 128-model-token limit.
- Edit titles, text, real calendar dates, kind, attribution and notes. Confirm deletions before removing data.
- Export/import version 1 collection JSON, with duplicate-ID, size, date and format validation. Original unversioned collections remain compatible.
- Keep custom collections in memory or opt into unencrypted browser storage. Export before closing if storage is disabled. Storage failures are reported; an older saved copy may remain.

## How the AI works

The default model is [tinyroberta-squad2 by deepset](https://huggingface.co/deepset/tinyroberta-squad2), using the [onnx-community quantized ONNX conversion](https://huggingface.co/onnx-community/tinyroberta-squad2-ONNX). It is an English extractive question-answering model trained for SQuAD 2.0. [Transformers.js](https://huggingface.co/docs/transformers.js) runs it on CPU through ONNX Runtime in a Node worker thread.

The local server validates the request and ranks fragments with BM25. At most six fragments enter inference. The worker splits longer passages into overlapping chunks, keeps tokenized input within the model's context limit, and compares candidate answer spans with the model's no-answer output. A selected span must exceed the configured logit margin and match actual source characters. The app expands it to a surrounding quotation and independently validates the evidence before rendering.

This model **selects existing words; it does not compose a new story or impersonate a person**. Canceling a reading terminates its worker, discards the result, and allows a later request to load a fresh worker. One reading runs at a time.

BM25 can miss synonyms and evidence outside the first six sources. The English model is best suited to direct factual questions; broad interpretation, multilingual text, identity inference and long compound questions are harder. Its span margin is a ranking signal, not a calibrated probability of truth. Abstaining does not prove an answer is absent. A matching quotation verifies the text's source, not its relevance to every question.

## Privacy and optional hosted AI

In the default mode, the browser sends the current question and collection only to the Node server on this computer. Inference does not send archive text to a provider. Model setup downloads public files without sending your archive. The app has no analytics, external fonts, accounts or server-side archive database. Browser storage, exported JSON and saved Markdown are not encrypted.

The existing hosted integration remains optional. To use it, copy `.env.example` to `.env`, configure all three values, and restart:

```dotenv
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-120b
AI_API_KEY=your-provider-key
```

The example model is [open-weight under Apache 2.0](https://developers.openai.com/api/docs/models/gpt-oss-120b), and Groq documents [JSON Object Mode support](https://console.groq.com/docs/model/openai/gpt-oss-120b). Groq's hosted service has its own terms, billing and retention policy. Its live inference has not been verified here; the default CPU path does not depend on it.

Hosted settings show the provider and require an explicit per-tab opt-in before sending your question and up to six fragments. Reloading or changing the provider/model resets consent. Keys stay on the Node server. Connection checks authenticate with `/models` without archive text; they verify model listing, not successful generation. Hosted errors never become authored sample responses. Clear all three AI values and restart to return to on-device inference. Partial hosted configuration fails with an actionable error.

Optional `AI_TIMEOUT_MS` accepts an integer from 1,000 to 180,000 (default 60,000) for either inference path. `PORT` accepts 1–65535 (default 4173). Shell environment variables take precedence over `.env`.

The server binds to loopback, rejects foreign Host/Origin headers, allowlists static files, bounds input/output sizes and does not cache API responses. It is a local single-user application, not a public authenticated deployment. A video walkthrough is an allowed Week 4 demo format, so public hosting is unnecessary.

## Verify

```sh
npm run check
npm test
npm audit --omit=dev
npm run verify:local
```

`check` syntax-checks the JavaScript. Unit/HTTP tests cover request boundaries, imports, retrieval, source validation, reading exports, worker lifecycle and provider errors using deterministic fixtures. `verify:local` requires the downloaded weights and exercises genuine CPU inference through the app's HTTP API. Its small factual/unsupported-question check is a regression check, not a broad model-quality benchmark. See [the recorded verification results](docs/verification.json) for exact observed outputs and timings.

This plain JavaScript project has no separate TypeScript, linter or bundler configuration. CI runs the deterministic checks on Node 22 and 24; model downloads and real inference are separate from that fast suite.

Optional browser checks require Playwright:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

If Playwright is already installed elsewhere, set `PLAYWRIGHT_MODULE` to its absolute `node_modules/playwright` directory. `PW_HEADLESS=1` enables headless execution (`$env:PW_HEADLESS='1'` in PowerShell); the default is visible Chromium. Browser smoke tests use temporary local servers and deterministic fixtures for sample/source navigation, CRUD, storage, imports, reading downloads, consent, cancellation, error recovery and layouts at 375/768/1024/1440px. Their screenshots and test exports go into ignored `test-results/`; fixture results are not evidence of real inference.

## Project map

| File | Responsibility |
| --- | --- |
| `server.mjs` | Local HTTP boundary, inference routing, timeouts and result validation |
| `lib/archive.mjs` | Request/output contracts, BM25, hosted prompt and source-quote validation |
| `lib/local-ai.mjs` | Model integrity checks and cancellable worker lifecycle |
| `lib/qa-worker.mjs`, `lib/qa-core.mjs` | CPU inference, chunking, span selection and evidence construction |
| `scripts/setup-model.mjs`, `docs/model-manifest.json` | Pinned model download and verification |
| `public/app.js`, `public/collections.js` | Archive UI, storage, import/editor validation and dates |
| `public/reading-export.js` | Immutable reading snapshots and safe Markdown exports |
| `public/archive.js` | Original fictional collection and labeled authored readings |
| `test/`, `scripts/browser-smoke.cjs` | Unit, HTTP and browser regression checks |

## Challenge, demo and licenses

See the [Week 4 rules and requirement map](docs/challenge.md), [submission article](docs/submission.md), [demo recording](docs/media/dead-letter-office-demo.webm), and [contribution guide](CONTRIBUTING.md).

The official deadline is **October 31, 2026 at 11:59 PM PDT** (**November 1 at 12:29 PM IST**). The author confirmed that the original project was created during the entry window. Public repository/demo URLs and DEV publication are separate submission steps; this workspace does not establish that an entry was published. Record any post-deadline changes in this README.

The application code is [MIT licensed](LICENSE). Transformers.js is Apache-2.0 licensed; ONNX Runtime is MIT licensed. The selected model is **CC-BY-4.0**: attribution belongs to **deepset**, with ONNX conversion by the **Hugging Face onnx-community**. The pinned quantized weights are used without fine-tuning; retain this attribution and the downloaded model card when redistributing them. Model and provider licenses are separate from the application license.
