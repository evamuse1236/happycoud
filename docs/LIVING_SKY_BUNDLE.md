# Khushi — The Living Sky
## Continuous comment constellation · edition 4

**A name from far away. Actual, complete comments when you come closer.** The camera moves through one fixed constellation. There is no second close-up cloud, morphing layout, fake word image, or replacement of her words with generated praise.

This edition refines the attached Living Sky v3 implementation. Its focus is the experience between the big features: arriving, finding the first word, hearing a small response, opening a moment, keeping it, and returning without losing your place. It is implemented in JavaScript, CSS, native WebGL2 and a Canvas2D perspective fallback. No image assets, font files, CDNs, audio recordings, AI service, or runtime dependencies are required.

## What edition IV refines

This is a continuity and care pass, not a new constellation under another name. The whole-comment packer is byte-for-byte unchanged from v3. The details around it have been repaired through repeated implementation, real-browser inspection, adversarial interaction checks, and a final reproducible gate.

**Retrace exploration.** “My previous view” and the **B** key return through a short session-only trail of actual camera states. It is distinct from Home and from the reader’s exact return origin. Redundant views are not added. Guided wander keeps its own return control instead of showing competing routes home.

**Reading has a back button.** After “Another moment,” Previous returns to the exact earlier comment and its saved scroll offset; Next goes forward through that same reading history. A new branch discards obsolete forward entries. The route row stays hidden on the first card when there is no useful action to offer.

**Search keeps your place.** Open a result and choose “Back to results” to restore the query, shelf, list scroll and that result’s keyboard focus. Snippets find a late match in a long comment instead of showing only the beginning. Accent folding is used for matching; the displayed snippet retains original graphemes and spelling. A visible reset resolves an empty search or highlight dead end.

**Reading deserves the space.** Copy uses the exact original text. If clipboard permission is unavailable, the actual words are selected and the interface explains the fallback. The reader has a genuinely scrollable body with reachable tools and footer at 320px phone width, 150% type, and short landscape height. In short landscape, decorative quote marks disappear before the text loses its space.

**Movement has an anchor.** A wheel burst and a touch gesture retain the depth plane of the word initially grabbed, rather than hopping between nearby words’ depths. Additional fingers and pointer cancellation cannot leave a stuck drag. Optional directional tap controls provide a drag-free way to pan.

**Sound can change its mind.** Rapid on/off input cancels pending consent rather than reviving audio after mute. Entering reading cancels queued exploration notes. Muting or hiding the tab cancels existing and future voices, including their scheduled envelopes, before the context rests. A shared palette, deliberate hover, notes-only option and quiet reading mix remain.

**Effects step back.** The procedural haze attenuates as the camera approaches, without dimming the actual comment textures. Callouts for first approach and guided stops share collision-scored placement that accounts for other words and visible controls. The map and settled sky avoid redundant paints. “Lighter on this device” reduces ambient repaint requests; this is a scheduling policy, not a promised frame rate or battery saving.

## Open it

The separately delivered **Khushi-Living-Sky-v4.html** is the standalone app. Open it in a recent full browser. The identical generated file inside this source folder is named **Khushi-Observatory.html** to retain the existing build convention.

Choose **Take a look inside · sample sky** to see the explicitly labelled 360-comment illustration, or **Open your comments** to load a normalized JSON file locally. The sample is not her archive. Khushi's private comments were not available for this upgrade. Imported wording is neither uploaded nor written back to the file.

A phone's file-manager preview may not run JavaScript. Open the HTML with a full browser, or serve the source:

```sh
cd happycoud-living-sky-v4
npm run dev
```

Open `http://127.0.0.1:4317/`. This source project has no install-time packages: **no `npm install` is needed**. Node.js 20+ is recommended; validation used Node 22.16.0. Set `PORT` if 4317 is occupied. A served origin is preferable for reliable saved moments; browser storage policies for local files differ.

## What to experience first

Let the name arrive, or skip the opening. The comments illuminate across the already-built sculpture over approximately 3.1 seconds; they do not fly into substitute positions. The interface invites rather than blocks. Sound is off.

**Come closer** takes a 2.25-second camera journey toward an actual, readable comment. It stops before opening anything. A small invitation is placed in nearby whitespace, with a fine leader back to its word. You can read it, pan away, or zoom elsewhere. On a phone, the initial invitation has room to breathe before navigation controls appear.

