# Search

The visitor searches comments by wording or author, opens one from the results in the reader, and can return to the same results.

## Sub-features

- `search-open` opens the reading list.
- `search-query` filters by original wording or author.
- `search-open-result` opens a result in the reader.
- `search-return` returns from the reader to the same results.

## How to get to it (user POV)

- "Find words or a person" (`[data-open="library"]`) in the orbit (`#beacon`).
- Press `/` with focus on the sky.

## Driving it with Playwright

Preconditions: baseline sample sky, entered.

- **Open.** Click `#beacon`, then `[data-open="library"]`. `#library` is `open`.
- **Query.** Fill `#query` with `ordinary afternoons`. At least one `.result` appears.
- **Open a result.** Click the first `.result` and note its `data-comment-id`. Wait for `readingMix === 1`; `snapshot().selected` equals that id.
- **Return to results.** Click `#reader-results`. `#library` is open again and `#query` still holds the query.
- **Proof.** Screenshot the results list and the reader.

## Gotchas

- Results render after a short debounce; wait for `.result` rather than reading the count immediately.
- Close the sheet with `#library [data-close]` before driving the sky again; an open dialog takes the sky's keys.
