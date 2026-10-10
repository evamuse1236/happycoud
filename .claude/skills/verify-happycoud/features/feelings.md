# Feelings

The visitor picks a feeling and the comments that match it brighten while the rest dim; with sound on, a matching instrument joins the score. "Show everything" returns to the full sky.

## Sub-features

- `feeling-love` "Feeling loved".
- `feeling-laugh` "Make me laugh".
- `feeling-poetry` "A little poetry".
- `feeling-all` "Show everything" resets.

## How to get to it (user POV)

- Open "Explore the sky" (`#beacon`, or Space on the sky), then choose a feeling in the orbit (`#orbit [data-mood="love"]`, `laugh`, `poetry`, `all`).
- While a feeling is active, the "Show everything" link (`#show-everything`) also resets.

## Driving it with Playwright

Preconditions: baseline sample sky, entered.

- **Open the orbit.** Click `#beacon`. `#orbit` is visible and `#beacon` has `aria-expanded="true"`.
- **Choose a feeling.** Click `#orbit [data-mood="love"]`. `snapshot().mood === 'love'` and the button has `aria-pressed="true"`. Screenshot: matching comments bright, others dim.
- **Reset.** Click `#orbit [data-mood="all"]` or `#show-everything`. `snapshot().mood === 'all'`.
- **With sound.** Turn on `#sound` first; `snapshot().audio.instrument` names the part (love: "warm chamber ensemble").

## Gotchas

- Sample comments carry one mood each; real comments can have several or none.
- The mood transition animates for about a second unless reduced motion is on; wait before the screenshot.
- 17 sound-engine unit tests are known failures (AGENTS.md); judge sound by `snapshot().audio`, not by those tests.
