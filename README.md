# Booru Enhancer

A modular userscript that upgrades the browsing experience on Danbooru-, Gelbooru-, and
Moebooru-family imageboards: original-quality media loading, one-click downloads with smart
naming, a fullscreen viewer, tag tools, blacklist filtering, infinite scroll, reverse image
search, and a proper settings panel.

## Install

1. Install a userscript manager: **Violentmonkey** (primary target), Tampermonkey, or ScriptCat.
2. Create a new script and paste in `booru-enhancer.user.js`, or point your manager at the raw
   file URL if you're hosting it (GitHub raw, a Gist, etc.) — the `@match` list will pick it up
   automatically.
3. Visit any supported site. A small toolbar appears bottom-right by default; click the gear
   icon to open Settings.

## Supported sites out of the box

| Engine family | Sites | Data source |
|---|---|---|
| Danbooru | danbooru.donmai.us, atfbooru.ninja | `/posts/:id.json` API |
| Gelbooru 0.2 clones | gelbooru.com, safebooru.org, rule34.xxx, realbooru.com, tbib.org, xbooru.com, hypnohub.net | `dapi` JSON API |
| Moebooru | yande.re, konachan.com/.net, lolibooru.moe | `/post.json` API |
| e621 | e621.net, e926.net | `/posts.json` API |
| Generic fallback | Sankaku, rule34.us, and anything else | DOM heuristics |

Adding a new site that already speaks one of the four APIs above is a config-only change (see
"Extending" below). Anything else gets the generic DOM adapter automatically — no site will be
left completely unsupported, just with reduced metadata.

## Architecture

Everything lives under a single global `window.BE` namespace, split into independent layers:

```
BE.bus         event bus (pub/sub) — modules never call each other directly
BE.store       persisted key/value storage (GM_setValue, sync-cached)
BE.settings    typed, categorized config schema; settings UI renders itself from it
BE.net         Promise wrapper around GM_xmlhttpRequest with retry/backoff
BE.dom         DOM helpers (create/qs/qsa/debounce/throttle/IntersectionObserver helper)
BE.adapters    per-engine adapters, normalizing every post into one `Post` shape
BE.modules.*   feature modules: mediaLoader, downloader, naming, viewer, tagTools,
               imageInfo, reverseSearch, sourceLinks, filters, favorites, gallery,
               keybinds, ui, settingsPanel
```

Every module reads only `BE.settings` and `BE.bus`; nothing reaches into another module's
internals. That's what makes each feature independently toggleable and lets new modules bolt on
without touching existing code.

### Why API-first instead of scraping the DOM?

Danbooru, e621, and the Gelbooru/Moebooru engines all expose stable, documented JSON endpoints.
Adapters hit those directly for post metadata (tags, dimensions, md5, score, rating, source),
which is far less fragile than parsing markup that changes with every theme update. DOM access
is still used for two things only: finding *where* a post's `<img>` sits (to enrich it) and, for
engines with no public API (Sankaku, rule34.us), building the best `Post` object it can straight
from what's rendered.

## Extending

**Add a new engine adapter:**

```js
BE.core.registerAdapter({
  id: 'my-engine',
  hostPattern: /myboorusite\.com$/,
  priority: 10,
  isPostPage: () => /* ... */,
  getPostId: () => /* ... */,
  getThumbElements: () => document.querySelectorAll('img.preview'),
  getThumbPostId: (img) => /* ... */,
  async fetchPost(id) { /* return a Post via emptyPost({...}) */ },
  async fetchThumbBatch(ids) { /* return Post[] */ },
  favoriteSelector: '.fav-button',
  gridContainerSelector: '#posts',
});
```

**Add a new feature module:** subscribe to `BE.bus` events (`post:loaded`, `media:swapped`,
`download:*`, `favorite:changed`, `viewer:*`, `gallery:*`, `settings:changed`) and read/write
`BE.settings`. Register any new options by adding entries to `BE.settings.SCHEMA` — the settings
panel picks them up automatically, no UI code required.

**Add a new setting:** add one entry to `BE.settings.SCHEMA` with a category, type
(`bool`/`select`/`color`/`range`/`number`/`text`/`textarea`), default, and label.

## Deliberately not implemented yet

The spec's "Future Features" list (cloud sync, tag analytics, ML tag suggestions, a duplicate
finder, a local download database/statistics, a full plugin loader, custom themes beyond
light/dark, i18n, offline caching) is intentionally **architecture-only** right now:

- `BE.core.registerModule`-style registration (via `BE.bus` + `BE.settings.SCHEMA`) already *is*
  the plugin API — it just needs an external loader (`@require`) pointed at a module file.
- `BE.store` already namespaces keys per host, so a download database or dedup index is a new
  module away, not a redesign.
- Theming is centralized in one CSS block using custom properties (`--be-accent`, `--be-bg`,
  etc.) and a single `data-be-theme` attribute, so more themes are a CSS-only addition.

Building these out fully was out of scope here — the goal was a solid, working core plus an
architecture that doesn't need to be reworked to add them later.

## Known limitations

- **Favorites** re-use the site's own favorite button (so your existing session/auth handles it)
  rather than reimplementing every engine's CSRF-protected favorite API; a local list mirrors the
  state for instant UI feedback across sessions.
- **Sankaku and rule34.us** run on the generic DOM-fallback adapter since they don't expose a
  public, stable JSON API — metadata there is best-effort.
- Infinite scroll works by fetching the next paginated URL and splicing its post grid into the
  current page; it depends on each engine having a `rel="next"`/`.next` pagination link, which all
  supported engines do.
