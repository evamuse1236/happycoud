# Living Sky III → IV

The centerpiece is unchanged: one immutable, whole-comment constellation. This update repairs the paths around it.

| Area | Change in IV |
| --- | --- |
| Wandering | Session-only camera retrace; B / My previous view restores actual prior coordinates |
| Reading | Reversible Previous/Next with per-comment scroll memory; no useless history row on the first card |
| Search | Back to results restores the query, shelf, list scroll and exact result focus |
| Snippets | Search matches later in a long comment can appear in the snippet; original spelling/graphemes retained |
| Copy | Exact original string; honest browser-selection fallback when clipboard permission is unavailable |
| Touch | Gesture depth locked to the initially grabbed plane; third-touch/cancel protection; optional tap-direction controls |
| Callouts | First approach and guided stops share collision scoring, including reserved controls |
| Sound | Last-requested consent wins; mute/hide cancels scheduled voices; reading cancels exploration cues |
| Atmosphere | Cloud haze recedes with proximity; actual words do not dim as part of this effect |
| Reader layout | Flex scroll body, reachable footer and tools; decorative quote mark removed at short landscape heights |
| Rendering cadence | Cached minimap/still-state paints; optional lower-cadence idle ambience |
| Future changes | Local bounded/full/watch review gate, command logs and source fingerprints |

## Apply

Place the extracted `happycoud-living-sky-v4` folder beside the original `happycoud` repository. Review a dry run, then apply:

```sh
cd happycoud-living-sky-v4
node tools/apply-to-repo.mjs ../happycoud --dry-run
node tools/apply-to-repo.mjs ../happycoud
cd ../happycoud
npm run dev
```

The backup includes a manifest and `restore.mjs`. From that backup directory, run `node restore.mjs --restore` to restore the previous front end. Save any subsequent edits first. Package files, Vite config, scripts/collector, public data and private extraction snapshots are not replaced.

For the standalone delivery, open `Khushi-Living-Sky-v4.html` in a full browser and use the labelled sample or a local normalized JSON import. No package install is needed. The source folder’s equivalent single-file build retains the name `Khushi-Observatory.html`.

No remote commit, push, deployment or public share is part of this upgrade. See VALIDATION.md for the exercised paths and remaining limitations.
