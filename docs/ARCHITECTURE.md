# The Living Sky v4: engineering notes

## 1. The continuous-space contract

There is one `layout.nodes` array per accepted collection. Each node contains one complete received comment, wrapped lines, XYZ, width, height, font size, mood mask, and render index. Nodes and their containing array are frozen. IDs and geometry produce a regression fingerprint.

```
ID before == ID after
[x, y, z, width, height] before == [x, y, z, width, height] after
camera before != camera after
```

This contract applies during zooming, dragging, pinching, filters, hover, guided travel, bookmarking, reading, return navigation, and resizing. Only accepting a different collection repacks the sky. There is no near-cloud array or transition between unrelated layouts. The offscreen mask is a measurement tool, never a visible solid word that disappears on approach.

## 2. Whole-comment packing

`layout.js` creates a 2400 × 760 measurement canvas. A thickened KHUSHI glyph mask supplies an integral image, allowing fast rectangular coverage tests. Text is measured with the actual browser font metrics. Grapheme-aware wrapping handles long tokens and emoji; the HTML reader retains the exact input string. Whitespace used only at visual wrapping boundaries is normalized for layout, not rewritten in source data.

A seeded hierarchy makes some short/medium comments visually larger, without assigning social importance or inventing engagement metrics. Larger rectangles are packed first; a spatial grid rejects collisions. Every full rectangle plus its margin must lie inside the letter mask. When necessary, the shared scale reduces across at most 18 packing passes. Work yields to the event loop during packing. Failure exposes a reading-list fallback rather than silently dropping comments.

Each node receives one depth coordinate from a smooth sinusoidal field plus small deterministic jitter. The 360-comment test field spanned approximately -138 to +30 world units. Neighbouring positions share a broadly coherent sheet, reducing extreme close-range overlap while retaining genuine parallax.

Packing is compensated against a reference camera at Z=3200:

```
f = (3200 - node.z) / 3200
node.x = referenceX * f
node.y = referenceY * f
node.width  = referenceWidth * f
node.height = referenceHeight * f
```

At that reference view the measured collision clearance is preserved. At other distances perspective changes the apparent relationships naturally. Deep close-ups can therefore contain overlap or words partly outside the viewport; these are not fixed by rearranging the world. Selecting a comment opens a readable original-word HTML view.

Exact first-load packing may differ between operating systems because system font metrics differ. Determinism here means identical source IDs, ordering rules, seeds, and font metrics, not a guarantee of identical typography on every platform.

## 3. One perspective camera

`math.js` uses a fixed 36-degree field of view and standard perspective projection:

```
distance = camera.z - node.z
scale = viewportHeight / (2 * tan(FOV / 2) * distance)
screenX = viewportWidth / 2 + (node.x - camera.x) * scale
screenY = viewportHeight / 2 - (node.y - camera.y) * scale
```

Zoom physically changes camera distance. Pointer-anchored wheel and pinch zoom use the picked node's actual plane Z, not a flat default when a word is present. Blank-space gestures anchor to Z=0. A minimum camera Z=78 stays in front of this word field. Free orbit is intentionally omitted: the work is a readable typographic sculpture rather than a tumbling particle ball.

Programmatic travel interpolates logarithmic distance with a quintic easing curve. Lateral moves add a restrained, smooth pullback arc. A new gesture interrupts the flight at the current view. Drag release adds bounded, exponentially decaying inertia. Reduced-motion preference removes flights and coasting; it does not alter geometry.

Reading and guided-wander entry each capture their own origin. Closing reading restores the reading origin; ending the trail restores its entry origin. Guided stops wait for user input. Resizing refits only the camera and graphics viewport, not the word field.

## 4. Rendering, not replacement content

### WebGL2

The dependency-free renderer draws instanced static paragraph quads in depth order, grouped into atlas pages no larger than the available texture limit or 2048 pixels. Transparent text uses alpha blending, not a depth-writing rectangle. Metadata controls mood/author emphasis and selected-word luminance. Coordinates are uploaded once per collection; author metadata updates reuse the same positions.

