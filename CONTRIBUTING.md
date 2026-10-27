# Contributing

Use Node.js 22.9 or newer. Run `npm ci`, then `npm start` for the sample and archive editor. To exercise the default CPU model, run `npm run setup:model` once. The app requires no API key, GPU or separate model server. See the [README](README.md) for setup and optional hosted inference.

Before editing, read the relevant module and its tests. Preserve the established interface and avoid dependencies that do not address a concrete need. Keep HTTP/provider work in `server.mjs`, retrieval and quotation checks in `lib/archive.mjs`, model lifecycle in `lib/local-ai.mjs`, and pure extractive decisions in `lib/qa-core.mjs`. The worker is the only module that imports and runs the neural model. Collection validation belongs in `public/collections.js`; reading-export rules belong in `public/reading-export.js`.

For a fix, include a regression case that would fail without it. Run:

```sh
npm run check
npm test
npm audit --omit=dev
```

Run `npm run verify:local` after changes to model setup, inference, retrieval or evidence construction. It uses the downloaded open weights and reports actual HTTP results. Keep deterministic fixture tests separate from model-quality claims. Model changes need updated immutable revision/hash pins, license attribution, and fresh verification results.

For UI changes, also run `npm run test:browser` after the Playwright setup in the README. Check keyboard focus, narrow layouts, empty/error/loading states, source navigation and Markdown downloads. Preserve distinct labels for authored samples, on-device extractive readings and optional hosted responses. Keep smoke-test output in ignored `test-results/`. `npm run demo:record` records a real-model walkthrough with fictional archive material; review the result before publishing it.

Keep model output inert and verify every displayed quotation against the considered source text. Do not add executable tools to the model or log prompts, archive content or keys. Default inference must load verified local model files with remote model loading disabled. Do not introduce Ollama or a separate model service. Use the supported in-process CPU runtime and environment variables for optional hosted configuration.

Use fictional data for bug reports and demonstrations. Include reproduction steps, expected/observed behavior, Node/browser versions and relevant error text. Never commit `.env`, keys, private archives, personal reading exports, `node_modules/` or `.runtime/` weights. A model failure must remain a failure, never become an authored sample presented as inference.

Describe the change, its purpose, checks run and anything unverified in the pull request. Preserve existing work and Git configuration. The challenge requires development within its entry window; document post-deadline work in the README and follow the [official rules](docs/challenge.md).

Code contributions use the existing MIT license. Respect the model's CC-BY-4.0 attribution and rights to supplied archive material separately.
