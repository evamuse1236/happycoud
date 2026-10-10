# happycoud

A Vite + plain-JS sky (WebGL, Canvas2D fallback) made from the real Instagram comments people left for Khushi. From afar the comments spell KHUSHI; tap one to approach it, tap again to read it with its conversation.

The comments are private. Everything in this file serves that rule first.

## Commands

| Task | Command | Notes |
|---|---|---|
| Install | `npm run setup` | `npm ci` + Playwright Chromium (`playwright` 1.63.0, reuses `%LOCALAPPDATA%\ms-playwright\chromium-1243`). No env file or secrets needed. |
| Run | `npm run dev` | `PORT=<n>` pins the port (strict). Without it Vite starts at 4317 and moves to the next free port; read the URL from the log. Never use 8765. |
| Test | `npm test` | node:test, minus the known failures below. `npm run test:all` runs everything. |
| Verify | `npm run verify` | The gate before saying done: tests, archive sync (or a loud SKIPPED line), `vite build` into a temp folder, build-output privacy scan, smoke drive. |
| Smoke only | `npm run smoke` | Starts its own Vite on a free port, or uses `HAPPYCOUD_URL`. Screenshots in `test-results/smoke/`. |

Drive the app with the `verify-happycoud` skill (`.claude/skills/verify-happycoud/`). Open the sample sky at `/?demo=1&debug`; `?debug` exposes `window.__sky` (`snapshot()`, `select(id)`, `finish()`, `original(id)`).

## Private data

- The real archive lives **outside** the repo at `../instagram-comments-khushi-2026-09-16/` (`khushi-comments-filtered.json` + `post-*.json`). It is read-only. When it is missing, `npm run dev` serves 0 comments and the app shows its empty state with the labelled sample sky.
- Generated private output stays local and uncommitted: `public/data/`, `public/media/`, `song-work/`, `dist/`, `dist-standalone/` (all in `.gitignore`).
- `npm run build:standalone` embeds the real comments and the song into one HTML file. Run it only into a temp folder you delete afterwards.
- Publishing is the owner's call: `.openai/hosting.json` deploys `dist/`, so leave deploys to the owner.
- `npm run build` runs `sync` first. With the archive missing, sync prints `SKIPPED real-archive sync` and writes an **empty** `public/data/comments.json`, replacing any earlier real snapshot. `npm run verify` skips the sync instead and builds into a temp folder.

## Project map

- `src/main.js`: boot, navigation, reader, search, sound wiring, the `__sky` debug hook. Data loads from `?demo=1` → embedded data → `/api/comments` → `/data/comments.json` → empty state.
- `src/data.js`: `normalizeData`, `isOwnerComment` (the owner filter), `loadData`. `src/demo.js`: the sample sky.
- `scripts/comments.mjs`: the collector (`collectComments(dir)`) behind `npm run sync` and the dev `/api/comments` middleware in `vite.config.js`.
- `src/layout.js`, `renderer.js` (WebGL), `canvas-renderer.js` (Canvas2D): the sky. `src/cinema.js`, `condensation.js`, `experience.js`: formation and camera.
- `src/starlight/`: the live reader scene (`memory-scene.js`), the song (`song.js`) and the radio entry. Top-level `src/song.js`, `src/memory-scene.js`, `src/immersion.js` and `src/reader.css` are earlier versions the app no longer loads.
- `src/sound.js` + `src/score-plan.js`: the opt-in score and Feelings instruments.
- `tests/`: node tests; `tests/fixtures/sample-data.mjs` mirrors the sample sky. `tools/`: build scripts, `verify`/`smoke`/`run-tests`, Python Playwright checks.
- Background: [README.md](README.md), [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/EXPERIENCE.md](docs/EXPERIENCE.md), [docs/song.md](docs/song.md).

## Glossary