Base atlases use mipmaps for distant minification. A bounded detail cache renders up to four visible large words with higher-resolution raster tiles. It suppresses only each selected node's lower-resolution raster and draws the same complete lines at the **identical position, extent, and scale**. This is a texture-resolution change, not an alternative cloud or semantic swap. The cache retains at most 12 tiles, each limited to roughly 550,000 pixels before rounding.

Reported base texture estimates include mip overhead; driver memory and detail caches add overhead. They are not promises of a strict GPU memory cap. Context-loss handlers preserve the logical collection, recreate resources on restoration, and keep the HTML library available. Browser context-loss recovery still needs an end-to-end GPU-browser verification.

### Canvas2D compatibility renderer

The fallback consumes the same nodes and projection. It chooses among cached minified raster tiles when text is small, then draws the exact same wrapped lines at projected native font resolution when close enough. The word object never changes size in world coordinates and is not replaced by a different excerpt.

Its base raster target is eight million pixels, with additional mip allocations. The sample reported 42,711,952 bytes (about 40.7 MiB) of word-tile storage in the tested environment. This does not include all browser memory, background canvases, DOM, or driver overhead. The library remains available if neither graphics path can initialize.

### Atmosphere

`atmosphere.js` creates a deterministic world field used by both renderers: 2,400 background stars, density-varied node-local stardust, and 42 layered nebula billows behind the words. Their positions are fixed too. Only ambient scintillation changes with time. Canvas2D uses six locally generated noise slices; WebGL2 evaluates procedural noise in the cloud fragment shader. These differ in raster detail, not in the logical text layout.

Canvas2D caches the background at a reduced resolution, updating for camera movement or restrained ambient animation. A paused, settled scene stops painting until it is marked dirty. The separate annotation canvas caches unchanged camera/marker state and repaints only when needed or when a live echo is present. The animation-frame scheduler itself remains active. Atmosphere can be disabled entirely without removing or adding any comments.

## 5. Discovery, reading, and memory

`planJourney` picks up to seven existing eligible nodes in left-to-right spatial bands. Scoring prefers unvisited comments, varied authors, and manageable text length. It does not create prose, infer emotional truth, synthesize relationships, or label comments as more loved. The user can read, continue, return, or exit. Selecting a new filter ends an existing route rather than continuing through newly ineligible stops.

The reading dialog uses `textContent` for the exact original string. Recorded attribution, date labels, and links are shown only when available. Only explicit parent/root relationships supply conversation messages. Same-author visual connection lines mean exactly that: matching recorded authors, not inferred friendship or semantic similarity.

Local storage contains visited IDs, kept IDs, a camera view with its layout checksum, and Paper/Midnight, reading-size, gentler-motion, sound-level, and sound-texture preferences. Sound enablement is deliberately not persisted. The v2 collection namespace is retained for compatible upgrades. It never contains comment wording or author names. A hash of account and sorted IDs scopes each collection. Blocked storage, malformed records, and quota failures fall back to a usable session. Changing the set of IDs creates a different collection key, so bookmarks are conveniences, not a durable archival system.

## 6. Import and update boundaries

Normalization accepts the existing collector's object or comment array, preserves valid original fields, removes duplicate explicit IDs, and excludes owner-authored entries from the received-word instances. Missing IDs include source position in their derivation so identical unlabeled messages do not collapse. Unknown parents remain unknown. HTTP/HTTPS is the only permitted source-link protocol.

Parsing and schema validation happen before import; a bad file leaves the old scene intact. The importer guards concurrent builds. Explicitly empty input clears both scene and displayed collection markers. A loading epoch prevents an old startup fetch from overwriting a newer user-selected collection. Live read-only endpoint polling offers a pending refresh instead of moving words without consent.

This UI does not scrape Instagram, modify the original collector's generic filtering, upload imported data, or send comments to a model. Publicly serving a private static JSON file would still expose it. There is no authentication or private hosting layer.

## 7. Accessibility and lifecycle

Native buttons, labelled controls, search, HTML reading views, focus-contained dialogs, a live status region, and a graphics-independent reading list provide an alternate way through the content. Mood symbols and labels accompany colour. Touch pinch has explicit click suppression. Reduced motion is checked at startup and on preference changes. Sound is opt-in and mutes when the document is hidden. Distraction-free mode is reversible by Escape and a visible return control.

