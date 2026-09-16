# happycoud — Living Sky IV

Khushi’s interactive comment constellation, upgraded from the supplied Living Sky v4 source. Whole comments occupy one fixed sky at every zoom level. Includes mood discovery, guided journeys, search, saved moments, reading history, camera retrace, optional sound and accessible touch/keyboard controls. WebGL rendering has a Canvas2D fallback.

## Run with local comments

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4317/. The existing collector reads the adjacent `instagram-comments-khushi-2026-09-16/post-*.json` snapshots without modifying them. Vite serves them through `/api/comments`; the interface continues to poll for updates. A fresh clone opens the import/sample screen until local data is supplied. The optional sample is explicitly illustrative.

## Build and verify

```sh
npm test                  # Collector plus Living Sky unit/installer tests
npm run build             # Sync local data and build the Vite app in dist/
npm run preview           # Serve the production snapshot
npm run build:standalone  # Build dist-standalone/ and Khushi-Observatory.html
npm run refine            # Living Sky tests and standalone build
```

`npm run refine:watch` explicitly starts the local review watcher. `npm run refine:full` additionally requires Python Playwright, Chromium and native EGL support. The standalone builder uses a separate output directory so it cannot replace the Vite production build. The single HTML includes the labelled sample and supports local JSON import; it does not embed the private collection.

## Data and privacy

Real wording, authors, links, dates and known conversation relationships remain supplied by the existing collector. Owner replies provide context rather than received-comment counts. Generic filtering and mood tags remain provisional heuristics; this is not a complete historical archive. Unknown parents remain unknown. Imports and saved marks stay local, and sound is opt-in.

Private comments, generated data, builds and verification output are ignored by Git. A production build can contain local comments, so publishing it is a separate decision.

## Implementation

The v4 front end is in `src/`; the preserved collector and its tests are in `scripts/`; additional tests and local tools are in `tests/` and `tools/`. See [architecture](docs/ARCHITECTURE.md), [experience](docs/EXPERIENCE.md), and [integration notes](docs/INTEGRATION.md). [The supplied bundle guide](docs/LIVING_SKY_BUNDLE.md) describes its original standalone workflow; use the repository commands above for this integration.
