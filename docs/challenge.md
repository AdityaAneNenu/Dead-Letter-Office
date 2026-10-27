# Week 4: verified challenge and implementation map

Verified on October 27, 2026 using the connected DevRelay MCP (`get_challenges`, `get_challenge_details`, challenge 82), followed by the official launch post, landing page, contest rules and template.

## Sources

- DEV Team: [Hacktoberfest Open-Source AI Challenge: Week 4 — Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26).
- DEV Team: [Official Week 4 contest rules](https://dev.to/page/hacktoberfest-week4-2026-10-26-contest-rules), authoritative for eligibility and dates.
- DEV Team: [Join the Hacktoberfest Open-Source AI Challenge: Ghost in the Machine](https://dev.to/devteam/join-the-hacktoberfest-open-source-ai-challenge-ghost-in-the-machine-2850-in-prizes-across-21-3cho).
- [Hacktoberfest 2026 challenge hub](https://dev.to/challenges/hf26), which distinguishes the weekly prompts.

This is **Week 4**, not Week 1. The theme is **Ghost in the Machine**: build something spooky, or honor the past in the spirit of Día de los Muertos, using open-weight models and/or open-source AI as a central part of the project. Local inference and partner technologies are examples, not mandatory technologies. Hosted inference using an open-weight model is compatible with the stated requirements; the open component must materially power the project.

## Dates and judging

The official rules specify **October 26, 2026, 9:00 AM PDT through October 31, 2026, 11:59 PM PDT**. That is **October 26 16:00 UTC through November 1 06:59 UTC**, with a deadline of **November 1, 12:29 PM IST**.

DevRelay's structured timestamps were `starts_at=2026-10-26T19:00:00Z` and `ends_at=2026-10-31T06:59:00Z`. They conflict with the directly verified rules (its prose agrees with the October 31 PDT deadline). Use the official rules and recheck the live page before submitting.

Writing quality is weighted most heavily, followed by relevance to the theme, creativity and technical execution. Partner-technology use matters for the corresponding optional prize category. No numeric weights were published in the reviewed sources. Ties use positive reactions on the DEV post. A clear, truthful write-up matters more than adding unrelated features.

## Requirements and current evidence

| Official requirement | Existing implementation / enhancement | Before submission |
| --- | --- | --- |
| New project created during the entry period | Author explicitly confirmed original creation during October 26–31; existing files were preserved | Git had no initial commits, so the date is author-confirmed rather than independently proved by history |
| Ghost in the Machine theme | Fictional archives of ordinary memories; third-person archivist; source quotations | Explain the remembrance interpretation |
| Open weights and/or open-source AI central to the project | CC-BY-4.0 tinyroberta-squad2 selects source passages through Transformers.js/ONNX Runtime on CPU | Review the separate real-model verification record; no provider key is required |
| Published DEV post using official template and `hf26challenge` tag | Local draft follows the template; `devchallenge` also appears in the official template | Review and publish once ready |
| Demo: deployed link OR video walkthrough | Local walkthrough and screenshots accompany the article; the app runs on-device | Publish the recording or a suitable demo and use its real public URL |
| Code repository URL | Source, tests, MIT license and setup guide prepared locally | Publish code and insert its public URL |
| Explain open AI choice, how it works and why open innovation matters | README and article explain CPU inference, exact-source checks, portability and tradeoffs | Keep the article's links and observed results accurate when publishing |
| Optional partner categories require meaningful use | No partner category claimed | Leave omitted unless qualifying work is verified |

The contest permits one entry per participant; only the first is considered if multiple are posted. Teams may have up to four members and submit one entry with each member credited by DEV handle. Review the full official eligibility rules and terms yourself. A login-based demo needs test credentials or testing instructions; this app has no account system. Entries and repositories must be created and completed within the event period, and any post-deadline commits must be noted in the README. Licensing is good open-source practice; it was not verified as a mandatory Week 4 condition.

## Initial audit and prioritized work

The starting repository had 11 source/asset/test/configuration files, no README, no commits, no remote and only untracked files. It already had a polished vanilla UI, six fictional fragments, four authored readings, collection CRUD/import/export/storage, BM25 retrieval, citation checks, a Node HTTP server and tests. All of that was reused.

The active provider was a loopback llama.cpp endpoint, but the UI promised a missing launcher and setup guide. No Ollama references or integrations were present. The initial test run reported 33/39 passing (four failing leaf cases, plus two failing parent groups): explicit server configuration bypassed endpoint validation; health accepted empty/missing model lists; invalid upstream JSON produced the wrong error.

Implementation work:

1. Verify Week 4 and record eligibility/submission gaps before changing the project.
2. Complete a documented hosted integration with disclosure/consent, then add the requested key-free default: an in-process CPU model with verified downloads and no separate service.
3. Fix provider health, validation, errors, capacity release and cancellation; retain citation checks and return exact original spans.
4. Preserve the interface, tighten collection/date validation and accessibility, and correct an unsupported identity claim in the authored sample.
5. Add immutable reading exports, visible retrieval context, model integrity checks, worker cancellation, focused regression tests, and separate real-model verification.
6. Run the app and browser flows, record a fictional demo, and complete setup, contribution and submission documentation.

No unrelated starting files were removed. The original absence of provider credentials is resolved for the default experience by running the open-weight model inside a Node worker. Optional hosted inference remains unverified against a real account; its fixture tests establish transport behavior only. See [verification.json](verification.json) for actual CPU outputs and timings, and [submission.md](submission.md) for the completed local article. A small regression set does not establish general model accuracy.

The model is [deepset/tinyroberta-squad2](https://huggingface.co/deepset/tinyroberta-squad2), converted to [quantized ONNX by onnx-community](https://huggingface.co/onnx-community/tinyroberta-squad2-ONNX), under CC-BY-4.0. Attribution, immutable revision and file hashes are retained in [model-manifest.json](model-manifest.json). The application code is MIT licensed; Transformers.js and ONNX Runtime have their own open-source licenses. No Ollama or separate model server is used.