These are implemented affordances, not certification: no formal WCAG or dedicated screen-reader audit was performed. Audio hardware, physical phone performance, Safari, and cross-GPU operation are outside this environment's validation.

## 8. Experience state is not geometry state

`Experience` stores seconds of progress, not alternate word coordinates. The initial reveal is a spatially staggered opacity function of a node's fixed X position and an overall 3.1-second clock. It starts at 0.045 luminance and ends at exactly 1 for all X. A skipped opening completes that opacity immediately. It is never tied to zoom, so it is not a switch to a close-up layout.

Mood selection mixes the previous and next eligibility masks over 1.05 seconds with a mild left-to-right stagger. Unmatched text retains 0.14 emphasis. Renderer uniforms and Canvas alpha use the same pure functions. Author filtering continues to indicate explicit recorded authors only.

First-step selection scores existing nodes by readability, familiarity, size, and centrality. The 2.25-second camera flight stops before reading. `calloutPosition` evaluates five nearby candidate rectangles against projected comment rectangles, heavily penalizes covering the selected comment, and clamps the result to the usable viewport. It moves only the invitation, never the words. The annotation layer draws its leader and small selection corners.

Intentional gestures interrupt arrival/travel. Replaying the opening from a close-up ignores the ordinary first-zoom threshold until the return-home flight finishes, so the replay does not instantly dismiss itself. Reduced motion completes reveal/flight state rather than fast-forwarding a visible animation.

The reader uses a short opacity/12px entrance and 180ms exit, guarded by an epoch so an old closing promise cannot dismiss a newly opened comment. Backdrop dismissal requires both pointer-down and pointer-up outside the actual reader rectangle; a text-selection drag cannot accidentally dismiss it. Whole original text remains in `textContent`, `white-space: pre-wrap`, and `dir=auto`. Type controls scale only the HTML reader, not the physical word object.

A saved camera must have finite, bounded XYZ and an exact layout fingerprint match. The home overview is not treated as a resumable close view. Records contain no prose. The saved view is not restored automatically; the user chooses to return to it.

## 9. Sound is local synthesis, not a fetched soundtrack

`ObservatorySound` does not create an AudioContext until a deliberate enable action. The palette is eight D-major-pentatonic frequencies; a deterministic hash maps each actual comment ID to one of these notes. This is a stable note association, not a claim that every comment has a unique sound or that the text has been emotionally analyzed.

The graph contains four quiet sine drones, a seamless five-second noise buffer through a band-pass, two-partial exponentially decaying plucks, a generated stereo convolution tail, smooth gain/filter ramps, and a dynamics compressor. No audio recording, remote asset, LLM, or audio service is involved. Stereo placement follows the projected word's horizontal location, clamped to ±0.65; this is stereo panning, not a physical HRTF room simulation.

Pointer hover waits 480ms; visuals wait 180ms. Hover notes are globally limited to one per 600ms, and the same ID is not sounded again within seven seconds. That applies after an approach note too, avoiding an immediate duplicate sound on arrival. Up to twelve voices are allowed, with cleanup after their envelopes finish. The small opening motif is used only on the first deliberate sound enable outside a dialog, or on an explicit opening replay. Resuming sound during reading remains quiet.

Zoom continuously opens the bed's low-pass filter. Camera speed adds a bounded amount of navigation air. Reading sets that air to zero and multiplies the ambient bed by 0.18. Notes-only mode removes both the bed and air mix. Master gain uses the user volume, independent of the browser/device volume. Muting/visibility loss ramps the master down and schedules context suspension after 1.5 seconds. Showing a tab resumes only a context the user had enabled. The compressor and bounded graph do not guarantee safe hardware loudness.

`annotations.js` never renders comment text. Its transient echoes and kept markers use the same perspective projection as the words. The overlay caches settled state; after an echo ends it clears the final ring and then stops repainting until a view or marker changes. Ambient pause and reduced-motion policies suppress decorative echo animation.

