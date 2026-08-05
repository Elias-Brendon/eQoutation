# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.1](https://github.com/Elias-Brendon/Qoutation/compare/v0.1.0...v0.1.1) (2026-08-05)


### Features

* add @napi-rs/canvas dependency and pure page-render-scale calculation ([ebc52dc](https://github.com/Elias-Brendon/Qoutation/commit/ebc52dcb03e22af8966435a00e5a8a0bfa9458b7))
* add best-effort update-availability check ([238d792](https://github.com/Elias-Brendon/Qoutation/commit/238d792ae3b6aa08540a9f2f1ebae689a322b71c))
* add bounding-box-aware dedup helpers for merging AI extraction passes ([f9a729b](https://github.com/Elias-Brendon/Qoutation/commit/f9a729be4cd32cf0da91aef08c6c19b464b3159d))
* add cachedAiModels setting and TestApiKeyResult.models field ([0c41975](https://github.com/Elias-Brendon/Qoutation/commit/0c41975c251efc386a7e3449388234585babf28a))
* add crop-zoom system prompt ([3c93de4](https://github.com/Elias-Brendon/Qoutation/commit/3c93de4585207e9b9f40eff38570e6e66c1b1a09))
* add delete-project UI to the project switcher ([cf0e433](https://github.com/Elias-Brendon/Qoutation/commit/cf0e433bfdeca37ba2ad6f93401eef7a42fe039b))
* add diagnostic bundle export (Settings > Diagnostics) ([f25a181](https://github.com/Elias-Brendon/Qoutation/commit/f25a181679a9218ce7753b747cf1789b46cfa243))
* add event_log table and repository for observability ([84ee319](https://github.com/Elias-Brendon/Qoutation/commit/84ee319eefbd52fc592c01e6744f20dfcf4702c4))
* add manual BOM line creation (AddLineModal + Add line button) ([3ed4229](https://github.com/Elias-Brendon/Qoutation/commit/3ed42296e344187ebe638b7929335cb174f48fae))
* add OpenAiCompatibleProvider (single-pass, non-streaming) ([3a423fd](https://github.com/Elias-Brendon/Qoutation/commit/3a423fd68e903e532a63d7e5b2124601fd690e4f))
* add panel detection to the draft extraction schema ([cf2b70c](https://github.com/Elias-Brendon/Qoutation/commit/cf2b70c176c0c84dd4ec63dc1f067d7cc98a9768))
* add per-panel crop-and-zoom extraction pass ([3b85dbe](https://github.com/Elias-Brendon/Qoutation/commit/3b85dbe3152aa592bddeb29dc5a0381244189719))
* add per-row remove-from-BOM button ([a7e46da](https://github.com/Elias-Brendon/Qoutation/commit/a7e46da725402e8335ba8b4ebaa51ba9345738ef))
* add project deletion (cascade DB delete + file cleanup) ([9661f20](https://github.com/Elias-Brendon/Qoutation/commit/9661f2004f7b69b3795ba142fd8d1984206a5897))
* add provider selection and OpenAI-compatible fields to Settings ([aec1c03](https://github.com/Elias-Brendon/Qoutation/commit/aec1c0391c4826e72f2fb4a786b822680e33e2af))
* add pure resolver for selecting aiModel after a model-list refresh ([92f8029](https://github.com/Elias-Brendon/Qoutation/commit/92f8029a90fa4e3d9930a11c4f26ef2053b78978))
* add repo functions for manually adding and removing quotation lines ([319e1fa](https://github.com/Elias-Brendon/Qoutation/commit/319e1fa347f0480fadea37155e8780495cb6907f))
* add self-verification pass to catch missed components and inconsistent ratings ([cdc332b](https://github.com/Elias-Brendon/Qoutation/commit/cdc332b41f3767c5bace88f0d2a916116f0ce50e))
* add settings/secrets model for a second AI provider ([180163c](https://github.com/Elias-Brendon/Qoutation/commit/180163c84acee16a8bbaf12b072d95692cdc0e13))
* add soft-delete column for quotation lines ([d09f539](https://github.com/Elias-Brendon/Qoutation/commit/d09f5393f81abc094f7279389d91841830f2e87f))
* add verification response schema and normalizer ([4ef8d9b](https://github.com/Elias-Brendon/Qoutation/commit/4ef8d9b77bffe0bf9be954aa271c0f808bb21aca))
* add verification system prompt, reusing the draft extraction's rules ([dc24226](https://github.com/Elias-Brendon/Qoutation/commit/dc24226092e0c3edf179972723223f6aa3911b89))
* expose project deletion over IPC ([3b695f2](https://github.com/Elias-Brendon/Qoutation/commit/3b695f2aeabdd39d7335ec5875373b295da2b3fe))
* expose quotation-line add/remove over IPC ([62b8c26](https://github.com/Elias-Brendon/Qoutation/commit/62b8c26d0b441e8b6f03ca4be2e8049327e18eb2))
* expose update status over IPC, add dismissedUpdateVersion setting ([08a8991](https://github.com/Elias-Brendon/Qoutation/commit/08a8991a7352cbf84f51c678e2581dd41613abaf))
* fetch full model list on API key test, persist and auto-reset aiModel ([5e001a5](https://github.com/Elias-Brendon/Qoutation/commit/5e001a5a5385cb4625c33ee0d758a773f5653e04))
* log main and renderer process crashes to event_log ([c7f0dde](https://github.com/Elias-Brendon/Qoutation/commit/c7f0dde60e5ff629da29096426f66edc8cd322c3))
* log unexpected IPC errors to event_log ([5470ecf](https://github.com/Elias-Brendon/Qoutation/commit/5470ecfb8953c60f23bd811a0258dd4185048152))
* render PDF pages to PNG images via pdfjs-dist + @napi-rs/canvas ([c579b95](https://github.com/Elias-Brendon/Qoutation/commit/c579b95c84f23cc94df938cb62186147fae9027e))
* send rendered page images instead of a raw PDF document to Claude ([ffcb1a0](https://github.com/Elias-Brendon/Qoutation/commit/ffcb1a07377666365e52205ac122a6742f73e03b))
* show a dismissible TopBar notice when a new version is available ([747c5d8](https://github.com/Elias-Brendon/Qoutation/commit/747c5d8da34023b45c0750bcf974cfbcf8bed08d))
* use the fetched model list in the AI Model dropdown ([54d5eba](https://github.com/Elias-Brendon/Qoutation/commit/54d5eba3298371c8bf1bc097aa360c588b85e79b))
* wire OpenAiCompatibleProvider into the extraction and key-test paths ([693e4dd](https://github.com/Elias-Brendon/Qoutation/commit/693e4dd2f132c17aa6a33c15df5bca239a6a7a5b))


### Bug Fixes

* clear cross-reference annotation highlight when hiding AI annotations ([2a0eb31](https://github.com/Elias-Brendon/Qoutation/commit/2a0eb3167958c7e47d3bcd3ff8123c3de5f23e66))
* correct installer verification assumptions found by a real run ([3884557](https://github.com/Elias-Brendon/Qoutation/commit/3884557ba192c0fb6189a488ab054471c51be1ff))
* dedup verification-pass results before merging into the draft ([198ef41](https://github.com/Elias-Brendon/Qoutation/commit/198ef41b3f2d7dce09825c30bd32f65dbe0edf77))
* remove auto-scroll-to-center on the panel tab strip ([7603ecd](https://github.com/Elias-Brendon/Qoutation/commit/7603ecdf1d76ade5beab315c620f29719f859a77))
* stop the verification prompt from re-defining the extraction task ([fbc763f](https://github.com/Elias-Brendon/Qoutation/commit/fbc763f18349c5aa99fde8322f24f24f6f0c9d38))
* surface the AI provider's own error message for unclassified failures ([625261d](https://github.com/Elias-Brendon/Qoutation/commit/625261d2119d4b392757ffb9d0c41950dc0a15cc))
* tick progress during the verification call ([f81df9a](https://github.com/Elias-Brendon/Qoutation/commit/f81df9a809729b4eac9c297e4b976c567b40bd8d))

## 0.1.0 (2026-08-03)

Initial beta baseline. Changelog tracking starts from this tag forward — see `git log` for full project history prior to this point.
