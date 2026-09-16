# Living Sky IV repository integration

Source: `happycoud-living-sky-v4-source.zip` (SHA-256 `0407da1f467be0c769373612578b42f79854831949bb494370115b88050aedb1`). Integrated into the existing happycoud repository on 2026-09-16.

The supplied index and all 15 JavaScript/CSS source files were applied without visual changes. The existing collector, collector tests, Vite configuration and installed dependency versions were preserved. Package scripts now run both test suites and expose the standalone tooling. The standalone build writes to `dist-standalone/` rather than overwriting Vite’s `dist/`.

The supplied test/tool sources and explanatory documentation are included. The ZIP’s historical test reports and generated build were not adopted as fresh verification evidence. Generated builds, logs, reports and private data are ignored.

The installer made a sibling backup before replacing the previous front end. Git history also retains the original version. The original bundle documentation describes its own source environment and verification, not this repository’s current check results.

## Verification in the destination repository

- `npm test`: 132 tests passed, zero failures.
- `npm run build`: Vite production build passed with the existing collector.
- `npm run build:standalone`: separate standalone build passed.
- Browser checks: real collection loads; searching returns the expected result; selecting it opens the original wording and source link. Reader and constellation checked at desktop and 390 × 844 mobile sizes; mobile document width is 390 px. No browser warnings or errors were captured.
- Supplied frontend files remain byte-for-byte identical to the ZIP. Automated design review flags inherited small text, contrast, and animation choices; these are retained as part of the supplied design, not certified as accessibility-compliant.
- Private collection data and generated outputs remain ignored by Git.
