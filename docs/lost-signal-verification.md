# Lost Signal integration and visual review

Integrated the user-supplied `happycoud-lost-signal-upgrade.zip` against its exact pinned host baseline. The installer preserved the archive, recording, source mappings, camera and reader. Its rollback copy is a timestamped sibling under `.happycoud-lost-signal-backups/`.

The destination review uses the real local MP3, all 40 timed phrases, 35 source comments and production WebGL renderer. Private screenshots and JSON evidence remain in ignored `test-results/lost-signal/`. The supplied fixture report is not evidence for production rendering.

## Corrections after rendered review

- Paused seeking no longer recreates a source word suspended over the source link or controls. A settled seek remains settled until the media clock advances; ordinary pause still freezes an existing flight.
- The SVG pulse now uses an actual `hidden` attribute. Assigning an SVG `hidden` property did not hide its drawing, leaving a pulse at the corner during entry.
- The sky's decorative cursor is hidden using its actual class, and its renderer restores the native pointer while the song is open.
- Non-highlighted original text and upcoming lyrics retain readable contrast. The next-line preview is also clearer.
- Removed the visible song title and connection caption at the user’s request, retaining an accessible dialog name. Removed the connection-stays ending status.

## Reproduction

Start `npm run dev`, then run `python tools/check-lost-signal.py` with Python Playwright and Google Chrome available. `CHROMIUM_PATH` and `HAPPYCOUD_URL` can override those defaults. The runner exercises real media advancement, pause, paused seeking, mute, source drawer focus, transcript selection, restart, camera restoration, reduced motion and all actual lyrics across five viewports. It also saves production WebGL screenshots.

Focused unit checks: `node --test tests/lost-signal.test.mjs tests/starlight.test.mjs` (59 tests). Production and standalone builds use the existing project scripts. The design detector reported no findings for the changed UI.

The full baseline suite has 17 existing sound-test failures (186 passing out of 203 before adding the Lost Signal tests). A clean `git archive HEAD` copy reproduced all 17 before the upgrade; the sound implementation was not changed by this integration.

Browser verification covers desktop Chrome with viewport/touch/reduced-motion emulation. Physical Safari/iOS playback and listening-based accuracy of the supplied lyric timestamps remain unverified. No publication or deployment is part of this review.

## Restored song details

The follow-up restores six KHUSHI letter contacts and stronger word-contact glow, replaces the outlined pulse with a soft cursor-like light, and removes repeated source-to-lyric flights during playback. The opening gathering remains. The name's letter subdivisions are display timing, not separately measured lyric alignment.

`python tools/check-signal-restoration.py` uses the actual song and WebGL scene to check each of the six contacts at all three KHUSHI passages, canonical spacing, contact glow, the light’s measured landing, radio output/mute, the native-playing handoff, close interruption and reduced motion. Radio sound is synthesized locally from bounded filtered noise and two sine oscillators; it has no external audio dependency.

## Row breaks and opening handoff

All row changes now fade out at the departing word, switch endpoints while invisible, then fade in at the next row. The opening gathering now runs 30% faster and dissolves by 6.4 seconds, leaving a 1.7-second wordless interval before the radio locks and the recording starts at 8.1 seconds. The call appears at its first word without overlapping the gathered preview. The original returns when source-bearing lyrics begin. Pause, seek and reduced motion continue to derive their state from the recording.
