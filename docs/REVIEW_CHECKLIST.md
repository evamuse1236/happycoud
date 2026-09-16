# Human review loop

The local gate can detect regressions. It cannot decide whether a moment feels considerate. Run this experience pass after a green test report, and record observed defects before adding features.

## Arrival and first approach

Start with no stored preferences and no audio consent. Confirm the private/sample distinction is obvious. Let the opening complete once; repeat and interrupt it with a scroll, a skip, and a touch. Reduced motion should reveal the same words without ceremony. “Come closer” should move toward a real word and stop before forcing reading. Check the invitation against both its target and the neighbouring words. Neither an unseen control nor an ornamental animation should delay entry.

## Touch, interruption and orientation

Zoom over an actual word, then over blank space. Reverse a wheel burst; drag while a flight is running. Pinch, add a third finger, cancel a pointer and begin again. Confirm there is no accidental selection or stuck gesture. Compare My previous view, Home and a guide’s return: each should restore the place its label promises. Try directional tap controls and keyboard-only navigation. Do not repair difficult views by moving the words.

## Sound, on the intended hardware

Listen at a comfortable device volume, starting with the application volume low. Check first enable, a fast sweep over words, a deliberate dwell, a quick on/off/on/off sequence, and muting during the opening tail. Read immediately after an approach note. Hide and restore the tab. No deferred exploration sound should surprise a person after entering a quiet reader or muting. Test notes-only and complete silence. The default must feel restrained on the recipient’s speakers/headphones; numerical waveform tests are not this listening pass.

## Reading and getting back

Open an actual long comment with line breaks, emoji and a long handle. Try Paper and Midnight, 90% and 150%, narrow portrait and short landscape. Tools/footer remain reachable; the body should scroll ordinarily. Select text and end the selection outside the card. Copy, then test denied clipboard access. Open Another moment, go Previous, then Next. Check exact text and scroll position, not merely the displayed author.

Search for a word late in a long comment. Open a lower result, read, and return to results: same query, shelf, list scroll and focused result. Reset a no-result search. Try a contenteditable/input field to ensure app shortcuts do not consume ordinary typing. Close reading and verify the previous camera position.

## Data and privacy

Use a disposable import before the private collection. Check a malformed file, unsupported schema, explicitly empty collection and a repeat import. Missing authors/dates/parents stay unknown. Confirm received counts exclude owner replies while explicit conversation context remains accessible. Treat public/data as publishable content: do not host private JSON accidentally. This app provides no authentication or encryption.

## Real graphics and devices

On a GPU-enabled browser, confirm debug snapshot `renderer` is `webgl2` and `webglError` is zero, then exercise all navigation and import paths. Test context loss/restoration. Repeat in Safari, Firefox and the recipient’s real phone. Check first-load latency, high-DPI sharpness, tab RAM, sustained performance and temperature with real data. Verify file-origin behavior or use a served local origin. None of these hardware/cross-browser conclusions can be inferred from a headless fallback test alone.

## Make the next change small and observable

Record one defect, the situation that triggers it, and the smallest change that would improve it. Implement that change, run the gate, then repeat the exact interaction and compare. Remove an effect or control when that improves attention. Stop a pass when the regression report fails; do not add a new visual flourish on top of a broken return path.

```sh
npm run refine:watch
# Edit deliberately, inspect each pass, Ctrl+C to stop.
```

This watcher does not call an AI or redesign on its own. For a complete optional gate, use `npm run refine:full` with the documented test prerequisites.
