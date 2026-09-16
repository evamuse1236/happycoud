# happycoud

Source code for Khushi’s interactive comment constellation. Extracted comments and generated data are kept local and are not included in this public repository. A fresh clone shows the empty state until local comment snapshots are supplied.

A local Three.js constellation. Actual comment fragments form KHUSHI from a distance. Zoom transitions to a separate, collision-spaced cloud of complete comments with natural text proportions and detailed emoji. Includes mood highlighting, drag to explore, surprise discovery, a centred reading card with expandable replies, author exploration, and a keyboard-accessible reading list.

## Run

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4317/. The development server reads the adjacent `instagram-comments-khushi-2026-09-16/post-*.json` files without writing to them. The open page checks for changes every 12 seconds. Keep the development server running for live updates.

`npm run build` saves a current data snapshot and creates a self-contained static build in `dist/`. `npm run preview` serves that snapshot. Static builds do not read later extraction files; rebuild to update them.

## Data boundaries

- Real wording, authors, comment links, available post dates, and reply relationships are preserved from rendered Instagram snapshots.
- Received-comment counts exclude Khushi's own replies. Her replies remain available in conversations.
- Generic filtering and mood tags are provisional heuristics pending final curation. They do not claim a complete historical archive.
- A missing parent is left unknown rather than attaching a reply to another conversation.
- Lettering contains fragments that may recur to fill the silhouette. The interface count is the number of unique received comments, not the number of rendered fragments.
- The close cloud represents each received comment once. Longer comments wrap; opening one shows its original wording and line breaks. Closing a comment restores your exploration position.
- Everything is local. Fonts and Three.js are bundled. The preview does not publish, send, or fetch any Instagram content itself.

## Verification

`npm test` checks text preservation, parent/reply boundaries, and generic-filter examples. `npm run build` validates the production bundle. Browser verification covers desktop/phone layout, mood selection, surprise discovery, full conversation, author exploration, pause, zoom, and return to the name.
