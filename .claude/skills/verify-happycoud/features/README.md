# happycoud verification map

The maintained list of what a visitor can do in happycoud and how to prove each one. Read this index, then use the matching feature file as the recipe.

## Baseline preconditions

- A Vite server this run started, on a `PORT` you chose (see ../SKILL.md, Launch). Never 8765.
- The sample sky is loaded: `__sky.snapshot().sample === true` and `count === 360`.
- The page was opened with `?debug` so `window.__sky` exists.
- If the doctor reports real comments, use `?demo=1&debug` only and take no screenshots of the default page.

## Driving conventions

- Prefer ids and ARIA labels from `index.html` (`#enter-silent`, `#beacon`, `[data-mood="love"]`, `#query`) over coordinates. Comments live on a canvas, so tap them at `snapshot().nodes[i].point`.
- Wait on `__sky.snapshot().phase` (`gate`, `birth`, `sky`, `focused`, `reading`, `returning`, `empty`) instead of fixed sleeps.
- Drive with real clicks and taps. `__sky.select(id)` and `__sky.finish()` are shortcuts; say so when you use them.
- Capture `pageerror` events for the whole run.

## Proof and skip reporting

- Pair each action with the resulting state: a screenshot plus the `snapshot()` fields that changed.
- Save evidence under the run's `SMOKE_OUT` or evidence folder, named `<feature>-<width>.png`.
- Report a feature that needs the real archive (the song) as UNVERIFIED with the doctor output, never as verified through the sample sky.

## Features

- [Enter and read a comment](./reading.md): entry, two-tap approach and read, close, next and previous, keep.
- [Feelings](./feelings.md): mood filters that brighten matching comments and add an instrument part.
- [Search](./search.md): find comments by wording or author and open one from the results.
- [The song (Lost Signal)](./song.md): radar-triggered song over real comments; unavailable on the sample sky.
