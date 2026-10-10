---
name: verify-happycoud
description: Drive the happycoud comment sky in a real browser (Playwright Chromium) to prove a change works - open the sample sky, enter, tap a comment to approach and read it, at phone 390x844 and desktop 1440x900, with screenshots. Use after changing anything a visitor sees or touches in happycoud, or when asked to verify, screenshot or smoke-test it.
---

# Verify happycoud

The surface is one web page (`index.html` + `src/main.js`) served by Vite. A visitor enters the sky, taps a comment once to fly to it (`focused`), taps again to read it (`reading`), then closes the reader. Everything here drives the **sample sky** (360 labelled comments), so evidence never contains Khushi's private comments.

## Launch

The bundled driver starts and stops its own server, so most runs need only this:

```sh
SMOKE_OUT=<evidence folder> npm run smoke      # PowerShell: $env:SMOKE_OUT='<folder>'; npm run smoke
```

It picks a free port, starts `node node_modules/vite/bin/vite.js` with `PORT=<port>` and `windowsHide`, waits for `GET /` to answer 200 (30 s limit), drives the browser, then stops that PID's tree. Ready when it prints `PASS phone ...`.

For a hand-driven session, start the server yourself and keep its PID:

```sh
PORT=<free port> npm run dev     # ready when the log prints "Local: http://127.0.0.1:<port>/"
```

Never use 8765. Without `PORT`, Vite takes 4317 or the next free port, which another repo's checks may own; pass `PORT` for agent runs.

## Doctor

Before driving an instance, confirm it is ours and what data it serves:

```sh
node -e "fetch(process.argv[1]+'api/comments').then(r=>r.json()).then(d=>console.log('comments:',d.comments.length,'source:',d.source))" http://127.0.0.1:<port>/
```

`comments: 0` (the `source` field reads `reviewed-and-expanded` either way) means the real archive (`../instagram-comments-khushi-2026-09-16/`) is absent: the page opens on its empty state, "Bring her words here." Any other count means real comments are loaded: drive only `?demo=1` URLs and never screenshot the default page. Connection refused means the server is down or on a different port.

## Drive

`npm run smoke` (`tools/smoke.mjs`) performs this recipe; use it as the reference for hand-driving with Playwright.

1. Open `<url>?debug`. `?debug` exposes `window.__sky`: `snapshot()` (phase, ready, count, sample, birth, renderer, nodes with screen `point`s), `select(id)`, `finish()`, `original(id)`.
2. If `#empty` is visible, click `#demo` ("Explore an illustrative sample sky"). Otherwise go to `<url>?demo=1&debug`. Wait for `__sky.snapshot().ready && __sky.snapshot().sample` and `count === 360`.
3. Click `#enter-silent` ("enter in silence"). `__sky.finish()` skips the formation.
4. Pick a node whose `point` is on screen, tap it (`page.touchscreen.tap` on phone, `page.mouse.click` on desktop). Wait for `phase === 'focused'`; `#reader` stays closed.
5. Tap the same node's new `point`. Wait for `phase === 'reading' && readingMix === 1`. The exact text is `#reader-quote .memory-original`; it must equal `__sky.original(selected).text`.
6. Click `#reader-close`. Phase returns to `focused`.

Collect `pageerror` events throughout; any one fails the run. Phone context: `{ viewport: 390x844, hasTouch: true, isMobile: true }`. Desktop: `1440x900`. Reduced motion: `reducedMotion: 'reduce'`, click `#enter-silent` without `finish()`, and within 400 ms `birth === 1` and `phase === 'sky'`.

Renderer: on Windows the driver launches Chromium with `--enable-gpu --use-angle=d3d11`, so the sky renders `webgl2` on the real GPU (~60 fps measured). Plain headless Chromium uses SwiftShader, which renders 1440x900 at ~3 fps and makes camera flights take many seconds; `SMOKE_GPU=0` forces that path. `?renderer=canvas` forces the Canvas2D fallback. The report records `renderer`, the GPU string and any `graphicsFallbackReason`.

## Evidence

`npm run smoke` writes to `SMOKE_OUT` (default `test-results/smoke/`, ignored by git):

- `phone-390x844-sky.png`, `phone-390x844-reader.png`, `desktop-1440x900-sky.png`, `desktop-1440x900-reader.png`
- `smoke-report.json`: URL, server PID, per width the route taken, renderer, comment opened, page-error count; the reduced-motion result.

Open at least one screenshot per width and confirm it shows the sky (the word KHUSHI made of comments) or the reader with one comment and its `@sample.friend.NN` byline, not a blank or error page. The sky screenshot proves the entry, the reader screenshot proves the two-tap read; the report proves the text matched and no page errors fired.

## Cleanup

`npm run smoke` stops the server it started (`taskkill /PID <pid> /T /F` on Windows) and leaves the evidence. For a server you started by hand, stop only its PID the same way. Never stop processes by name or command line: other agents run Vite in parallel. Cleanup never deletes the `SMOKE_OUT` folder.

## Features

The feature map in [features/README.md](features/README.md) lists what to drive beyond the smoke path: the two-step reader, Feelings, search, and the song.