Switch on sound for locally synthesized night air and soft notes. The same comment ID always maps to the same note in a restrained palette. A quick pointer crossing stays silent; a deliberate hover may play one stereo-positioned note. Reading removes navigation air and lowers the ambient bed. Keeping a moment adds a small two-note response. Muting works from the reading card and the `M` key. Turning sound back on while reading does not replay the opening. There is a notes-only mode and a volume control.

Open a comment to read its **exact original wording** on Paper or Midnight. It arrives as one readable piece, not a typewriter effect. Adjust the type size from 90% to 150%; line breaks, emoji, script direction, attribution, and recorded conversation remain intact. Close it to return to the exact camera view you left. A quiet visual echo marks the word you just visited.

The earlier features remain: pointer-anchored zoom, touch pinch, interrupted camera flights, moods, author highlighting, overview map, search, All/Unvisited/Kept shelves, a user-paced guided wander, and distraction-free mode. No automatic tour timer decides how long someone should read.

## Install over the existing happycoud repository

Extract this folder next to the existing repository:

```sh
cd happycoud-living-sky-v4

# Optional: inspect which front-end files would change.
node tools/apply-to-repo.mjs ../happycoud --dry-run

# Back up the previous front end, then install this one.
node tools/apply-to-repo.mjs ../happycoud

cd ../happycoud
npm run dev
```

Use a quoted absolute path in place of `../happycoud` when needed. The installer replaces only `index.html` and the included `src/*.js` / `src/*.css` files. **Your package files, Vite configuration, collector, private snapshots, and public data remain untouched.** It verifies the target structure, refuses unsafe symlink targets, and creates a sibling backup before the first replacement. The backup includes a manifest and this restoration command:

```sh
node restore.mjs --restore
```

Save later front-end edits before restoring. No part of this package commits, pushes, uploads, or publicly deploys anything. The upgraded front end uses native renderers; leaving Three.js in the original package file does not require using it in the new front end.

## Connect her real comments

The original normalized collector contract is preserved. Inside the original Vite project, the app reads `/api/comments` and checks it every 12 seconds while the document is visible. Static hosting uses `./data/comments.json`. This source server can serve `public/data/comments.json`. The standalone HTML accepts local JSON input or drag-and-drop; it does not silently embed a private archive.

Accepting newly collected comments is explicit: **Refresh sky** offers a rebuild rather than relocating words during a visit. Raw extraction `post-*.json` snapshots must pass through the existing collector first.

Input is a comment array or an object with a `comments` array. Each comment needs a nonempty `text` string. Preserve original fields rather than fabricating missing metadata:

```json
{
  "account": "the-original-account",
  "comments": [
    {
      "id": "the-original-comment-id",
      "text": "The exact original wording, including line breaks.",
      "author": "the-original-author",
      "moods": ["love"],
      "conversation": []
    }
  ]
}
```

This is a schema illustration, not a real comment. Supported mood IDs are `love`, `laugh`, and `poetry`. The importer also preserves known `parentId`, `isReply`, `isOwner`, `postUrl`, `commentUrl`, `postDate`, and `timeLabel`. Unknown information stays unknown. Owner-authored replies are conversation context, not received-comment instances. A missing parent is not guessed.

Duplicate explicit IDs are deduplicated. Missing IDs incorporate source position and content so two identical unlabeled messages are not silently collapsed. Original IDs are preferable for stable identity when imports are reordered. Invalid JSON or an unsupported structure leaves the current scene intact. An explicit empty array clears it.

## Privacy, memory, and comfort

Only visited/kept **IDs**, visual/audio preferences, and a checksum-qualified camera view may be written to browser storage. No comment wording or author handles are stored there. Sound enablement is never persisted as autoplay consent. A returning visit offers **Back to where I was** only when the saved view matches the current layout. The v2 visited/kept namespace is deliberately retained so an in-place upgrade can reuse those markers.

Blocked storage falls back to this visit only and the UI says so. Markers are a convenience, not an archival backup; changing the set of comment IDs creates a different collection key. Reset visited & kept moments clears those markers and the saved view without modifying the comments.

