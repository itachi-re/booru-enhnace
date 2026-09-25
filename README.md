# Booru Enhancer

A single-file userscript that adds a consistent set of quality-of-life tools on top of Danbooru, Gelbooru, Moebooru, and e621-style booru sites: original-quality media loading, smart downloads, a fullscreen viewer, tag tooling, blacklist filtering, infinite scroll, and reverse image search — all behind one settings panel.

> Install via [Tampermonkey](https://www.tampermonkey.net/), [Violentmonkey](https://violentmonkey.github.io/), or any compatible userscript manager.

## Supported sites

| Engine | Supported sites |
|---|---|
| Danbooru | `danbooru.donmai.us`, `atfbooru.ninja`, and other `*.donmai.us` instances |
| Gelbooru family | `gelbooru.com`, `safebooru.org`, `rule34.xxx`, `rule34.us`, `realbooru.com`, `tbib.org`, `xbooru.com`, `hypnohub.net` |
| Moebooru | `konachan.com`, `konachan.net`, `yande.re`, `lolibooru.moe` |
| e621 | `e621.net`, `e926.net` |
| Sankaku | `chan.sankakucomplex.com`, `idol.sankakucomplex.com`, `beta.sankakucomplex.com` |
| Generic fallback | Any other page — best-effort thumbnail/pagination detection, no site-specific assumptions |

Each engine has its own adapter (post-ID resolution, thumbnail selectors, pagination detection, and API/HTML fetching). Unrecognized sites fall back to a generic adapter rather than failing outright.

## Features

- **Original-quality media** — loads full-resolution images/video in place of compressed samples. Configurable per page (`always` / `post-page only` / `on-click` / `disabled`), with an option to never upscale past native resolution.
- **Smart downloads** — customizable filename templates (e.g. `{character} - {artist} ({id})`), configurable tag delimiter and max character count in the filename, with automatic retries on failed downloads.
- **Fullscreen viewer** — keyboard-driven post viewer with configurable fit mode, video autoplay/loop/mute, and remembered volume between videos.
- **Infinite scroll** — replaces native pagination with a intersection-observer-based loader. Tracks already-seen post IDs to avoid duplicate loads, detects pagination loops (A→B→A or repeated identical pages) and stops instead of looping forever, and restores the native paginator automatically if a page load fails.
- **Tag tools** — colorizes tags by category, shows post counts, and collapses long tag lists above a configurable threshold.
- **Blacklist/whitelist filtering** — hide posts by tag (supports `rating:*` and `-tag` negation syntax), plus filters for videos, animated images, minimum resolution, and AI-generated content.
- **Hover preview** — preview a post without leaving the gallery grid.
- **Reverse image search** — one-click lookup via SauceNAO.
- **Configurable grid layout** — adjustable thumbnail size, grid density/columns, and gap spacing, with a compact mode.
- **Keybinds** — download, favorite, open original, toggle viewer, next/prev post, close viewer, play/pause video — all rebindable.
- **SPA-navigation aware** — sites that swap content via `pushState`/AJAX (Danbooru, e621) are detected via a patched History API plus a `MutationObserver` fallback; the toolbar and post action bar refresh without duplicating UI, and gallery state (loaded post IDs, pagination identity) resets only on genuine navigation, not incidental DOM mutations.
- **Resilient bootstrap** — every init stage (settings, adapter detection, UI, gallery binding, metadata enrichment, infinite scroll) is isolated in a `safeStage()` wrapper, so a failure in one module is logged and skipped rather than breaking the whole script.
- **Settings panel + menu commands** — full settings UI, plus userscript-manager menu entries for toggling the script, resetting settings, and enabling debug logging.

## Installation

1. Install a userscript manager (Tampermonkey or Violentmonkey recommended).
2. Install [`booru-enhancer.user.js`](./booru-enhancer.user.js) — your manager should prompt automatically when opening the raw file.
3. Visit any supported site. Open the settings panel from the on-page toolbar or your userscript manager's menu (**Booru Enhancer: Settings**).

## Configuration

All settings are grouped by category in the in-page settings panel:

| Category | Covers |
|---|---|
| General | Enable/disable per site, theme, accent color, toolbar position |
| Media | Original-media load mode, upscale prevention, hover preview, thumbnail quality |
| Downloads | Filename template, tag delimiter, max characters, retry attempts, open-original behavior |
| Viewer | Autoplay/loop/mute, remembered volume, fit mode |
| Gallery | Infinite scroll, grid density, thumbnail size, grid gap, compact mode |
| Tags | Colorization, post counts, collapse threshold |
| Filters | Blacklist/whitelist, hide videos/animations, minimum resolution, AI-generated filter |
| Keybinds | All keyboard shortcuts |
| Debug | Verbose console logging |

Settings are stored in the userscript manager's per-script storage via `GM_setValue`/`GM_getValue`, namespaced under `be:setting:*`. They persist across browser sessions; whether they sync between devices depends on your userscript manager's own storage/sync configuration.

## Privacy & network requests

Booru Enhancer runs entirely client-side inside your userscript manager. It has no remote backend and does not send your browsing data anywhere the author controls.

Depending on which features are active, the script may make requests to:

- The current booru site, for post/gallery data and media
- SauceNAO, for reverse image search
- Any other domain listed in the script's `@connect` metadata

Some features (e.g. favoriting) act through your existing logged-in session on the current site — the script never collects or transmits your credentials. If you want to audit exactly what it can reach, check the `@connect` block at the top of `booru-enhancer.user.js` alongside the source.

## Known limitations

- `keys.commandPalette` appears in the settings schema (default `Ctrl+K`) but isn't wired up to any handler yet — reserved for a future command palette feature.
- `iqdb.org` is declared under `@connect` but reverse image search currently only calls SauceNAO; IQDB support isn't implemented.
- Metadata enrichment and infinite scroll depend on each adapter's ability to detect the gallery container and pagination controls — a site redesign upstream can require an adapter update.

## Debugging

Enable **Booru Enhancer: Toggle Debug Mode** from the userscript menu (or `debug.verboseLogging` in settings) for detailed console logging around initialization, adapter detection, pagination identity, and infinite-scroll loop detection. All log lines are prefixed `[Booru Enhancer]`.

## Contributing

Site adapters are self-contained (`BE.core.registerAdapter({...})`) and only need to implement post-ID resolution, thumbnail selectors, a gallery container selector, `fetchPost`/`fetchThumbBatch`, and pagination handling. PRs adding adapters for other booru engines are welcome.

## License

MIT © [itachi-re](https://github.com/itachi-re)
