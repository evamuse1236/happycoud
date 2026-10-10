# The song (Lost Signal)

After the sky forms, a radar ("a lost signal") at the bottom centre starts a song whose lyrics come from real comments: sung words light up in the original comments, extra lyric words appear in blue, with pause, seek, mute and return.

## Sub-features

- `song-radar` the radar appears only for the matching real collection.
- `song-play` gathering sequence, then playback with timed highlights.
- `song-transport` pause, seek, mute, replay, return (Escape returns, Space pauses).

## How to get to it (user POV)

- Enter the sky, let the formation finish, click the radar (`#sl-portal`).

## Driving it with Playwright

Preconditions: the real archive is synced and the ignored assets `public/data/song.json` and `public/media/khushti.mp3` exist. The doctor reports real comments.

- **Radar.** Open `<url>?debug`, enter, `__sky.finish()`. `#sl-portal` is visible.
- **Play.** Click `#sl-portal`. `snapshot().song` reports the song active.
- **Proof.** Run `python tools/check-lost-signal.py` with `HAPPYCOUD_URL=<url>`; it writes screenshots under `test-results/`. Those contain private comments: keep them out of shared evidence folders.

## Gotchas

- On the sample sky, or without the private assets, the radar stays hidden by design. Report the song as UNVERIFIED there; that is the expected state, not a bug.
- The song pauses when the page is hidden; headless runs keep the page visible.
