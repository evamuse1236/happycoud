# Cinematic Sky V integration verification

Run on 16 September 2026 against the local Vite project and user-supplied upgrade ZIP.

- All 168 unit tests pass. The default unit suite includes both existing regressions and new cinematic tests. Assertions for obsolete navigation sound cues and moving quote anchors were migrated to the new continuous score and fixed geometry. Consent races, gesture separation, original wording, collector behavior, and camera round trips remain covered.
- All 13 checks in `tools/browser-checks.py --canvas` pass. The suite exercises labelled fixtures: formation, two-step reading, exact return, interrupted approaches, search and return, keyboard, history, sound consent, mobile layouts, pinch, long text, reduced motion, and inert markup. No external requests or uncaught errors.
- `tools/check-local-sky.py` exercises the actual 295-comment archive through Vite on desktop and 390px touch mobile. It uses real pointer/touch selection, reads full originals, follows nearby comments, verifies exact camera return, and clears selection after manual zoom. Local WebGL2 rendering reports GL error 0.
- `tools/check-mood-score.py` exercises recurring mood instrument phrases, ongoing base harmony, reading attenuation, removal on Every feeling, silent selection, and light-menu bounds at desktop, 390px and 320px widths.
- Vite production and both standalone paths are built from the merged source. Private generated data and screenshots remain ignored by Git.

The visual review preserves the supplied celestial glow, serif words, dark sky, condensation, and quiet transitions. The mechanical design detector's stylistic glow flags are intentional for this reference; its existing tiny waveform height transition is bounded to the seven sound-indicator bars.

Browser checks use local Chrome. Physical phones and Safari are not verified. Procedural cello, marimba, and flute parts are synthesized approximations, not recordings. The ZIP's installer created a sibling backup before source replacement; Git also retains the prior version.

Final mood-score verification observed at least two recurring phrases per selected feeling, with 10 peak concurrent voices against a 24-voice limit. Reading retained the instrument at its quieter target; clearing feelings drained all instrument voices. Tests inspect live voice lifetimes and scheduled mix targets because Chrome can retain stale AudioParam values after a bus becomes inactive.

`tools/check-score-render.py` rendered the base score and all three added voices through the actual engine. All samples were finite, the maximum measured peak was 0.0671 (below clipping at 1.0), and output before enablement was exactly silent. This is a sample-level check, not listening or physical-device certification.
