# happycoud

A constellation made from Khushi’s real Instagram comments. From a distance they spell KHUSHI. Stars gather into her name on arrival, then reveal the real words. First click zooms into a comment; a second click expands it into a full-screen reading space with mood lighting, attribution, saved conversation, and related comments.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4317/. The collector reads `../instagram-comments-khushi-2026-09-16/`: it combines the reviewed `khushi-comments-filtered.json` with the original `post-*.json` snapshots. The expanded filter currently includes 295 received comments, retaining fuller compliments and conversational remarks while excluding brief stock reactions. Khushi’s own comments never enter the cloud or related-comment list; her replies appear only inside their original conversations. Reviewed wording is preserved, and the source files are never changed. With no local data, import an archive through the interface. There are no demo comments in the application.

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
- `src/immersion.js`, `reader.css`: word expansion, finite star animation, and the responsive reading space.
- `src/data.js`, `scripts/comments.mjs`: lossless archive import and local collection.
- `src/main.js`: navigation, search, reading history, local saved marks, and optional sound.
- `tests/`: regression tests and synthetic test fixtures, which are never shipped in the app.

Original links and known parent relationships are preserved. Account-owner replies provide context, not received-comment counts. Coverage has Instagram visibility gaps, and mood labels are provisional. Motion has a reduced-motion path; locally synthesized sound follows interactions after the sound toggle is enabled; the reader remains selectable HTML.
