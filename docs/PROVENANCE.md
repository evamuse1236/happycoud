# Source provenance — edition IV

This edition was developed from the **Living Sky v3 source ZIP attached in this conversation**, not an assumed latest remote repository. Its SHA-256 is:

```
3d771201daf5695da60ad7b8d964f2229b8ecbcc13ffd19f4fb03b27c01f46a5
```

`src/layout.js` is byte-for-byte identical to that v3 source. Its SHA-256 in both versions is:

```
30a9096794181a9bc80ccc16e2564dc55ca071dad0d197a1eeb4c248016a0f2c
```

New implementation is concentrated in `src/care.js` and the existing UI, controls, camera, sound, atmosphere and renderer modules. The local review gate and its tests are new. The immutable whole-comment packer, normalized comment boundaries, sample collection and original collector contract remain.

The 360 sample comments are explicitly illustrative, not the recipient’s private Instagram archive. No private source data was available or added. No font binaries, generated background pictures, external sound recordings, advertising, tracking code or remote model calls were added.

The included installer operates on a local folder only when the user runs it. It backs up the old front end first and preserves package/config/collector/private-data files. This delivery does not change the remote GitHub repository and does not publish a site.

All reported tests in VALIDATION.md refer to this edition’s actual executed source/build or explicit disposable test fixtures. Earlier edition reports are not reused as evidence of this build. Browser GPU integration, the recipient’s archive, actual devices and subjective listening remain untested here.
