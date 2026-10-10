# Enter and read a comment

The visitor enters the sky, taps a comment to fly to it, taps again to open the full-screen reader with the exact original text, attribution and context, then closes it or follows another comment.

## Sub-features

- `enter-silent` enters without sound; `enter-sound` enters with the score.
- `approach` first tap zooms to a comment without opening the reader.
- `read` second tap opens the reader with the exact original wording.
- `close` returns to the zoomed-in comment.
- `next-previous` follows another comment and steps back through history.
- `keep` marks a comment as kept; it appears under "Kept close".

## How to get to it (user POV)

- Click "enter in silence" (`#enter-silent`) or "Enter the sky with sound" (`#enter-sound`) on the gate.
- Tap or click a comment twice. Keyboard: focus the sky (`#universe`), press Enter twice.
- In the reader: "Return to the exact place you left" (`#reader-close`, or Escape), "Visit another moment" (`#reader-next`), "Previous visited moment" (`#reader-previous`), "Keep this moment" (`#keep`).

## Driving it with Playwright

Preconditions: baseline sample sky, entered (`phase === 'sky'`).

- **Approach.** Tap a node at its `point`. Wait for `phase === 'focused'`; `#reader` is not `open`.
- **Read.** Tap the node's new `point`. Wait for `phase === 'reading' && readingMix === 1`. `#reader-quote .memory-original` text equals `__sky.original(snapshot().selected).text`. Screenshot.
- **Next and previous.** Click `#reader-next`; `selected` changes and `readingMix` returns to 1. Click `#reader-previous`; `selected` is the first id again.
- **Keep.** Click `#keep`; `snapshot().kept` includes the id and `#keep` has `aria-pressed="true"`.
- **Close.** Click `#reader-close`; `#reader` closes and `phase` is `focused`.
- **Proof.** `npm run smoke` covers approach, read and close at both widths.

## Gotchas

- `#reader-quote` also holds an `aria-hidden` line-broken copy, so its whole `textContent` repeats the text. Compare `.memory-original`.
- After entering, the formation runs for several seconds; tap after `finish()` or after `birth === 1`, or the tap lands on moving words.
- Under reduced motion the formation is skipped and the camera jumps; `phase` still goes `focused` then `reading`.