- **Sky / comment cloud**: every comment placed once at a fixed **anchor**; together they spell KHUSHI.
- **Formation / condensation / birth**: the opening where dust gathers into the words (`state.birth` 0→1). Reduced motion skips it.
- **Focused → reading**: first tap flies the camera to a comment (`phase: 'focused'`); a second tap opens the **reader** (`phase: 'reading'`). Closing the reader returns to `focused`.
- **Reviewed archive**: `khushi-comments-filtered.json`, the owner-reviewed export (346 received comments), supplemented by **snapshots** (`post-*.json`).
- **Owner comment**: anything written by Khushi (`khushi.o_o`, `khushi.0_0`, `khusi.0_0`, or an owner flag). Excluded from every reading surface, conversation context included.
- **Sample sky**: 360 illustrative comments from `src/demo.js`, always labelled, never mixed with real ones.
- **Feelings**: the mood filters *Feeling loved*, *Make me laugh*, *A little poetry*, each with its own instrument part.
- **Lost Signal / radar / song**: the song built from comments, hidden unless `public/data/song.json` matches the loaded real collection. Timings come from the Azure **MAI** transcript.
- **Standalone build**: offline single HTML with private data (`tools/build.mjs`). **Cinematic build**: source-only HTML without data (`tools/build-cinematic.mjs`).

## Rules

| Rule | Enforced by |
|---|---|
| Owner comments never reach collected or shipped data, conversation context included | test `collected comments and their conversations exclude every owner handle` (tests/privacy.test.mjs); verify step `build output privacy scan` (tools/check-build-output.mjs); test `owner comments and duplicate IDs do not enter the constellation` |
| Sample skies never carry an owner handle and stay labelled `sample` | test `sample skies never carry the account owner's handles` |
| Collecting never modifies the source archive | test `collecting an archive never modifies the source files` |
| No transcription endpoint or credential reaches the browser | verify step `build output privacy scan`; test `the build scan reports owner comments, transcription endpoints and keys` |
| An omitted root comment never lends its replies to the previous root | test `snapshot preserves original multiline text and associates the correct replies` (scripts/comments.test.mjs) |
| Reduced motion shows the finished sky on entry | `npm run smoke` reduced-motion step; test `reduced motion completes both the arrival and mood transitions immediately` |
| Original wording, line breaks and emoji are preserved | test `normalization preserves exact original whitespace, Unicode, and source input`; smoke checks the reader text equals the original |
| Emoji-only reactions and filler stay out; short real compliments stay in | test `generic reactions are excluded while specific jokes survive` |
| Private outputs are never committed | `.gitignore` |
| Never publish or deploy; never commit `song-work/`, `public/data/`, `public/media/`, `dist*/` | written only |
| Word timings come from the provider; never divide a phrase evenly | written only (docs/song.md) |
| Hide SVG with the real `hidden` attribute, not the property | written only (docs/lost-signal-verification.md) |

## Known failures

17 sound tests fail on `main` (00b2299) because `src/sound.js` was rewritten around `score-plan.js` and the tests still assert the old engine (`MAX_VOICES` 24, `pendingFocus`, `moodNote`, `track()` returning null). They are listed by exact name, with the reason, in `tests/known-failures.json`; `npm test` skips exactly those names and fails if one is renamed. Decide with the owner whether the tests or the engine are right before editing either.

## Gotchas

- The reader keeps the exact text in `#reader-quote .memory-original` and draws an `aria-hidden` line-broken copy beside it, so `#reader-quote`'s full `textContent` holds the text twice.
- Python checks in `tools/*.py` read `CHROMIUM_PATH` (default: Linux Chrome if present, else Playwright's Chromium) and `HAPPYCOUD_URL` via `tools/browser_env.py`. Most need the real archive. `tools/browser-checks.py` drives the cinematic build, which omits `src/starlight/` modules, so it times out today. `tests/shader_checks.py` is Linux-only (libEGL).
- Headless Chromium falls back to SwiftShader, which renders the desktop sky at ~3 fps, so camera flights stall and taps time out. `npm run smoke` launches with `--enable-gpu --use-angle=d3d11` on Windows (`SMOKE_GPU=0` turns it off). `?renderer=canvas` forces the Canvas2D path.
- Every spawned process uses `windowsHide` and a timeout; stop only PIDs you started.
