# Security notes

This is a static, fully client-side page. There is no server, no account, and
no data store, so the attack surface is narrow: the HEIC file the user picks,
and the code the page executes.

## Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| User's photos | Exfiltration to a third party | `connect-src 'none'` — the page cannot make a network request after load |
| The page itself | Malicious dependency shipped via CDN | Dependencies are vendored and hash-verified; no CDN at runtime |
| The DOM | XSS via a crafted filename | Filenames and error strings go through `textContent` / DOM properties only |
| The user's IP | Leaked to a CDN on every visit | No third-party origins are contacted at all |

## Supply chain

Nothing is fetched from a third party at runtime. Tailwind's CDN build was
removed outright (it was loaded from an *unversioned* URL, so any change
upstream would have executed immediately in every visitor's browser) and
replaced with hand-written CSS. `heic2any` is committed under `vendor/` with
its hashes recorded in `vendor/README.md`, verified against the npm registry's
own published integrity value.

If you ever move a dependency back to a CDN, pin the exact version **and** add
a Subresource Integrity hash — a version pin alone does not constrain the
bytes the CDN returns:

```html
<script src="https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js"
        integrity="sha384-OTofQ0MEeiSgh62havBcemCIK0gqj809wX6UA0uPISNMRnR6NZyCdGzX3SbLrgwL"
        crossorigin="anonymous"></script>
```

Self-hosting remains strictly stronger: SRI still leaks the visitor's IP and
`Referer` to the CDN, which contradicts the page's privacy claim.

## Content Security Policy

The policy lives in a `<meta>` tag in `index.html` so it survives being copied
to any static host. Two caveats:

1. **`frame-ancestors` is ignored in a meta CSP.** To stop clickjacking you
   must send it as a real response header. On GitHub Pages you cannot set
   headers; use Cloudflare Pages/Netlify/a reverse proxy if you need it.
2. **Serve over HTTP(S), not `file://`.** `'self'` does not resolve usefully
   for a `file://` origin, so the policy will block the scripts. For local
   use: `python3 -m http.server 8000`.

Recommended response headers where you can set them:

```
Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-eval' blob:; worker-src blob:; child-src blob:; style-src 'self'; img-src 'self' blob: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
```

### Why `'unsafe-eval'` is present

It is not optional here. `heic2any`'s emscripten build of libheif calls
`new Function()` to generate embind bindings, and creates its decode Worker
from a `blob:` URL. Removing `'unsafe-eval'` or `blob:` breaks conversion. The
only way to drop it is to replace the library — the browser-native
`ImageDecoder` API does not support HEIC outside Safari, so there is no drop-in
alternative today.

This is a real residual risk: `'unsafe-eval'` weakens the CSP's value as an
XSS backstop. It is mitigated, not eliminated, by the fact that the app writes
no untrusted data into HTML sinks (see below) and cannot reach the network.

## Untrusted input

A filename is attacker-controlled. A file named

```
x"><img src=x onerror=alert(document.domain)>.heic
```

is legal on macOS and Linux and can be sent to someone as an attachment. The
previous version interpolated `file.name` and the library's error string into
an `innerHTML` template, which executed it. All such values now go through
`textContent` or property assignment (`el.title = ...`, `a.download = ...`).

When editing `app.js`, do not reintroduce `innerHTML` with interpolation. The
DOM-building helpers at the top of the file exist to make the safe path the
convenient one.

## Residual risks

- **Unmaintained decoder.** `heic2any` 0.0.4 bundles a compiled libheif with
  no upstream release channel. A memory-safety bug in libheif reachable from a
  crafted HEIC would be exploitable here with no patch available. Browser
  sandboxing and site isolation are the containment boundary.
- **No input size limit.** A very large or malformed file can exhaust memory
  and hang the tab. It is a local denial of service against the user's own
  browser only.

## Reporting

Open an issue, or for anything you would rather not file publicly, contact the
repository owner directly.
