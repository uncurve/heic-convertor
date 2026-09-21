# Vendored dependencies

Third-party code is committed here rather than loaded from a CDN. A version
number in a CDN URL pins *what you asked for*; it does not pin *what gets
executed*, because the CDN still serves the bytes at request time. Committing
the file removes the CDN from the runtime trust path entirely.

## heic2any 0.0.4

| | |
|---|---|
| File | `heic2any-0.0.4.min.js` |
| Source | `https://registry.npmjs.org/heic2any/-/heic2any-0.0.4.tgz` (`package/dist/heic2any.min.js`) |
| License | MIT — Alex Corvi |
| Upstream | https://github.com/alexcorvi/heic2any |
| Published | 2023-03-29 |
| Vendored | 2026-09-21 |
| SHA-256 (file) | `0963cfa50e9e1e7e6af929a40a81e3e898a673f1270eafa6917dd137e4968164` |
| SHA-384 (SRI) | `sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL` |
| npm tarball SHA-1 | `eddb8e6fec53c8583a6e18b65069bb5e8d19028a` |
| npm integrity | `sha512-3lLnZiDELfabVH87htnRolZ2iehX9zwpRyGNz22GKXIu0fznlblf0/ftppXKNqS26dqFSeqfIBhAmAj/uSp0cA==` |

### How this copy was obtained and checked

1. Downloaded the tarball from the npm registry (not from a CDN mirror).
2. Confirmed the tarball's SHA-1 matches the `dist.shasum` npm publishes in
   its registry metadata.
3. Confirmed the jsDelivr copy previously used by `index.html` was
   byte-identical to the tarball's file, so this vendoring changed no
   executing code.
4. Audited the bundle for runtime network access: it contains **no** absolute
   URLs, no `fetch()` calls, and no live `importScripts` of remote code. The
   `XMLHttpRequest` occurrences are unreached emscripten `createLazyFile`
   boilerplate. This is what lets `index.html` set `connect-src 'none'`.

### Re-verify at any time

```sh
curl -sSo /tmp/h.tgz https://registry.npmjs.org/heic2any/-/heic2any-0.0.4.tgz
shasum /tmp/h.tgz    # expect eddb8e6fec53c8583a6e18b65069bb5e8d19028a
tar xzf /tmp/h.tgz -C /tmp
cmp /tmp/package/dist/heic2any.min.js vendor/heic2any-0.0.4.min.js && echo MATCH
```

### Known caveats

- **0.0.4 is the latest release and is unmaintained** (published 2023, last
  substantive upstream activity well before that). It bundles a compiled
  libheif. If a decoder CVE lands upstream, there is no patched npm release to
  pull — you would need to rebuild it or migrate.
- It is **asm.js, not WebAssembly**, despite the common description. The
  bundle contains no `WebAssembly` references. Earlier copy on the page that
  advertised "WASM" was inaccurate and has been corrected.
- It decodes untrusted image data in the main renderer process (in a Worker,
  but same process). Browser site isolation is the main containment boundary.

### Updating

Replace the file, update every hash in this table, and rename it to carry the
new version so the filename never lies about its contents.
