# Changelog

All notable changes to Booru Enhancer are documented here, based on the project's release history. Dates are as shown on GitHub at the time this changelog was compiled (relative dates such as "last month" have been left as committed rather than converted to exact days, since GitHub only exposes month/day for older entries).

This project aims to follow [Keep a Changelog](https://keepachangelog.com/) conventions going forward.

## [1.2.7] — last month

**Interaction & pagination regression fixes.**

### Fixed
- Moved gallery click/pointer-event delegation from the capture phase to the bubble phase, so Booru Enhancer no longer intercepts thumbnail events before the site's own target-level handlers run. Viewer interception on normal left-clicks is preserved; modifier-key and non-primary clicks remain untouched.
- Hardened Gelbooru-family thumbnail wrapper detection: a candidate wrapper is only accepted if it contains exactly one thumbnail image and its resolved post ID matches the thumbnail's post ID. Prevents generic `[data-id]`/`[data-post-id]` ancestors, or multi-post containers, from being mistaken for a single thumbnail wrapper.
- Removed the hard-coded Gelbooru "+42" pagination fallback. No page size is assumed — pagination is only extrapolated after a real page-size delta has been observed from the site's own pagination controls; otherwise native pagination stays available instead of requesting a guessed URL.
- Reinforced native pagination recovery: native pagination is hidden only after a successful infinite-scroll load, failed requests restore it, and empty/overlapping pages no longer terminate an otherwise-valid pagination chain.
- Reinforced pagination loop protection: previously visited page identities are never requested again, preventing A→B→A and repeated-page loops.

### Improved
- Gelbooru-family interaction handling is considerably more conservative overall.
- Thumbnail wrapper resolution is consistent between initial thumbnails and thumbnails inserted by infinite scroll.
- Viewer/action handling operates from the explicitly enhanced thumbnail wrapper instead of broad ancestor matching.
- Infinite-scroll initialization remains fully idempotent; dynamic gallery settings continue to apply immediately without a page reload.
- Runtime initialization remains resilient — failures in individual stages are isolated and logged instead of blocking the rest of the script.

**Net result:** safer event interception, safer Gelbooru wrapper detection, no fabricated Gelbooru pagination URLs, reliable infinite-scroll recovery, idempotent gallery initialization, stable dynamic grid sizing, correct action handling for dynamically loaded thumbnails, more resilient SPA/AJAX navigation, and better separation between site-native behavior and Booru Enhancer's own behavior.

## [1.2.6] — Gelbooru interaction & gallery layout fixes

### Fixed
- Replaced broad thumbnail wrapper detection (generic `article`/`span`/`div`/`a` ancestors) with adapter-specific `getThumbWrapper()` implementations, preventing the gallery container or unrelated ancestors from being tagged as a thumbnail wrapper.
- Fixed viewer, hover preview, favorite, download, and grid-layout failures that all traced back to incorrect wrapper detection.
- Restricted gallery click/hover delegation to explicitly enhanced `.be-thumb-wrap` elements.
- Fixed hover-preview flickering caused by `pointerout`/`pointerover` transitions between children of the same thumbnail.
- Fixed `gallery.thumbnailSize`, `gallery.gridDensity`, and `gallery.gridGap` settings not actually affecting the grid layout.
- Fixed `compactMode` having no visible CSS effect.
- Fixed `--be-thumbnail-size` being calculated in JS but never applied to the DOM.
- Fixed dynamically inserted infinite-scroll thumbnails not receiving the same action-bar behavior as initial thumbnails.
- Fixed viewer opening being unnecessarily dependent on asynchronous metadata enrichment finishing first.

### Improved
- Added immediate CSS-grid sizing through custom properties, and neutralized conflicting native thumbnail sizing so Booru Enhancer's grid governs layout.
- Added defensive numeric coercion for persisted gallery settings.
- Preserved idempotent infinite-scroll initialization, pagination loop detection, and native paginator restoration from 1.2.5.

## [1.2.5] — Aug 26

**Gallery, pagination & reliability overhaul.**

### Fixed
- Fixed infinite-scroll fallback pagination: a calculated fallback next-page URL was computed but never actually used for the request — it's now correctly passed to the page loader.
- Fixed initial gallery duplicate detection: `loadedPostIds` is now populated from posts already on the page *before* infinite scroll starts, so the first dynamically loaded page can't re-insert already-visible posts.
- Fixed gallery state resets so page-scoped state (pagination, post tracking) resets only when the actual gallery container is replaced — ordinary DOM mutations no longer reset it unnecessarily.
- Fixed duplicate thumbnails during infinite scrolling by checking newly fetched posts against the existing `loadedPostIds` set before insertion.
- Fixed repeated infinite-scroll initialization creating multiple `IntersectionObserver`s, sentinels, or delegated event handlers — especially relevant for SPA navigation, `MutationObserver` updates, and settings changes.
- Fixed repeated infinite-scroll toggling leaving stale observers/sentinels behind; disabling it now correctly disconnects the observer and restores native pagination.
- Fixed pagination loops via pagination-identity tracking — A→B→A loops are detected and stopped automatically, transitioning the loader into a safe exhausted state.
- Fixed gallery-replacement handling during SPA/AJAX navigation so the old gallery's page-scoped state is discarded correctly and the new gallery gets fresh pagination/duplicate-detection state.

### Improved
- More reliable pagination discovery: explicit `rel="next"` and site-specific next-page links are preferred, with additional pagination links inspected as a fallback; generic pagination no longer blindly assumes a universal "+42" page size.
- Safer generic-site pagination: prefers real pagination evidence from the site's own links, can reuse an observed `pid` increment when available, and stops instead of generating arbitrary URLs when pagination can't be determined safely.
- Improved infinite-scroll failure handling — the native paginator is no longer hidden prematurely, and failed/exhausted attempts can restore the site's original pagination controls.
- Added detailed debug logging for infinite-scroll triggers, selected next URLs, pagination identities, page requests, HTTP responses, gallery/thumbnail detection, duplicate filtering, loop detection, and exhaustion conditions.
- Newly inserted thumbnails automatically inherit the existing delegated gallery interactions, removing the need to attach individual listeners per thumbnail.
- Thumbnail clicks are handled through gallery-level event delegation and no longer require waiting for metadata enrichment to finish; metadata continues loading in the background and upgrades the viewer afterward.
- Gallery initialization is now designed to be idempotent — repeated initialization attempts don't duplicate listeners or gallery infrastructure.
- Settings changes can now update the active gallery without recreating the entire gallery system; gallery settings safely control grid layout and infinite-scroll lifecycle.

### Known limitations (as of this release)
- Some older Gelbooru-family installations may still need site-specific pagination handling, since their `pid` page size can vary.
- Generic booru compatibility remains best-effort when a site doesn't expose reliable pagination or post identifiers.

### Compatibility
Tested against: Danbooru, Gelbooru, Safebooru, Rule34, Realbooru, TBIB, Xbooru, HypnoHub, Moebooru-family sites, e621/e926, and generic booru-style sites.

## [1.2.0] — Aug 26

**Runtime repair & feature integration.**

### Added
- Resilient GM API compatibility layer for Violentmonkey, Tampermonkey, and ScriptCat.
- Persistent userscript menu commands: Settings, Enable/Disable, Reset Settings, Debug Mode.
- Configurable thumbnail size and gallery grid spacing, applied live.
- Download controls in the main toolbar; Download/Open Original/Favorite/Close controls in the fullscreen viewer.
- Immediate event delegation for gallery thumbnails.
- Improved infinite-scroll status and retry handling, including HTTP 429 retry with exponential backoff.
- Adapter fallback to the generic booru implementation.

### Fixed
- Fixed the downloader being implemented but never exposed in the UI (missing from both the toolbar and the fullscreen viewer).
- Fixed viewer initialization depending on metadata loading first.
- Fixed thumbnail clicks being handled too late after page load, and gallery hover/click functionality not being immediately available.
- Fixed settings initialization silently failing when storage was unavailable.
- Fixed adapter-detection failures preventing the entire script from starting.
- Fixed gallery grid spacing/thumbnail sizing configuration, and thin thumbnails overflowing their gallery tiles.
- Fixed gallery pagination relying on a single next-page selector, and the Gelbooru-family fallback blindly assuming a fixed page size.
- Improved duplicate-post prevention during infinite scrolling and handling of failed pagination requests.

### Improved
- Reworked startup into a more resilient initialization pipeline, with an in-memory storage fallback when userscript storage fails, safer settings defaults, and explicit startup logging.
- Improved adapter detection/generic fallback, cross-origin networking via the GM API, download-filename generation from metadata templates, original-media discovery, fullscreen viewer behavior, gallery event delegation, responsive layout, infinite-scroll state handling, and network retry behavior.
- Added SPA navigation detection and reinitialization support.

### Gallery settings introduced
`gallery.infiniteScroll`, `gallery.gridDensity`, `gallery.thumbnailSize`, `gallery.gridGap`.

### Downloader
Supports original-quality media (images and video), custom filename templates, `GM_download` with a browser-download fallback, and metadata-based filenames (e.g. `Character - Artist (123456).jpg`).

## [1.1.2] — Aug 26

**Gallery UX & initialization improvements.**

### Fixed
- Fixed gallery interactions taking several seconds to become available after page load, and thumbnail click handling being delayed until metadata finished loading.
- Fixed thumbnails opening in a new tab before the Booru Enhancer viewer was ready.
- Fixed hover-preview initialization being unnecessarily dependent on metadata loading.
- Fixed thin thumbnails overflowing/overlapping adjacent thumbnails; improved thumbnail containment and grid layout stability.
- Fixed missing spacing between gallery thumbnails, and gallery layout settings not applying immediately after being changed.
- Improved gallery-container detection across supported booru layouts, and made dynamically inserted thumbnails interactive immediately.

### Added
- Configurable, live-adjustable thumbnail size (`gallery.thumbnailSize`, 120–500px) and grid gap (`gallery.gridGap`, 0–20px).
- `gallery.gridDensity` (column count) and `gallery.compactMode` (denser layout).
- Event delegation for gallery click/hover interactions.
- More detailed infinite-scroll diagnostics, with separate handling for HTTP errors, login pages, empty responses, and rate limiting, plus HTTP 429 retry with exponential backoff.
- Adapter-aware gallery-container detection.

### Performance
- Gallery interactions no longer wait for metadata enrichment; viewer click handling and hover previews initialize immediately, with metadata enrichment running independently.
- Dynamically loaded thumbnails reuse the same delegated event handlers as the initial gallery, reducing the need to attach per-thumbnail listeners.

> Note from this release: infinite-scroll pagination was still being actively tested across Gelbooru-family implementations at this point, with further site-specific fixes expected (delivered in 1.2.5–1.2.7).

## [1.1.1] — Aug 25

**Infinite scroll & pagination rewrite.**

### Added
- A site-independent pagination API on adapters: `getNextUrl()`, `getPageIdentity()`, `getPostIdentity()`, `calculateNextUrl()`.
- Dedicated pagination support for Gelbooru, Safebooru, Rule34.xxx, Realbooru, TBIB, Xbooru, HypnoHub, Danbooru, Moebooru, e621/e926, and generic booru sites.
- Support for Safebooru/Gelbooru-style next-link selectors (`#paginator a[alt="next"]`, `a[title="next"]`, `a.next`, `a[rel="next"]`).
- PID-based pagination detection and automatic page-size detection for Gelbooru-family sites, with a calculated fallback when no usable next link exists.
- Dynamic infinite-scroll sentinel with status messages ("Loading more…", "Scroll for more…", "No more posts", "Unable to load the next page.") and a Retry button on failure.

### Changed
- Completely rewrote the infinite-scroll implementation, moving pagination logic out of the gallery module and into individual adapters (`adapter.pagination`).
- Pagination state is now held in JavaScript instead of repeatedly reading the live paginator DOM.
- Native pagination controls are hidden via a reversible CSS class instead of directly modifying `style.display`.
- Fetched pages are validated (HTTP status, response body, login/error-page detection) before being inserted into the gallery.
- The next-page URL is extracted before the live DOM is modified; infinite scroll auto-continues while the sentinel stays inside the preload area.
- Fallback URL calculation now preserves existing query parameters (tags, rating, sorting, page, pid, s).

### Fixed
- Fixed Safebooru infinite scroll stopping after the first page (it uses `#paginator a[alt="next"]`, which the previous implementation didn't recognize).
- Fixed pagination logic incorrectly marking a gallery as exhausted when the standard `a[rel="next"]`/`a.next` selectors were unavailable.
- Fixed duplicate page requests, duplicate post insertion across dynamically loaded pages, and pagination state being lost when the site's paginator DOM is replaced.
- Fixed concurrent infinite-scroll requests firing simultaneously, and false "No more posts" states when pagination detection temporarily failed.
- Fixed retry behavior to preserve the exact failed URL, and fixed calculated pagination losing existing query parameters.

### Internal
- Added `loadedPages`, `loadedPostIds`, and `consecutiveEmptyPages` tracking, and explicit `IDLE → LOADING → SUCCESS / ERROR / EXHAUSTED` state handling, exposed via `BE.modules.gallery._scrollState`.
- Added detailed pagination debug logging and safer handling of empty/malformed responses.

Disabling infinite scroll (`gallery.infiniteScroll`) continues to restore the site's native pagination controls after reload.

## [1.1.0] — Aug 25

**Reliability & gallery overhaul.**

### Fixed
- **Settings persistence race:** settings now load only after the GM storage cache finishes initializing, so saved preferences can no longer be overwritten by defaults on startup; added safer handling for async storage operations, plus a storage-version/migration hook for future settings changes (corrupt/unreadable values now fail safely).
- **Gallery thumbnail sizing:** made fully independent of metadata/API requests — grid layout applies immediately on thumbnail discovery, so API failures can no longer leave thumbnails stuck tiny.
- **`gridDensity`/`compactMode`:** grid density now directly drives the gallery's CSS grid columns via `--be-grid-columns`/`--be-thumb-gap` custom properties, applying live without a page reload.
- **Gelbooru-family API failures:** added a multi-stage metadata retrieval strategy — same-origin `fetch()` with session credentials → `GM_xmlhttpRequest` fallback → rendered post-page HTML scraping — so API outages, auth restrictions, or CSP issues no longer disable metadata enrichment. HTML fallback requests use bounded concurrency and gentle pacing.
- **Silent toolbar/keybind failures:** actions requiring a selected post now give visible toast feedback; bulk download/reverse-search actions no longer fail silently.
- **Settings-page consistency:** the settings toolbar is now available consistently across gallery, search, index, post, and pool pages; settings that need a reload are explicitly marked "Reload required."

### Improved
- Separated visual thumbnail processing from metadata enrichment into distinct stages, so browsing keeps working even when metadata APIs are unavailable.
- Centralized `GM_xmlhttpRequest` wrapper with Promise-based requests, retry/backoff, and better `GM_*`/`GM.*` API compatibility.
- Added lightweight, auto-dismissing toast notifications for non-blocking feedback.
- Gelbooru-family adapters now tolerate markup differences between Gelbooru clones, with improved post-ID detection across multiple thumbnail markup patterns.

### Architecture (as of this release)
| Module | Responsibility |
|---|---|
| `BE.core` | Lifecycle and adapter/module registry |
| `BE.store` | Persistent storage |
| `BE.settings` | Typed configuration |
| `BE.bus` | Event bus |
| `BE.net` | Network layer |
| `BE.adapters.*` | Site/engine adapters |
| `BE.modules.*` | Independent feature modules |

This release resolved the major issues from the 1.0.x line: settings-persistence race, storage-initialization race, tiny thumbnails after API failure, broken grid-density behavior, Gelbooru API-failure handling, missing HTML fallback, silent toolbar actions, inconsistent settings access, missing reload-required feedback, and version-string consistency.

**Deliberately out of scope** at this point (extension points exist, but unimplemented): cloud sync, tag analytics, ML tag suggestions, duplicate finder, local download database, external plugin loader, full i18n/theme system, command-palette UI.

## [1.0.1] — Jul 20

Changed namespace and version.

## [1.0.0] — Jul 20

Initial release.

[1.2.7]: https://github.com/itachi-re/booru-enhnace
[1.2.6]: https://github.com/itachi-re/booru-enhnace
[1.2.5]: https://github.com/itachi-re/booru-enhnace
[1.2.0]: https://github.com/itachi-re/booru-enhnace
[1.1.2]: https://github.com/itachi-re/booru-enhnace
[1.1.1]: https://github.com/itachi-re/booru-enhnace
[1.1.0]: https://github.com/itachi-re/booru-enhnace
[1.0.1]: https://github.com/itachi-re/booru-enhnace
[1.0.0]: https://github.com/itachi-re/booru-enhnace
