# The experience, beat by beat

## The promise

This is a place to revisit words people actually left, not a machine for manufacturing praise. Its emotional weight should come from those words. Design can invite attention, make room, and remember where someone was; it must not substitute a generated sentiment, counterfeit engagement count, or invented conversation.

The single-space rule comes before every visual flourish. A comment's location, dimensions, and content are fixed for the collection. Opening effects change illumination. Zoom changes the camera. Reader animation changes an HTML surface. A detail texture changes raster resolution, not the object. At no point does the distant name dissolve into another arrangement of quotes.

## Before the sky

With no archive present, the empty view has one editorial invitation: “For the words worth keeping.” Local import and the illustrative sample are distinct choices. The aperture-like ornament is only interface decoration; it is not a substitute image of the cloud. No sound starts automatically and no recording downloads.

The sample's labels are intentionally explicit. Her private collection does not need to repeat those labels; the actual archive supplies its own count and author metadata. There is no fabricated “1,842 comments” counter or social proof.

## First three seconds

The layout is built before arrival. Over 3.1 seconds, a restrained light sequence travels across those exact words. It does not throw them in from the edges or shuffle them into a new shape. The first invitation appears below the sculpture: “From far away, a name. Up close, all the little things.”

The opening is not a toll gate. “Skip the opening,” the normal navigation controls, and intentional gestures remain available. A reduced-motion preference starts with fully visible words. Return visits with existing visited state do not need to repeat a ceremony. The options menu can explicitly replay it.

## The first approach

“Come closer” identifies an existing, relatively readable comment. The camera approaches over 2.25 seconds with no lateral detour. The word grows because its perspective projection grows. Nearby words remain nearby, with genuine depth and parallax.

Arrival at the word is not permission to force a dialog. Small corner marks identify it. A compact “Read this little moment” invitation sits in nearby whitespace. Its candidate positions are scored against the actual projected word rectangles. A fine leader maintains the connection if the available space is to the side. The user can read, continue zooming, or leave with a drag.

Manual first zoom has a single short line: “The same words. A little closer.” It expires rather than turning into a persistent tutorial. Phone instructions say pinch rather than scroll. On narrow phones, the overview navigator waits until exploration so it does not crowd the first invitation.

## Sound that listens to intent

Silence is a complete version of the experience. Enabling sound is deliberate, volume is independent, and the on/off state is obvious. There are no browser-autoplay tricks. An enabled first entry can play three spaced original notes; unmuting halfway through reading does not repeat that welcome.

Each comment ID returns to the same pitch within a small shared palette. The horizontal screen position supplies gentle stereo placement. A quick pointer crossing produces nothing. A sustained hover can produce one soft note after 480ms, subject to global and same-word limits. The visual mark responds earlier, after 180ms, so sound is not required to understand selection.

Movement adds a bounded amount of quiet air. Closer exploration gradually opens the ambient filter; it does not make every zoom gesture a cinematic whoosh. Reading removes navigation air and reduces the bed to 18% of its ordinary mix. Notes-only mode removes the ambient layers entirely. Keeping a moment has a short two-note response, not a reward explosion.

All of this is generated locally with Web Audio. The code includes gain envelopes, a stereo reverb tail, a compressor, voice limits and cleanup. These are implementation choices, not a promise about the volume of a particular pair of headphones. The supplied validation rendered and measured the graph but did not include subjective listening.

## A place to read

The original comment appears as a whole. There is no typewriter effect to make someone wait for the ending of their own memory. Paper feels distinct from the night sky; Midnight remains available. The small entrance settles quickly. The background quiets, and the text stays still.

Line breaks, emoji and wording are retained. Direction is automatic for the HTML quotation. Type controls span 90–150%, affect only the reading surface, and remember the preference when storage is available. Unknown authors, dates, and relationships remain unknown instead of receiving polished but false metadata.

Mute, keep and close stay within reach. M also works while the reader is open, except where it would interfere with text entry. A selection drag ending outside the card does not accidentally close it. Escape and the explicit return action share the same short exit and the same saved-camera restoration.

## Returning and keeping

Closing returns to the exact view that preceded the reading approach. A restrained echo identifies the word just visited. Keeping adds one bookmark ID; it does not rewrite, duplicate or promote the comment into a new position. A small mark remains tied to the actual word and is shown in the overview map.

A later visit may offer “Back to where I was.” That is an explicit choice, not an unexpected flight on load. Saved coordinates must match the current layout checksum. Only identifiers, preferences and the camera record may persist; never the comment wording. Sound is always off until enabled again.

## The quiet controls

Controls recede after inactivity and recover on interaction or keyboard focus. Full distraction-free mode is a separate explicit action with a visible return path. A guided wander waits at every stop, favours unvisited words and varied recorded authors, and has no automatic reading timer.

Mood changes travel as light across the fixed field. Symbols and labels accompany colour. Atmosphere can be turned off: the actual comments still make the name. Decorative animation respects both OS and app-level reduced motion. An OS request cannot be switched off by the app.

The transient-mark canvas caches its settled state. A return echo redraws only while active, clears itself, then lets the canvas rest. This is not a zero-CPU or battery-life claim; the broader frame scheduler remains active and hardware performance still needs measurement.

## Where to tune it

`src/experience.js` owns timing and opacity rules. `src/sound.js` owns envelopes, note palette and mix. `src/main.js` owns camera-entry and reading choreography. `src/annotations.js` owns word-anchored marks. `src/style.css` owns the visual transitions, reading sizes and phone layout. Leave the immutable geometry contract in `layout.js` intact when adjusting any of these.


## Edition IV: freedom to change your mind

A beautiful path is not enough when someone wanders away from it. This edition gives exploration a retrace action, reading a reversible sequence, and search an exact return point. These are separate memories because they answer different questions: “Where was I looking?”, “What did I just read?”, and “Where was I in the results?” None moves or duplicates a word.

Do not fill every available space with a control. The first reading has no disabled history strip. A guided wander suppresses the competing previous-view action. When the viewport is short, the decorative quote mark is the first thing to go, not the footer or the original text. Enlarging type should create an ordinary scroll, not a trapped card.

Atmosphere changes its role with distance. Far away it supports the sculpture; near a word it becomes quieter. This is only atmospheric alpha, never an opacity trick that hides a second word arrangement. A callout considers neighbouring words and visible navigation controls, and may move to the side when that is the least disruptive place. In a dense view there is no promise of a mathematically empty space everywhere.

The same rule applies to audio: an intention can be withdrawn. Mute cancels scheduled voices, not merely the visible icon. Reading cancels still-pending exploration notes. A quick on/off sequence must finish in the user’s last requested state. Silence is not a failed animation that needs a compensating flourish.

Lighter-device mode asks for fewer idle atmospheric paints. It does not remove comments or alter the packing. Optional tap-to-move controls provide an alternative to dragging. Both are explicit preferences rather than guesses about someone’s abilities or device.

The point of each review pass is not to add another effect. It is to discover the next place where the experience asks for unnecessary effort, loses a person’s place, surprises them, or draws attention away from the words.