## 10. Reproducibility and further verification

Production shader strings are exported solely for `tests/shader_checks.py`. It compiles all eight actual shaders and links all four actual programs with native EGL/OpenGL ES; it does not substitute a toy shader. The browser suite instead executes the actual single-file app and records geometry at intermediate flight frames as well as endpoints.

See `VALIDATION.md`, `browser-report.json`, `experience-browser-report.json`, and `shader-report.json` for the executed evidence and remaining boundaries. Debug mode exposes camera, geometry, viewport, counts, and raster estimates, not original comment wording:

```js
window.__skyDebug.snapshot()
```

Enable it using `?debug` on the server or set `window.HAPPYCOUD_DEBUG = true` before the main module executes. Normal recipient-facing use does not expose that diagnostic object.

Primary technical references used during the upgrade:

- MDN, WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- MDN, generateMipmap: https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/generateMipmap
- MDN, webglcontextlost: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
- MDN, WEBGL_lose_context: https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context

- MDN, Web Audio best practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN, AudioParam.setTargetAtTime: https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime
- W3C, Animation from Interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html

The API references explain the browser mechanisms, not evidence that this complete application has passed a cross-browser audit. Runtime scope is recorded separately in VALIDATION.md.


## 11. Edition IV: continuity at the interaction boundaries

`care.js` deliberately holds content-free helpers rather than a second rendering model. `ViewTrail` stores at most 24 copied camera XYZ states and deduplicates near-identical views. `ReadingTrail` stores at most 60 IDs and per-entry scroll offsets. Both are session-only and reset on a successfully accepted nonempty collection. The currently active reader’s return origin remains separate; stepping through reading history does not overwrite the place from which reading began.

Search carries an explicit origin record: query, shelf, list limit, scroll position and result ID. Returning to that record reconstructs the list and restores focus with `preventScroll`. A normal return to the sky clears the search-origin record. `snippetAround` folds accents for matching but maps the match back to original grapheme boundaries. The focused quotation always uses the original string.

Gesture depth is captured at the beginning of a wheel burst or pointer gesture and is also used to convert pan pixels into world-space movement. A third pointer is ignored. Pointer cancellation and pinch release clear navigation state and suppress accidental selection. The separate double-click handler was removed because it raced the normal click-to-approach operation.

`paintInterval` distinguishes moving/effect frames from idle atmosphere and still reading. Target request intervals are 60 Hz while interacting, 24 Hz for ordinary ambient motion, and 15 Hz for optional lighter-device ambience. Actual delivered frame rates depend on the browser/device; a running `requestAnimationFrame` observation loop remains. Unchanged minimap state is cached. Atmospheric cloud alpha moves from 0.78 at the overview toward 0.36 near the words; the comment renderer’s geometry and text textures do not participate in that attenuation. Native GLSL uses the new `uExposure` uniform, and Canvas uses the same computed value.

Sound consent uses a `wanted` intent flag plus an asynchronous epoch, distinct from the currently enabled graph. A late `resume()` cannot undo a subsequent mute. Each scheduled voice has a kind, time and cancellation state. Entering reading cancels exploration voice kinds; muting or hiding cancels all of them with a short gain tail. Hushing is idempotent. It does not schedule extra return notes to fill a cancelled moment.

The HTML reader is a flex column: fixed tools/route/footer and a shrinking, scrollable body. An unused history row is hidden. At short landscape heights, decorative quotation marks are removed and the base text size is adjusted before content is clipped. This is responsive presentation, not truncation of the original string.

The local `tools/refine.mjs` gate launches child commands without shell interpretation, serializes watch passes, ignores generated outputs, fails a bounded run on the first failing step, and records before/after source hashes. Its tests include a real disposable watcher fixture: initial pass, source edit, exactly one rerun, and clean SIGTERM exit. It never edits application source or calls a remote model.

Additional primary references consulted for this pass:

- MDN, WebGL best practices: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- MDN, Web Audio best practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN, Autoplay guide: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- W3C, Dragging movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- W3C, Target size (minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

These references inform mechanisms and design decisions; they are not an independent audit of this application.
