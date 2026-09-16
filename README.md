# happycoud

A constellation made from Khushi’s real Instagram comments. From a distance they spell KHUSHI. Light emerges within condensing dust around fixed original words. First click zooms into a comment; a second click opens it through a whole-paragraph dissolve into a full-screen reading space, attribution, saved conversation, and related comments.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4317/. The collector reads `../instagram-comments-khushi-2026-09-16/`: it combines the reviewed `khushi-comments-filtered.json` with the original `post-*.json` snapshots. The expanded filter currently includes 295 received comments, retaining fuller compliments and conversational remarks while excluding brief stock reactions. Khushi’s own comments never enter the cloud or related-comment list; her replies appear only inside their original conversations. Reviewed wording is preserved, and the source files are never changed. With no local data, import an archive through the interface. A clearly labelled sample sky is available when no archive is present; it is never mixed with the real collection.

## Verify and build

```sh
npm test
npm run build             # Sync the real archive, then build dist/
npm run preview           # Serve the production build
npm run build:standalone  # Offline single HTML in dist-standalone/
```

Run `npm run build` before the standalone build to refresh the local snapshot. `dist-standalone/Khushi-Observatory.html` embeds that real snapshot and works offline. Generated outputs contain private comments and remain ignored by Git; distributing them is a separate action.

## Source map

- `src/layout.js`, `renderer.js`, `canvas-renderer.js`: one fixed comment cloud, with WebGL and Canvas2D rendering.
- `src/cinema.js`, `condensation.js`, `style.css`, `reader-context.js`: fixed-anchor formation, quiet reading transitions, and responsive conversation context.
- `src/sound.js`: continuous piano score and recurring feeling-specific instrument parts.
- `src/data.js`, `scripts/comments.mjs`: lossless archive import and local collection.
- `src/main.js`: navigation, search, reading history, local saved marks, and optional sound.
- `tests/`: regression tests and synthetic test fixtures, used only for explicit sample and test runs.

Original links and known parent relationships are preserved. Account-owner replies provide context, not received-comment counts. Coverage has Instagram visibility gaps, and mood labels are provisional. Motion has a reduced-motion path; locally synthesized sound follows movement and reading after explicit opt-in; the reader remains selectable HTML.

## Feelings and music

Open the edge light to choose **Feeling loved**, **Make me laugh**, or **A little poetry** directly. Matching original comments become brighter. A cello-like, marimba-like, or flute-like part plays recurring phrases alongside the existing score for as long as the feeling stays selected. It follows the current harmony, softens while reading, and changes smoothly when another feeling is selected. **Show everything** returns to the base score. Silent entry, mute, hidden-tab suspension, and the optional piano-only setting remain respected.

## Browser checks

With Python Playwright installed and Chrome available:

```sh
python tools/browser-checks.py --canvas
# With npm run dev running and the local archive present:
python tools/check-local-sky.py
python tools/check-mood-score.py
python tools/check-score-render.py
```

Reports and screenshots stay under ignored `test-results/`. The portable source-only build is `node tools/build-cinematic.mjs`; it produces `dist-cinematic/Khushi-Cinematic-Sky.html` without private data. Legacy `immersion.js` and `reader.css` are retained for reference but are not loaded by the cinematic application.
