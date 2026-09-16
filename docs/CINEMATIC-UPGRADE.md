# Local integration notes

The supplied Cinematic Sky V frontend is merged with the existing Vite collector and local archive. The installed version restores two-step selection: first approach, then read on another click/tap or Enter. Search results and explicit reader navigation open directly. Conversation context and related archive comments appear inline in the sky-backed reader.

Feelings are directly available in the light menu. Each selected feeling adds a continuing, harmonically matched instrument part, not a one-time selection sound. Love adds a cello-like voice; laughter adds marimba; poetry adds flute. Reading reduces the part, Show everything removes it, and switching preserves the underlying score's progression. Piano-only mode omits these extra layers.

`npm test` includes the cinematic tests. Earlier tests requiring flying words or navigation sound cues were updated for fixed geometry and quiet controls; consent races and audio limits remain covered. The source-only and private-data standalone build paths both resolve the new modules.

The following is the supplied upgrade design record; local behavior above supersedes its automatic-reader and four-point-menu descriptions.

---

# Cinematic Sky V — integration notes

This is a frontend replacement for happycoud, reviewed against commit `ed62a22f6f599e9b606285644a1cbf5a5aa2bc06`. It does not change the collector, data snapshot, Vite configuration, package manifest, or Git history. Keep these notes alongside the original integration history; its earlier test results are not evidence for this version.

## Start / build

Use the repository's existing `npm run dev` and `npm run build`. The entry still loads `./api/comments`, then `./data/comments.json`. The reviewed snake_case archive adapter, owner exclusion, explicit parent context, source links, original text and existing content-free browser memory namespace are retained.

The new standalone builder is `node tools/build-cinematic.mjs`, producing `dist-cinematic/Khushi-Cinematic-Sky.html`. It does not overwrite `dist/` or replace your old standalone builder. A standalone page opened without a local server asks for the original JSON; samples are an explicitly labelled, opt-in preview. The public source does not contain your private collection.

## Tests

Run `node --test tests/cinematic/*.test.mjs` for the new regression suite. Existing tests remain untouched. Some legacy frontend tests assert the superseded page structure, sound cues and reveal effects; those assertions need review rather than silent deletion. This bundle does not claim that your original complete `npm test` suite or destination Vite build was run.

`tools/browser-checks.py` in the downloadable bundle exercises the actual standalone code with a labelled sample fixture. Its report states the renderer actually available in the test environment. Native WebGL hardware, Safari/iOS audio interruption and the private archive require a destination-device pass.

## Experience contract

All comments occupy one deterministic, fixed world geometry. The opening moves dust, never quote planes. Dust has bounded, fixed-step, softened gravity and gas drag; quote ignition varies by identity rather than a left-to-right wipe. This is a time-compressed, art-directed metaphor for stellar formation, not an astrophysical simulation or a claim that natural stars form letters.

The reader uses one direct camera dolly and a whole-paragraph opacity handoff at the destination. It is still an HTML reading surface for selection, accessibility and long text; it is not secretly a new random star field. Source whitespace is preserved in the reader. HTML wrapping can differ from canvas wrapping, especially for long text, mobile screens and enlarged reading type. There are no separately flying word spans.

A selected comment dims in the canvas as its exact text becomes readable in the same location. Surrounding geometry stays put. Returning restores the saved camera position. Navigation interrupts a pending approach without opening a late reader. The only new persistent content is comment IDs and comfort preferences, not private wording.

A small navigation constellation replaces the permanent toolbar. Four labelled points provide search, mood lighting, kept moments and settings. Quiet labels appear where discovery needs them; controls remain real buttons with names and keyboard focus, not unlabeled artwork. The minimap uses the same fixed node coordinates. Feelings only use supplied mood labels; no emotions or relationships are inferred.

Sound is an original procedural chamber-ambient score: modal piano synthesis, slowly overlapping bowed harmonic voices, a convolution room, restrained movement air and a quieter reading mix. It is not a licensed orchestral recording. No hover/search/settings bleeps. Audio starts only after explicit consent, may be muted with M, and suspends when the page is hidden. The engine bounds active voice groups at 24.

## Undo

The supplied installer creates a timestamped sibling backup and prints its path. From the downloaded bundle, use `node tools/restore-cinematic.mjs /path/to/backup`. Restoration checks checksums and refuses to overwrite intervening frontend edits unless explicitly permitted. Imports have a separate, session-only "previous sky" action in settings; import text is not automatically persisted.

## Scientific and technical references

NASA, **Star Basics**: https://science.nasa.gov/universe/stars/ — stellar formation begins in gravitationally collapsing gas and dust, not already formed stars assigned typographic destinations.

MDN, **Web Audio API best practices**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices — explicit playback control and sensible audio lifecycle handling.

MDN, **Autoplay guide**: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay — browsers can restrict playback without user interaction.
