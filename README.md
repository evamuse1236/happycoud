# happycoud

A constellation made from Khushi’s real Instagram comments. From a distance they spell KHUSHI. Light emerges within condensing dust around fixed original words. First click zooms into a comment; a second click opens it through a whole-paragraph dissolve into a full-screen reading space, attribution, saved conversation, and related comments.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4317/. The collector reads `../instagram-comments-khushi-2026-09-16/`: it combines the reviewed `khushi-comments-filtered.json` with the original `post-*.json` snapshots. The expanded filter currently includes 346 received comments, retaining short genuine compliments and conversational remarks while excluding emoji-only reactions and filler. Khushi’s own comments never enter the cloud or related-comment list; her replies are also excluded from conversation context. Reviewed wording is preserved, and the source files are never changed. With no local data, import an archive through the interface. A clearly labelled sample sky is available when no archive is present; it is never mixed with the real collection.

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

Original links and known parent relationships are preserved. Account-owner comments are excluded from every reading surface. Coverage has Instagram visibility gaps, and mood labels are provisional. Motion has a reduced-motion path; locally synthesized sound follows movement and reading after explicit opt-in; the reader remains selectable HTML.

## Feelings and music

Open the edge light to choose **Feeling loved**, **Make me laugh**, or **A little poetry** directly. Matching original comments become brighter. A cello-like, marimba-like, or flute-like part plays recurring phrases alongside the existing score for as long as the feeling stays selected. It follows the current harmony, softens while reading, and changes smoothly when another feeling is selected. **Show everything** returns to the base score. Silent entry, mute, hidden-tab suspension, and the optional piano-only setting remain respected.

## The song in the clouds

After entering and letting the cloud form, **a lost signal** at the bottom centre connects to the song's source comments. Verified fragments lift from an original into the lyrics, then the recording starts from its beginning. Original comments retain their wording and attribution; their sung words light up in warm starlight. Additional lyric words appear in blue as they are sung. Pause, seek, mute, replay, and return to the sky are available; Escape returns and Space pauses when focus is on the lyrics. The ambient score pauses for the song and returns only if it was enabled beforehand. Hiding the page pauses the recording.

The local song is prepared from `song-work/lyric-matches.json` and the MAI transcript. To refresh its ignored playback assets after reviewing that mapping:

```sh
node scripts/prepare-song.mjs '/absolute/path/to/original.mp3'
npm run build
npm run build:standalone
```

The song, original comments, alignment, and transcription responses remain private, ignored local artifacts. The standalone HTML embeds the recording and alignment for offline playback. Without those assets, or after importing a different collection, the radar stays hidden. See [the song implementation notes](docs/song.md) for timing and provenance limits.

## Browser checks

With Python Playwright installed and Chrome available:

```sh
python tools/browser-checks.py --canvas
# With npm run dev running and the local archive present:
python tools/check-local-sky.py
python tools/check-mood-score.py
python tools/check-score-render.py
python tools/check-lost-signal.py
```

Reports and screenshots stay under ignored `test-results/`. The portable source-only build is `node tools/build-cinematic.mjs`; it produces `dist-cinematic/Khushi-Cinematic-Sky.html` without private data. Legacy `immersion.js` and `reader.css` are retained for reference but are not loaded by the cinematic application.