**Do not publish a static build containing private `data/comments.json` unless you deliberately intend to expose that file.** Static JSON is downloadable. This project is not encrypted storage, authentication, private hosting, or account sync. It includes no tracking and no remote model calls.

Gentler motion removes the arrival animation, camera flights, inertia, and small interface animations. An OS reduced-motion request is always respected; the app cannot override it. Sound is optional, has an independent volume, fades on tab hiding, and releases the audio context after muting. Distraction-free mode and keyboard-accessible reading remain available.

## Controls

Scroll or pinch to approach; drag to wander; click or tap a comment to read. The map moves the camera. Moods and authors change emphasis, never positions.

| Key | Action |
| --- | --- |
| `+` / `-` | Zoom |
| Arrow keys | Pan |
| `Home` | Whole sky |
| `B` | My previous view |
| `J` | Start/end a guided wander |
| `S` | Discover a comment |
| `L` or `Ctrl/Cmd + K` | Search the library |
| `M` | Mute/unmute, including in the reader |
| `F` | Enter/leave distraction-free mode |
| `H` | Guidance |
| `Space` | Pause/resume atmosphere |
| `Escape` | Close a dialog, stop guidance, or restore controls |

Text fields keep their normal keys. Native buttons retain Space activation. A graphics-independent HTML library remains available if rendering fails. These affordances are not a claim of a formal accessibility audit.

## Build and verify

```sh
npm test
npm run build
npm run preview
```

The build recreates `dist/` and the single-file HTML from the same source modules. The standalone file does not contain private comments you imported while using the app. A static `dist/` does copy anything you deliberately put in `public/`; review that directory before sharing.

Optional development checks:

```sh
# Python Playwright + Chromium; CHROMIUM can select the executable.
python tests/browser_checks.py
python tests/experience_browser.py
python tests/care_browser.py

# Linux native production shader compilation/linking: libEGL + Node + Python.
python tests/shader_checks.py
```

See **docs/VALIDATION.md** for exact results and limits. Browser testing here used the real Canvas2D perspective fallback and the actual standalone bytes in memory; the environment could not create a WebGL2 browser context and blocked normal URL/file navigation. All production shaders compiled and linked separately in native OpenGL ES. Actual Web Audio output was rendered offline and measured, not listened to on headphones. The private archive, Safari, GPU-browser integration, and physical-device performance still need local validation.

## Keep the local review loop running

```sh
# Bounded test + build pass. No browser-testing packages required.
npm run refine

# Recheck source edits; Ctrl+C stops. Passes are serialized, not overlapped.
npm run refine:watch

# Optional complete gate: Python Playwright + Chromium, plus Linux EGL.
npm run refine:full

# Repetition can also be finite and explicit.
node tools/refine.mjs --cycles=2
```

The watcher runs locally only when you start it. **It runs checks and rebuilds; it is not an autonomous designer or an AI self-editing agent.** It never pushes or publishes. Command logs and a machine-readable record go to `test-results/`. Each record includes before/after source hashes: a source change during a pass prevents that pass from being labelled clean. A failed check stops that pass. Watch mode waits for your repair; bounded mode exits nonzero. Generated outputs do not trigger another pass.

Read `docs/REFINEMENT_LOG.md` for the actual critique–repair sequence in this edition, and `docs/REVIEW_CHECKLIST.md` for the human experience pass that automated checks cannot replace.

## Source map

`care.js` holds session-only camera/reading trails, search snippets and rendering cadence. `experience.js` holds reveal, hover, mood-wave, first-moment, and saved-view rules. `sound.js` contains the native audio graph. `annotations.js` draws only selection, kept, and return marks and avoids repainting settled marks. `layout.js` owns immutable whole-comment packing. `math.js` and `controls.js` own projection, camera travel and gestures. `renderer.js` / `canvas-renderer.js` display the same geometry. `atmosphere.js` supplies world-space procedural layers. `journey.js` supplies actual-node routes and content-free memory. `data.js` preserves input and explicit conversations. `main.js`, `index.html`, and `style.css` orchestrate the UI. `demo.js` is visibly labelled illustrative material.

The importer ceiling of 5,000 comments is a safety limit, not a smooth-performance guarantee. The interaction tests use 360 comments. System font metrics can change the initial packing between devices; once the layout is built, its comment geometry stays fixed.
