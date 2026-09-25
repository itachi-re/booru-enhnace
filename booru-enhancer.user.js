// ==UserScript==
// @name         Booru Enhancer
// @namespace    https://sleazyfork.org/en/scripts/587810-booru-enhancer
// @version      1.1.2
// @description  Modular enhancement suite for Danbooru/Gelbooru/Moebooru-family booru sites — original-quality media, smart downloads, fullscreen viewer, tag tools, blacklist filtering, infinite scroll, reverse image search, and more.
// @author       itachi-re
// @license      MIT
// @match        *://danbooru.donmai.us/*
// @match        *://*.donmai.us/*
// @match        *://atfbooru.ninja/*
// @match        *://gelbooru.com/*
// @match        *://safebooru.org/*
// @match        *://rule34.xxx/*
// @match        *://rule34.us/*
// @match        *://realbooru.com/*
// @match        *://tbib.org/*
// @match        *://xbooru.com/*
// @match        *://hypnohub.net/*
// @match        *://konachan.com/*
// @match        *://konachan.net/*
// @match        *://yande.re/*
// @match        *://lolibooru.moe/*
// @match        *://e621.net/*
// @match        *://e926.net/*
// @match        *://chan.sankakucomplex.com/*
// @match        *://idol.sankakucomplex.com/*
// @match        *://beta.sankakucomplex.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_info
// @connect      donmai.us
// @connect      atfbooru.ninja
// @connect      gelbooru.com
// @connect      safebooru.org
// @connect      rule34.xxx
// @connect      rule34.us
// @connect      realbooru.com
// @connect      tbib.org
// @connect      xbooru.com
// @connect      hypnohub.net
// @connect      konachan.com
// @connect      konachan.net
// @connect      yande.re
// @connect      lolibooru.moe
// @connect      e621.net
// @connect      e926.net
// @connect      sankakucomplex.com
// @connect      sankakuapi.com
// @connect      saucenao.com
// @connect      iqdb.org
// @run-at       document-end
// @noframes
// ==/UserScript==

/**
 * =============================================================================
 *  BOORU ENHANCER  —  v1.1.2
 * =============================================================================
 *  CHANGELOG (1.1.1 → 1.1.2)
 *  --------------------------
 *  - Fixed initialization bottleneck: UI, viewer, hover, and grid layout now
 *    apply IMMEDIATELY without waiting for API metadata.
 *  - Added event delegation for click and hover interactions. No more attaching
 *    listeners to individual thumbnails after metadata loads.
 *  - Added `gallery.thumbnailSize` (120px - 500px range). Controls grid sizing
 *    via CSS `minmax()` instead of `transform: scale()`.
 *  - Added `gallery.gridGap` (0px - 20px range). Controls CSS grid `gap`.
 *  - Fixed thin thumbnails overlapping by adding `aspect-ratio` and
 *    `object-fit: contain` to thumbnail wrappers.
 *  - Infinite scroll heavily instrumented with verbose debug logging. Catches
 *    HTTP 429, login redirects, and empty pages distinctly.
 *  - 429 Rate Limit handling: exponential backoff with visible retry state.
 *  - Inserted infinite-scroll thumbnails become interactive immediately.
 *  - Adapter-aware gallery container detection (`getGalleryContainer`).
 * =============================================================================
 */
(function booruEnhancer() {
	'use strict';

	if (window.top !== window.self) return;
	if (window.__BOORU_ENHANCER_LOADED__) return;
	window.__BOORU_ENHANCER_LOADED__ = true;

	const BE = (window.BE = window.BE || {});
	BE.VERSION = '1.1.2';

	/* ============================================================ *
	 *  EVENT BUS
	 * ============================================================ */
	BE.bus = (() => {
		const listeners = new Map();
		return {
			on(evt, fn) {
				if (!listeners.has(evt)) listeners.set(evt, new Set());
				listeners.get(evt).add(fn);
				return () => listeners.get(evt)?.delete(fn);
			},
			once(evt, fn) {
				const off = this.on(evt, (p) => { off(); fn(p); });
				return off;
			},
			emit(evt, payload) {
				const set = listeners.get(evt);
				if (!set) return;
				for (const fn of [...set]) {
					try { fn(payload); } catch (err) { BE.log.error(`[bus:${evt}]`, err); }
				}
			},
		};
	})();

	/* ============================================================ *
	 *  LOGGER
	 * ============================================================ */
	BE.log = (() => {
		const PREFIX = '%c[Booru Enhancer]';
		const STYLE = 'color:#ff8ac6;font-weight:bold';
		const enabled = () => BE.settings?.get('debug.verboseLogging') ?? false;
		return {
			debug: (...a) => enabled() && console.debug(PREFIX, STYLE, ...a),
			  info: (...a) => console.info(PREFIX, STYLE, ...a),
			  warn: (...a) => console.warn(PREFIX, STYLE, ...a),
			  error: (...a) => console.error(PREFIX, STYLE, ...a),
		};
	})();

	/* ============================================================ *
	 *  GM SHIM
	 * ============================================================ */
	const _GM = {
		getValue: (typeof GM_getValue === 'function') ? GM_getValue : (k, d) => GM.getValue(k, d),
 setValue: (typeof GM_setValue === 'function') ? GM_setValue : (k, v) => GM.setValue(k, v),
 deleteValue: (typeof GM_deleteValue === 'function') ? GM_deleteValue : (k) => GM.deleteValue(k),
 listValues: (typeof GM_listValues === 'function') ? GM_listValues : () => GM.listValues(),
 xhr: (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : (opts) => GM.xmlHttpRequest(opts),
 download: (typeof GM_download === 'function') ? GM_download : (opts) => GM.download(opts),
 addStyle: (typeof GM_addStyle === 'function') ? GM_addStyle : (css) => {
	 const s = document.createElement('style');
	 s.textContent = css;
	 document.head.appendChild(s);
	 return s;
 },
 notification: (typeof GM_notification === 'function') ? GM_notification : (opts) => {
	 try { new Notification(opts.title || 'Booru Enhancer', { body: opts.text }); } catch { /* noop */ }
 },
 registerMenuCommand: (typeof GM_registerMenuCommand === 'function') ? GM_registerMenuCommand : () => {},
	};
	BE.gm = _GM;

	/* ============================================================ *
	 *  DOM UTILITIES
	 * ============================================================ */
	BE.dom = {
		qs: (sel, root = document) => root.querySelector(sel),
 qsa: (sel, root = document) => Array.from(root.querySelectorAll(sel)),

 create(tag, attrs = {}, children = []) {
	 const el = document.createElement(tag);
	 for (const [k, v] of Object.entries(attrs)) {
		 if (k === 'class') el.className = v;
		 else if (k === 'html') el.innerHTML = v;
		 else if (k === 'text') el.textContent = v;
		 else if (k === 'dataset') Object.assign(el.dataset, v);
		 else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
		 else if (v !== null && v !== undefined) el.setAttribute(k, v);
	 }
	 for (const c of [].concat(children)) {
		 if (c === null || c === undefined) continue;
		 el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	 }
	 return el;
 },

 debounce(fn, ms = 150) {
	 let t;
	 return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
 },

 throttle(fn, ms = 150) {
	 let last = 0, timer = null;
	 return (...args) => {
		 const now = Date.now();
		 if (now - last >= ms) { last = now; fn(...args); }
		 else {
			 clearTimeout(timer);
			 timer = setTimeout(() => { last = Date.now(); fn(...args); }, ms - (now - last));
		 }
	 };
 },

 ready(fn) {
	 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
	 else fn();
 },

 onVisible(el, fn, opts = { rootMargin: '600px 0px' }) {
	 const io = new IntersectionObserver((entries) => {
		 for (const e of entries) if (e.isIntersecting) { fn(el); io.unobserve(el); }
	 }, opts);
	 io.observe(el);
	 return () => io.unobserve(el);
 },

 sanitizeFilename(name, maxLen = 180) {
	 return String(name)
	 .replace(/[/\\?%*:|"<>]/g, '_')
	 .replace(/\s+/g, ' ')
	 .trim()
	 .slice(0, maxLen) || 'untitled';
 },

 formatBytes(bytes) {
	 if (!bytes && bytes !== 0) return '?';
	 const units = ['B', 'KB', 'MB', 'GB'];
	 let i = 0, n = bytes;
	 while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
	 return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
 },
	};

	/* ============================================================ *
	 *  STORAGE
	 * ============================================================ */
	BE.store = (() => {
		const NS = 'be:';
		const cache = new Map();
		let ready = false;
		const readyCallbacks = [];

		function safeParse(raw) {
			if (raw === undefined || raw === null) return { ok: false };
			if (typeof raw !== 'string') return { ok: true, value: raw };
			try { return { ok: true, value: JSON.parse(raw) }; }
			catch { return { ok: false }; }
		}

		async function init() {
			try {
				const keys = await _GM.listValues();
				await Promise.all((keys || []).filter((k) => typeof k === 'string' && k.startsWith(NS)).map(async (k) => {
					let raw;
					try { raw = await _GM.getValue(k); } catch (err) { BE.log.error('store.get failed for', k, err); return; }
					const parsed = safeParse(raw);
					if (parsed.ok) cache.set(k.slice(NS.length), parsed.value);
				}));
			} catch (err) { BE.log.error('store init failed', err); }
			ready = true;
			readyCallbacks.splice(0).forEach((cb) => cb());
		}

		return {
			whenReady(cb) { ready ? cb() : readyCallbacks.push(cb); },
				get isReady() { return ready; },
				get(key, fallback) { return cache.has(key) ? cache.get(key) : fallback; },
				set(key, value) {
					cache.set(key, value);
					Promise.resolve(_GM.setValue(NS + key, JSON.stringify(value))).catch((e) => {
						BE.log.error('store.set failed to persist', key, e);
					});
				},
				delete(key) {
					cache.delete(key);
					Promise.resolve(_GM.deleteValue(NS + key)).catch(() => {});
				},
				keys(prefix = '') { return [...cache.keys()].filter((k) => k.startsWith(prefix)); },
				_init: init,
		};
	})();
	BE.store._init();

	/* ============================================================ *
	 *  SETTINGS SCHEMA
	 * ============================================================ */
	BE.settings = (() => {
		const SCHEMA = {
			'general.enabled': { cat: 'General', type: 'bool', def: true, label: 'Enable Booru Enhancer on this site' },
			'general.theme': { cat: 'General', type: 'select', def: 'dark', choices: ['dark', 'light'], label: 'Theme' },
			'general.accentColor': { cat: 'General', type: 'color', def: '#ff8ac6', label: 'Accent color' },
			'general.toolbarPosition': { cat: 'General', type: 'select', def: 'bottom-right', choices: ['bottom-right', 'bottom-left', 'top-right', 'top-left'], label: 'Toolbar position' },

			'media.mode': { cat: 'Media', type: 'select', def: 'post-page', choices: ['always', 'post-page', 'on-click', 'disabled'], label: 'Load original media' },
			'media.neverUpscale': { cat: 'Media', type: 'bool', def: true, label: 'Never upscale beyond native resolution' },
			'media.hoverPreview': { cat: 'Media', type: 'bool', def: true, label: 'Hover preview on thumbnails' },
			'media.thumbQuality': { cat: 'Media', type: 'select', def: 'sample', choices: ['preview', 'sample', 'original'], label: 'Grid thumbnail quality' },

			'download.filenameTemplate': { cat: 'Downloads', type: 'text', def: '{character} - {artist} ({id})', label: 'Filename template' },
				   'download.maxCharacters': { cat: 'Downloads', type: 'number', def: 3, min: 1, max: 10, label: 'Max characters in filename' },
				   'download.tagDelimiter': { cat: 'Downloads', type: 'text', def: ', ', label: 'Tag delimiter' },
				   'download.retries': { cat: 'Downloads', type: 'number', def: 3, min: 0, max: 10, label: 'Retry attempts on failure' },
				   'download.openMode': { cat: 'Downloads', type: 'select', def: 'new-tab', choices: ['new-tab', 'background-tab', 'popup', 'browser-viewer'], label: '"Open original" behavior' },

				   'viewer.enabled': { cat: 'Viewer', type: 'bool', def: true, label: 'Enable fullscreen viewer' },
				   'viewer.autoplayVideo': { cat: 'Viewer', type: 'bool', def: true, label: 'Autoplay videos/animations' },
				   'viewer.loopVideo': { cat: 'Viewer', type: 'bool', def: true, label: 'Loop videos' },
				   'viewer.muteVideo': { cat: 'Viewer', type: 'bool', def: true, label: 'Start videos muted' },
				   'viewer.rememberVolume': { cat: 'Viewer', type: 'bool', def: true, label: 'Remember volume between videos' },
				   'viewer.fitMode': { cat: 'Viewer', type: 'select', def: 'fit-both', choices: ['fit-both', 'fit-width', 'fit-height', 'original-size'], label: 'Default fit mode' },

				   'gallery.infiniteScroll': { cat: 'Gallery', type: 'bool', def: true, label: 'Infinite scrolling (replaces pagination)' },
				   'gallery.gridDensity': { cat: 'Gallery', type: 'range', def: 0, min: 0, max: 10, label: 'Grid columns (0 = auto-fit by size)' },
				   'gallery.thumbnailSize': { cat: 'Gallery', type: 'range', def: 220, min: 120, max: 500, label: 'Thumbnail size (px)' },
				   'gallery.gridGap': { cat: 'Gallery', type: 'range', def: 8, min: 0, max: 20, label: 'Grid gap (px)' },
				   'gallery.compactMode': { cat: 'Gallery', type: 'bool', def: false, label: 'Compact mode' },

				   'tags.colorize': { cat: 'Tags', type: 'bool', def: true, label: 'Colorize tags by category' },
				   'tags.showCounts': { cat: 'Tags', type: 'bool', def: true, label: 'Show tag post counts' },
				   'tags.collapseThreshold': { cat: 'Tags', type: 'number', def: 25, min: 5, max: 200, label: 'Collapse tag list above N tags' },

				   'filter.blacklist': { cat: 'Filters', type: 'textarea', def: '', label: 'Blacklisted tags (one per line, supports rating:*, -tag)' },
				   'filter.whitelist': { cat: 'Filters', type: 'textarea', def: '', label: 'Whitelist overrides (one per line)' },
				   'filter.hideVideos': { cat: 'Filters', type: 'bool', def: false, label: 'Hide videos' },
				   'filter.hideAnimations': { cat: 'Filters', type: 'bool', def: false, label: 'Hide animated images/GIFs' },
				   'filter.minResolution': { cat: 'Filters', type: 'number', def: 0, min: 0, max: 10000, label: 'Hide posts below width (px), 0 = off' },
				   'filter.hideAIGenerated': { cat: 'Filters', type: 'bool', def: false, label: 'Hide posts tagged ai-generated' },

				   'keys.download': { cat: 'Keybinds', type: 'text', def: 'd', label: 'Download' },
				   'keys.favorite': { cat: 'Keybinds', type: 'text', def: 'f', label: 'Favorite' },
				   'keys.openOriginal': { cat: 'Keybinds', type: 'text', def: 'o', label: 'Open original (new tab)' },
				   'keys.viewOriginal': { cat: 'Keybinds', type: 'text', def: 'v', label: 'Toggle viewer' },
				   'keys.next': { cat: 'Keybinds', type: 'text', def: 'ArrowRight', label: 'Next post' },
				   'keys.prev': { cat: 'Keybinds', type: 'text', def: 'ArrowLeft', label: 'Previous post' },
				   'keys.close': { cat: 'Keybinds', type: 'text', def: 'Escape', label: 'Close viewer' },
				   'keys.playPause': { cat: 'Keybinds', type: 'text', def: ' ', label: 'Play/pause video' },
				   'keys.commandPalette': { cat: 'Keybinds', type: 'text', def: 'k', label: 'Command palette (needs Ctrl)' },

				   'debug.verboseLogging': { cat: 'Debug', type: 'bool', def: false, label: 'Verbose console logging' },
		};

		const values = new Map();
		let loaded = false;

		function keyDefault(key) { return SCHEMA[key]?.def; }

		function load() {
			for (const key of Object.keys(SCHEMA)) {
				const stored = BE.store.get('setting:' + key);
				values.set(key, stored !== undefined ? stored : keyDefault(key));
			}
			loaded = true;
		}

		return {
			SCHEMA,
			get isLoaded() { return loaded; },
				   get(key) {
					   if (!loaded) {
						   BE.log.debug('settings.get() called before load — returning default for', key);
						   return keyDefault(key);
					   }
					   return values.has(key) ? values.get(key) : keyDefault(key);
				   },
				   set(key, val) {
					   values.set(key, val);
					   BE.store.set('setting:' + key, val);
					   BE.bus.emit('settings:changed', { key, val });
				   },
				   reset(key) {
					   const def = keyDefault(key);
					   this.set(key, def);
					   return def;
				   },
				   resetAll() { for (const key of Object.keys(SCHEMA)) this.reset(key); },
				   categories() {
					   const set = [];
					   for (const def of Object.values(SCHEMA)) if (!set.includes(def.cat)) set.push(def.cat);
					   return set;
				   },
				   byCategory(cat) { return Object.entries(SCHEMA).filter(([, d]) => d.cat === cat).map(([k]) => k); },
				   exportJSON() {
					   const out = {};
					   for (const key of Object.keys(SCHEMA)) out[key] = this.get(key);
					   return JSON.stringify({ __booruEnhancerSettings: true, version: BE.VERSION, values: out }, null, 2);
				   },
				   importJSON(json) {
					   try {
						   const parsed = JSON.parse(json);
						   const values_ = parsed.values || parsed;
						   for (const [key, val] of Object.entries(values_)) {
							   if (SCHEMA[key] !== undefined) this.set(key, val);
						   }
						   return true;
					   } catch (err) {
						   BE.log.error('settings import failed', err);
						   return false;
					   }
				   },
				   blacklistTags() {
					   return String(this.get('filter.blacklist')).split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean);
				   },
				   whitelistTags() {
					   return String(this.get('filter.whitelist')).split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean);
				   },
				   _load: load,
		};
	})();

	/* ============================================================ *
	 *  NETWORK
	 * ============================================================ */
	BE.net = {
		request(opts, retries = 0) {
			return new Promise((resolve, reject) => {
				const attempt = (n) => {
					_GM.xhr({
						method: 'GET',
						...opts,
						onload: (res) => {
							if (res.status >= 200 && res.status < 300) {
								resolve(res);
							} else if (res.status === 429) {
								const delay = Math.pow(2, (retries - n + 1)) * 1000;
								BE.log.warn(`[Gallery] 429 Rate limit. Retrying in ${delay/1000}s...`);
								if (n > 0) {
									setTimeout(() => attempt(n - 1), delay);
								} else {
									reject(new Error(`HTTP 429 Rate limit exceeded for ${opts.url}`));
								}
							} else if (n > 0) {
								setTimeout(() => attempt(n - 1), 400 * (retries - n + 1));
							} else {
								reject(new Error(`HTTP ${res.status} for ${opts.url}`));
							}
						},
						onerror: (err) => (n > 0 ? setTimeout(() => attempt(n - 1), 400 * (retries - n + 1)) : reject(err)),
							ontimeout: (err) => (n > 0 ? setTimeout(() => attempt(n - 1), 400 * (retries - n + 1)) : reject(err))
					});
				};
				attempt(retries);
			});
		},
 async json(url, opts = {}) {
	 const res = await this.request({ url, headers: { Accept: 'application/json', ...(opts.headers || {}) }, ...opts }, opts.retries ?? 2);
	 return JSON.parse(res.responseText);
 }
	};

	/* ============================================================ *
	 *  POST MODEL
	 * ============================================================ */
	function emptyPost(overrides = {}) {
		return {
			id: '', originalUrl: '', sampleUrl: '', previewUrl: '', mediaType: 'unknown',
 width: 0, height: 0, fileSize: 0, md5: '', rating: 'unknown', score: 0, favCount: 0,
 artists: [], characters: [], copyrights: [], generalTags: [], metaTags: [], allTags: [],
 source: '', postUrl: location.href, createdAt: '', siteId: '', ...overrides,
		};
	}

	function guessMediaType(url) {
		if (!url) return 'unknown';
		const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
		if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
		if (ext === 'gif') return 'gif';
		if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) return 'image';
		return 'unknown';
	}

	/* ============================================================ *
	 *  ADAPTER REGISTRY
	 * ============================================================ */
	BE.adapters = { registry: [], active: null };

	BE.core = BE.core || {};
	BE.core.registerAdapter = function registerAdapter(adapter) {
		BE.adapters.registry.push({ priority: 0, ...adapter });
	};

	BE.core.detectAdapter = function detectAdapter() {
		const candidates = BE.adapters.registry
		.filter((a) => a.hostPattern.test(location.hostname))
		.sort((a, b) => b.priority - a.priority);
		return candidates[0] || BE.adapters.registry.find((a) => a.id === 'generic');
	};

	/* ============================================================ *
	 *  PAGINATION HELPER UTILITIES
	 * ============================================================ */

	function safeURL(href, base = location.href) {
		try { return new URL(href, base); } catch { return null; }
	}

	function findFirstNextLink(doc, selectors) {
		for (const sel of selectors) {
			try {
				const link = doc.querySelector(sel);
				if (link && link.href) return link;
			} catch { /* invalid selector for this doc type */ }
		}
		return null;
	}

	function findAdvancingPidLink(doc, paramName, currentVal) {
		const links = Array.from(doc.querySelectorAll(`a[href*="${paramName}="]`));
		const candidates = [];
		for (const a of links) {
			const u = safeURL(a.href);
			if (!u) continue;
			const val = parseInt(u.searchParams.get(paramName) || '0', 10);
			if (!isNaN(val) && val > currentVal) candidates.push({ href: a.href, val });
		}
		if (!candidates.length) return null;
		candidates.sort((a, b) => a.val - b.val);
		return candidates[0].href;
	}

	/* ============================================================ *
	 *  DANBOORU ADAPTER
	 * ============================================================ */
	BE.core.registerAdapter({
		id: 'danbooru',
		hostPattern: /donmai\.us$|atfbooru\.ninja$/,
		priority: 10,
		isPostPage: () => /\/posts\/\d+/.test(location.pathname),
							getPostId: () => (location.pathname.match(/\/posts\/(\d+)/) || [])[1] || null,
							getThumbElements: (root) => BE.dom.qsa('article[id^="post_"] img, .post-preview img', root),
							getThumbPostId: (img) => {
								const art = img.closest('[id^="post_"]') || img.closest('a[href*="/posts/"]');
								const idAttr = art?.id?.match(/post_(\d+)/)?.[1];
								if (idAttr) return idAttr;
								const href = art?.getAttribute?.('href') || img.closest('a')?.getAttribute('href') || '';
								return (href.match(/\/posts\/(\d+)/) || [])[1] || null;
							},
							getGalleryContainer: (root = document) => root.querySelector('#posts-container, .posts-container, #post-list'),
							async fetchPost(id) {
								const data = await BE.net.json(`${location.origin}/posts/${id}.json`);
								return normalizeDanbooru(data);
							},
							async fetchThumbBatch(ids) {
								if (!ids.length) return [];
								const tags = `id:${ids.join(',')}`;
								const data = await BE.net.json(`${location.origin}/posts.json?tags=${encodeURIComponent(tags)}&limit=${ids.length}`);
								return data.map(normalizeDanbooru);
							},
							favoriteSelector: 'a#post-favorite-link, button[data-post-id] .favorite, .post-vote-favorite-count',
							pagination: {
								containerSelectors: ['.paginator', '#paginator', 'nav.pagination', 'section#paginating-nav'],
								getPageIdentity(url) {
									const u = safeURL(url);
									if (!u) return '1';
									return u.searchParams.get('page') || '1';
								},
								getNextUrl(doc) {
									const link = findFirstNextLink(doc, [
										'a[rel="next"]', 'a.next', 'a.next_page',
										'.paginator a[rel="next"]', 'nav.pagination a[rel="next"]',
										'section#paginating-nav a[rel="next"]',
									]);
									return link?.href || null;
								},
								calculateNextUrl(currentUrl) {
									const u = safeURL(currentUrl);
									if (!u) return null;
									const page = parseInt(u.searchParams.get('page') || '1', 10);
									u.searchParams.set('page', String(page + 1));
									return u.toString();
								},
								getPostIdentity(el) {
									const art = el.closest('[id^="post_"], article.post-preview');
									return art?.id?.match(/post_(\d+)/)?.[1] || null;
								},
							},
	});

	function normalizeDanbooru(d) {
		const original = d.file_url || d.large_file_url || '';
		return emptyPost({
			id: String(d.id),
						 originalUrl: original,
						 sampleUrl: d.large_file_url || original,
						 previewUrl: d.preview_file_url || d.large_file_url || original,
						 mediaType: d.is_video ? 'video' : (guessMediaType(original) === 'unknown' ? guessMediaType(d.preview_file_url) : guessMediaType(original)),
						 width: d.image_width || 0,
						 height: d.image_height || 0,
						 fileSize: d.file_size || 0,
						 md5: d.md5 || '',
						 rating: { s: 'safe', q: 'questionable', e: 'explicit', g: 'safe' }[d.rating] || d.rating || 'unknown',
						 score: d.score || 0,
						 favCount: d.fav_count || 0,
						 artists: (d.tag_string_artist || '').split(' ').filter(Boolean),
						 characters: (d.tag_string_character || '').split(' ').filter(Boolean),
						 copyrights: (d.tag_string_copyright || '').split(' ').filter(Boolean),
						 generalTags: (d.tag_string_general || '').split(' ').filter(Boolean),
						 metaTags: (d.tag_string_meta || '').split(' ').filter(Boolean),
						 allTags: (d.tag_string || '').split(' ').filter(Boolean),
						 source: d.source || '',
						 postUrl: `${location.origin}/posts/${d.id}`,
						 createdAt: d.created_at || '',
						 siteId: 'danbooru',
		});
	}

	/* ============================================================ *
	 *  GELBOORU-FAMILY ADAPTER
	 * ============================================================ */
	function gelbooruPostId(el) {
		const a = el.closest('a');
		const href = a?.getAttribute('href') || '';
		const byHref = href.match(/[?&]id=(\d+)/);
		if (byHref) return byHref[1];
		const byAnchorId = a?.id?.match(/^p(\d+)$/);
		if (byAnchorId) return byAnchorId[1];
		const wrapper = el.closest('[data-id], [data-post-id]');
		if (wrapper) return wrapper.dataset.id || wrapper.dataset.postId;
		const byImgId = el.id?.match(/\d+/);
		return byImgId ? byImgId[0] : null;
	}

	let _gelbooruObservedPageSize = null;

	BE.core.registerAdapter({
		id: 'gelbooru-family',
		hostPattern: /gelbooru\.com$|safebooru\.org$|rule34\.xxx$|realbooru\.com$|tbib\.org$|xbooru\.com$|hypnohub\.net$/,
		priority: 10,
		isPostPage: () => {
			const p = new URLSearchParams(location.search);
			return p.get('page') === 'post' && p.get('s') === 'view';
		},
		getPostId: () => new URLSearchParams(location.search).get('id'),
							getThumbElements: (root) => BE.dom.qsa(
								'.thumbnail-preview img, article.thumbnail-preview img, span.thumb img, #post-list img.preview, #post-list-posts img, .thumb img',
								root,
							),
							getThumbPostId: (img) => gelbooruPostId(img),
							getGalleryContainer: (root = document) => root.querySelector('#post-list-posts, #post-list, .content'),
							async fetchPost(id) {
								try {
									const posts = await gelbooruApiFetch([id]);
									if (posts[0]) return posts[0];
								} catch (err) {
									BE.log.warn('gelbooru: dapi fetchPost failed, falling back to HTML parse', err);
								}
								return gelbooruFetchPostHTML(id);
							},
							async fetchThumbBatch(ids) {
								if (!ids.length) return [];
								try {
									const results = await gelbooruApiFetch(ids);
									if (results.length) return results;
								} catch (err) {
									BE.log.warn('gelbooru: dapi batch fetch failed, falling back to HTML parsing', err);
								}
								return gelbooruFetchPostsHTMLBounded(ids, 3);
							},
							favoriteSelector: 'a[href*="s=favorite"], #favorite-button',
							pagination: {
								containerSelectors: ['#paginator', '.pagination', '.pagination-controls'],
								getPageIdentity(url) {
									const u = safeURL(url);
									if (!u) return '0';
									const pid = u.searchParams.get('pid') || '0';
									const tags = u.searchParams.get('tags') || '';
									const s = u.searchParams.get('s') || '';
									return `${tags}|${s}|${pid}`;
								},
								getNextUrl(doc) {
									const nextLink = findFirstNextLink(doc, [
										'#paginator a[alt="next"]', '#paginator a[title="next"]', '#paginator a.next',
										'.pagination a[alt="next"]', '.pagination a[title="next"]', '.pagination a.next',
										'a[alt="next"]', 'a[rel="next"]', 'a.next',
									]);
									if (nextLink) {
										const currentPid = parseInt(this.getPageIdentity(location.href).split('|').pop() || '0', 10) || 0;
										const nextPid = parseInt(this.getPageIdentity(nextLink.href).split('|').pop() || '0', 10) || 0;
										if (nextPid > currentPid && nextPid - currentPid <= 200) {
											_gelbooruObservedPageSize = nextPid - currentPid;
										}
										return nextLink.href;
									}

									const currentPidStr = this.getPageIdentity(location.href).split('|').pop() || '0';
									const currentPid = parseInt(currentPidStr, 10) || 0;
									const advancingHref = findAdvancingPidLink(doc, 'pid', currentPid);
									if (advancingHref) {
										const advPid = parseInt(safeURL(advancingHref)?.searchParams.get('pid') || '0', 10) || 0;
										if (advPid > currentPid && advPid - currentPid <= 200) {
											_gelbooruObservedPageSize = advPid - currentPid;
										}
										return advancingHref;
									}

									return null;
								},
								calculateNextUrl(currentUrl) {
									const u = safeURL(currentUrl);
									if (!u) return null;
									const currentPid = parseInt(u.searchParams.get('pid') || '0', 10) || 0;
									const pageSize = _gelbooruObservedPageSize || 42;
									u.searchParams.set('pid', String(currentPid + pageSize));
									return u.toString();
								},
								getPostIdentity(el) {
									return gelbooruPostId(el);
								},
							},
	});

	let _gelbooruApiHealthy = true;

	async function gelbooruApiFetch(ids) {
		const url = `${location.origin}/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent('id:' + ids.join(','))}&limit=${ids.length}`;
		let data;
		try {
			const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			data = await res.json();
			_gelbooruApiHealthy = true;
		} catch (fetchErr) {
			BE.log.debug('gelbooru: same-origin fetch failed, trying GM.xhr', fetchErr);
			data = await BE.net.json(url, { retries: 1 });
			_gelbooruApiHealthy = true;
		}
		const list = Array.isArray(data) ? data : (data?.post || []);
		if (!Array.isArray(list) || !list.length) return [];
		return list.map(normalizeGelbooru);
	}

	async function gelbooruFetchPostHTML(id) {
		try {
			const url = `${location.origin}/index.php?page=post&s=view&id=${id}`;
			const res = await BE.net.request({ url }, 1);
			return parseGelbooruPostHTML(res.responseText, id);
		} catch (err) {
			BE.log.warn(`gelbooru: HTML fallback failed for post ${id}`, err);
			return null;
		}
	}

	async function gelbooruFetchPostsHTMLBounded(ids, concurrency = 3) {
		const results = [];
		let i = 0;
		async function worker() {
			while (i < ids.length) {
				const id = ids[i++];
				const post = await gelbooruFetchPostHTML(id);
				if (post) results.push(post);
				await new Promise((r) => setTimeout(r, 150));
			}
		}
		await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
		return results;
	}

	function parseGelbooruPostHTML(html, id) {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const img = doc.querySelector('#image, img#image');
		const video = doc.querySelector('video source, video#gelcomVideoPlayer source, video');
		const originalLink = doc.querySelector('a.download-link, a[download], li a[href*="/samples/"], li a[href*="/images/"]');
		const original = video?.getAttribute('src') || originalLink?.getAttribute('href') || img?.getAttribute('src') || '';
		const sample = img?.getAttribute('src') || original;
		const tagLinks = Array.from(doc.querySelectorAll('.tag-list li, #tag-sidebar li, li[class*="tag-type-"]'));
		const tags = [];
		const artists = [], characters = [], copyrights = [];
		for (const li of tagLinks) {
			const a = li.querySelector('a[href*="tags="]') || li.querySelector('a');
			const text = (a?.textContent || '').trim().replace(/\s+/g, '_').toLowerCase();
			if (!text) continue;
			tags.push(text);
			const cls = li.className || '';
			if (/tag-type-artist|category-1/.test(cls)) artists.push(text);
			else if (/tag-type-character|category-4/.test(cls)) characters.push(text);
			else if (/tag-type-copyright|category-3/.test(cls)) copyrights.push(text);
		}
		const ratingText = (doc.querySelector('[id*="rating"]')?.textContent || '').toLowerCase();
		const rating = ratingText.includes('explicit') ? 'explicit' : ratingText.includes('question') ? 'questionable' : ratingText.includes('safe') ? 'safe' : 'unknown';
		const dims = (img?.getAttribute('data-original-width') && img?.getAttribute('data-original-height'))
		? { w: Number(img.getAttribute('data-original-width')), h: Number(img.getAttribute('data-original-height')) }
		: { w: img?.naturalWidth || 0, h: img?.naturalHeight || 0 };

		if (!original && !tags.length) return null;

		return emptyPost({
			id: String(id),
						 originalUrl: original,
						 sampleUrl: sample,
						 previewUrl: sample,
						 mediaType: video ? 'video' : guessMediaType(original),
						 width: dims.w,
						 height: dims.h,
						 rating,
						 artists, characters, copyrights,
						 generalTags: tags,
						 allTags: tags,
						 postUrl: `${location.origin}/index.php?page=post&s=view&id=${id}`,
						 siteId: 'gelbooru-family',
		});
	}

	function normalizeGelbooru(d) {
		const original = d.file_url || '';
		return emptyPost({
			id: String(d.id),
						 originalUrl: original,
						 sampleUrl: d.sample_url || original,
						 previewUrl: d.preview_url || d.sample_url || original,
						 mediaType: guessMediaType(original),
						 width: d.width || 0,
						 height: d.height || 0,
						 fileSize: d.file_size || 0,
						 md5: d.md5 || '',
						 rating: d.rating || 'unknown',
						 score: Number(d.score) || 0,
						 favCount: 0,
						 artists: [], characters: [], copyrights: [],
						 generalTags: String(d.tags || '').split(' ').filter(Boolean),
						 metaTags: [],
						 allTags: String(d.tags || '').split(' ').filter(Boolean),
						 source: d.source || '',
						 postUrl: `${location.origin}/index.php?page=post&s=view&id=${d.id}`,
						 createdAt: d.created_at || '',
						 siteId: 'gelbooru-family',
		});
	}

	/* ============================================================ *
	 *  MOEBOORU ADAPTER
	 * ============================================================ */
	BE.core.registerAdapter({
		id: 'moebooru',
		hostPattern: /yande\.re$|konachan\.(com|net)$|lolibooru\.moe$/,
							priority: 10,
							isPostPage: () => /\/post\/show\/\d+/.test(location.pathname),
							getPostId: () => (location.pathname.match(/\/post\/show\/(\d+)/) || [])[1] || null,
							getThumbElements: (root) => BE.dom.qsa('a.thumb img, ul#post-list-posts img.preview, .post-preview img', root),
							getThumbPostId: (img) => {
								const a = img.closest('a');
								const href = a?.getAttribute('href') || '';
								return (href.match(/\/post\/show\/(\d+)/) || [])[1] || null;
							},
							getGalleryContainer: (root = document) => root.querySelector('#post-list-posts, #post-list, .content'),
							async fetchPost(id) {
								const data = await BE.net.json(`${location.origin}/post.json?tags=id:${id}`);
								return data[0] ? normalizeMoebooru(data[0]) : null;
							},
							async fetchThumbBatch(ids) {
								if (!ids.length) return [];
								const tags = `id:${ids.join(',')}`;
								const data = await BE.net.json(`${location.origin}/post.json?tags=${encodeURIComponent(tags)}&limit=${ids.length}`);
								return data.map(normalizeMoebooru);
							},
							favoriteSelector: 'a.favorite-button-fav, #post-vote-fav-link',
							pagination: {
								containerSelectors: ['.pagination', '#paginator', '.pagination-controls'],
								getPageIdentity(url) {
									const u = safeURL(url);
									if (!u) return '1';
									return u.searchParams.get('page') || '1';
								},
								getNextUrl(doc) {
									const link = findFirstNextLink(doc, [
										'a.next_page', 'a[rel="next"]', 'a.next',
										'.pagination a.next_page', '.pagination a[rel="next"]',
									]);
									return link?.href || null;
								},
								calculateNextUrl(currentUrl) {
									const u = safeURL(currentUrl);
									if (!u) return null;
									const page = parseInt(u.searchParams.get('page') || '1', 10);
									u.searchParams.set('page', String(page + 1));
									return u.toString();
								},
								getPostIdentity(el) {
									const a = el.closest('a');
									const href = a?.getAttribute('href') || '';
									return (href.match(/\/post\/show\/(\d+)/) || [])[1] || null;
								},
							},
	});

	function normalizeMoebooru(d) {
		const original = d.file_url || '';
		return emptyPost({
			id: String(d.id),
						 originalUrl: original,
						 sampleUrl: d.sample_url || original,
						 previewUrl: d.preview_url || original,
						 mediaType: guessMediaType(original),
						 width: d.width || 0,
						 height: d.height || 0,
						 fileSize: d.file_size || 0,
						 md5: d.md5 || '',
						 rating: { s: 'safe', q: 'questionable', e: 'explicit' }[d.rating] || 'unknown',
						 score: d.score || 0,
						 favCount: d.fav_count || 0,
						 artists: [], characters: [], copyrights: [],
						 generalTags: String(d.tags || '').split(' ').filter(Boolean),
						 metaTags: [],
						 allTags: String(d.tags || '').split(' ').filter(Boolean),
						 source: d.source || '',
						 postUrl: `${location.origin}/post/show/${d.id}`,
						 createdAt: d.created_at ? new Date(d.created_at * 1000).toISOString() : '',
						 siteId: 'moebooru',
		});
	}

	/* ============================================================ *
	 *  E621 / E926 ADAPTER
	 * ============================================================ */
	BE.core.registerAdapter({
		id: 'e621',
		hostPattern: /e621\.net$|e926\.net$/,
		priority: 10,
		isPostPage: () => /\/posts\/\d+/.test(location.pathname),
							getPostId: () => (location.pathname.match(/\/posts\/(\d+)/) || [])[1] || null,
							getThumbElements: (root) => BE.dom.qsa('article.post-preview img, #posts-container img', root),
							getThumbPostId: (img) => {
								const art = img.closest('article[id^="post_"]');
								return art?.id?.match(/post_(\d+)/)?.[1] || (img.closest('a')?.getAttribute('href')?.match(/\/posts\/(\d+)/) || [])[1] || null;
							},
							getGalleryContainer: (root = document) => root.querySelector('#posts-container, .posts-container'),
							async fetchPost(id) {
								const data = await BE.net.json(`${location.origin}/posts/${id}.json`, {
									headers: { 'User-Agent': `BooruEnhancer/${BE.VERSION} (userscript)` },
								});
								return data.post ? normalizeE621(data.post) : null;
							},
							async fetchThumbBatch(ids) {
								if (!ids.length) return [];
								const tags = `id:${ids.join(',')}`;
								const data = await BE.net.json(`${location.origin}/posts.json?tags=${encodeURIComponent(tags)}&limit=${ids.length}`, {
									headers: { 'User-Agent': `BooruEnhancer/${BE.VERSION} (userscript)` },
								});
								return (data.posts || []).map(normalizeE621);
							},
							favoriteSelector: '#add-to-favorites, #remove-from-favorites',
							pagination: {
								containerSelectors: ['#paginator', 'nav.paginator', 'section#paginating-nav'],
								getPageIdentity(url) {
									const u = safeURL(url);
									if (!u) return '1';
									return u.searchParams.get('page') || u.searchParams.get('b') || u.searchParams.get('a') || '1';
								},
								getNextUrl(doc) {
									const link = findFirstNextLink(doc, [
										'a[rel="next"]', 'a.next',
										'#paginator a[rel="next"]', 'nav.paginator a[rel="next"]',
										'section#paginating-nav a[rel="next"]',
									]);
									return link?.href || null;
								},
								calculateNextUrl(currentUrl) {
									const u = safeURL(currentUrl);
									if (!u) return null;
									if (u.searchParams.has('b') || u.searchParams.has('a')) return null;
									const page = parseInt(u.searchParams.get('page') || '1', 10);
									u.searchParams.set('page', String(page + 1));
									return u.toString();
								},
								getPostIdentity(el) {
									const art = el.closest('article[id^="post_"]');
									return art?.id?.match(/post_(\d+)/)?.[1] || null;
								},
							},
	});

	function normalizeE621(p) {
		const original = p.file?.url || '';
		return emptyPost({
			id: String(p.id),
						 originalUrl: original,
						 sampleUrl: p.sample?.url || original,
						 previewUrl: p.preview?.url || original,
						 mediaType: p.file?.ext === 'webm' || p.file?.ext === 'mp4' ? 'video' : (p.file?.ext === 'gif' ? 'gif' : 'image'),
						 width: p.file?.width || 0,
						 height: p.file?.height || 0,
						 fileSize: p.file?.size || 0,
						 md5: p.file?.md5 || '',
						 rating: { s: 'safe', q: 'questionable', e: 'explicit' }[p.rating] || 'unknown',
						 score: p.score?.total ?? 0,
						 favCount: p.fav_count || 0,
						 artists: p.tags?.artist || [],
						 characters: p.tags?.character || [],
						 copyrights: p.tags?.copyright || [],
						 generalTags: p.tags?.general || [],
						 metaTags: p.tags?.meta || [],
						 allTags: Object.values(p.tags || {}).flat(),
						 source: (p.sources || [])[0] || '',
						 postUrl: `${location.origin}/posts/${p.id}`,
						 createdAt: p.created_at || '',
						 siteId: 'e621',
		});
	}

	/* ============================================================ *
	 *  GENERIC ADAPTER
	 * ============================================================ */
	BE.core.registerAdapter({
		id: 'generic',
		hostPattern: /.*/,
		priority: -1,
		isPostPage: () => !!BE.dom.qs('#image, #main_image, .image-container img, main img.post-image'),
							getPostId: () => (location.pathname.match(/(\d{3,})/) || [])[1] || location.href,
							getThumbElements: (root) => BE.dom.qsa('img.preview, img.thumb, .thumbnail img, .post-thumbnail img', root),
							getThumbPostId: (img) => {
								const a = img.closest('a');
								const href = a?.getAttribute('href') || '';
								return (href.match(/(\d{3,})/) || [])[0] || href || null;
							},
							getGalleryContainer: (root = document) => root.querySelector('.content, #post-list, body'),
							async fetchPost() {
								const img = BE.dom.qs('#image, #main_image, .image-container img, main img.post-image');
								const video = BE.dom.qs('video source, video');
								const original = video?.src || video?.currentSrc || img?.src || '';
								return emptyPost({
									id: this.getPostId(),
												 originalUrl: original,
												 sampleUrl: original,
												 previewUrl: img?.src || original,
												 mediaType: video ? 'video' : guessMediaType(original),
												 width: img?.naturalWidth || 0,
												 height: img?.naturalHeight || 0,
												 allTags: BE.dom.qsa('a[href*="tags="], .tag-link, li.tag a').map((a) => a.textContent.trim()).filter(Boolean),
												 postUrl: location.href,
												 siteId: 'generic',
								});
							},
							async fetchThumbBatch() { return []; },
							favoriteSelector: 'a[href*="favorite" i], button[class*="favorite" i]',
							pagination: {
								containerSelectors: ['.pagination', '#paginator', '.pagination-controls', 'nav.paginator'],
						 getPageIdentity(url) {
							 const u = safeURL(url);
							 if (!u) return '1';
							 return u.searchParams.get('pid') || u.searchParams.get('page') || '1';
						 },
						 getNextUrl(doc) {
							 const link = findFirstNextLink(doc, [
								 'a[rel="next"]', 'a.next',
								 'a[aria-label*="next" i]', 'a[title*="next" i]',
								 '.pagination a[rel="next"]', '#paginator a[rel="next"]',
							 ]);
							 if (link) return link.href;
							 const currentPid = parseInt(this.getPageIdentity(location.href), 10) || 0;
							 if (currentPid > 0 || location.href.includes('pid=')) {
								 const adv = findAdvancingPidLink(doc, 'pid', currentPid);
								 if (adv) return adv;
							 }
							 const currentPage = parseInt(safeURL(location.href)?.searchParams.get('page') || '1', 10) || 1;
							 const pageLinks = Array.from(doc.querySelectorAll('a[href*="page="]'));
							 const candidates = [];
							 for (const a of pageLinks) {
								 const u = safeURL(a.href);
								 if (!u) continue;
								 const pg = parseInt(u.searchParams.get('page') || '1', 10);
								 if (!isNaN(pg) && pg > currentPage) candidates.push({ href: a.href, pg });
							 }
							 if (candidates.length) {
								 candidates.sort((a, b) => a.pg - b.pg);
								 return candidates[0].href;
							 }
							 return null;
						 },
						 calculateNextUrl(currentUrl) {
							 const u = safeURL(currentUrl);
							 if (!u) return null;
							 if (u.searchParams.has('pid')) {
								 const pid = parseInt(u.searchParams.get('pid'), 10) || 0;
								 u.searchParams.set('pid', String(pid + 42));
								 return u.toString();
							 }
							 if (u.searchParams.has('page')) {
								 const page = parseInt(u.searchParams.get('page'), 10) || 1;
								 u.searchParams.set('page', String(page + 1));
								 return u.toString();
							 }
							 return null;
						 },
						 getPostIdentity(el) {
							 const a = el.closest('a');
							 const href = a?.getAttribute('href') || '';
							 return (href.match(/(\d{3,})/) || [])[0] || href || null;
						 },
							},
	});

	/* ============================================================ *
	 *  NAMING
	 * ============================================================ */
	BE.naming = {
		build(post) {
			const tpl = BE.settings.get('download.filenameTemplate') || '{id}';
			const delim = BE.settings.get('download.tagDelimiter') || ', ';
			const maxChars = BE.settings.get('download.maxCharacters') || 3;

			const charList = post.characters.length
			? post.characters.slice(0, maxChars).map(prettyTag)
			: ['Unknown Character'];

			const fields = {
				character: charList.join(delim),
 artist: (post.artists.length ? post.artists.map(prettyTag) : ['Unknown Artist']).join(delim),
 copyright: (post.copyrights.length ? post.copyrights.map(prettyTag) : ['Unknown Copyright']).join(delim),
 id: post.id,
 md5: post.md5 || post.id,
 rating: post.rating,
 score: String(post.score),
 resolution: post.width && post.height ? `${post.width}x${post.height}` : '',
 date: post.createdAt ? post.createdAt.slice(0, 10) : '',
			};

			let name = tpl.replace(/\{(\w+)\}/g, (_, key) => (fields[key] !== undefined ? fields[key] : ''));
			name = name.replace(/\s{2,}/g, ' ').replace(/^[\s\-,]+|[\s\-,]+$/g, '');
			if (!name) name = post.id || 'download';
			return BE.dom.sanitizeFilename(name);
		},
 extensionFor(post) {
	 const url = post.originalUrl || post.sampleUrl || '';
	 const m = url.split('?')[0].match(/\.([a-z0-9]+)$/i);
	 return m ? m[1] : (post.mediaType === 'video' ? 'mp4' : 'jpg');
 },
	};
	function prettyTag(tag) {
		return tag.replace(/_/g, ' ').replace(/\s+\(.*?\)$/, '').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	/* ============================================================ *
	 *  DOWNLOADER
	 * ============================================================ */
	BE.modules = BE.modules || {};
	BE.modules.downloader = (() => {
		async function downloadPost(post) {
			if (!post || !post.originalUrl) {
				BE.log.warn('Download failed: no original URL');
				return;
			}
			const filename = BE.naming.build(post) + '.' + BE.naming.extensionFor(post);
			_GM.download({ url: post.originalUrl, name: filename, saveAs: true });
		}
		return { downloadPost };
	})();

	/* ============================================================ *
	 *  HOVER PREVIEW
	 * ============================================================ */
	BE.modules.hover = (() => {
		let hoverEl = null;

		function init() {
			hoverEl = document.createElement('div');
			hoverEl.id = 'be-hover-preview';
			hoverEl.style.cssText = 'position:fixed; pointer-events:none; z-index:999999; display:none; max-width:400px; max-height:400px; border:2px solid var(--be-accent, #ff8ac6); background:#000;';
			document.body.appendChild(hoverEl);
		}

		function show(img) {
			if (!hoverEl) init();
			hoverEl.innerHTML = '';
			const preview = new Image();
			preview.src = img.src;
			preview.style.cssText = 'width:100%; height:100%; object-fit:contain;';
			hoverEl.appendChild(preview);

			const rect = img.getBoundingClientRect();
			let left = rect.right + 10;
			if (left + 400 > window.innerWidth) left = rect.left - 410;
			hoverEl.style.left = `${left}px`;
			hoverEl.style.top = `${rect.top}px`;
			hoverEl.style.display = 'block';
		}

		function hide() {
			if (hoverEl) hoverEl.style.display = 'none';
		}

		return { show, hide };
	})();

	/* ============================================================ *
	 *  VIEWER
	 * ============================================================ */
	BE.modules.viewer = (() => {
		let overlay = null;
		let currentPost = null;

		function init() {
			overlay = document.createElement('div');
			overlay.id = 'be-viewer-overlay';
			overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.9); z-index:999998; display:none; align-items:center; justify-content:center;';
			overlay.addEventListener('click', close);
			document.body.appendChild(overlay);

			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && overlay.style.display === 'flex') close();
			});
		}

		function open(post) {
			if (!overlay) init();
			currentPost = post;
			overlay.innerHTML = '';

			const container = document.createElement('div');
			container.style.cssText = 'max-width:90vw; max-height:90vh; display:flex; align-items:center; justify-content:center;';

			const img = document.createElement('img');
			img.src = post.sampleUrl || post.previewUrl;
			img.style.cssText = 'max-width:90vw; max-height:90vh; object-fit:contain;';
			container.appendChild(img);

			overlay.appendChild(container);
			overlay.style.display = 'flex';
		}

		function updatePost(post) {
			if (!currentPost || currentPost.id !== post.id) return;
			currentPost = post;
			const img = overlay.querySelector('img');
			if (img && post.originalUrl) {
				img.src = post.originalUrl;
			}
		}

		function close() {
			if (overlay) overlay.style.display = 'none';
			currentPost = null;
		}

		return { open, updatePost, close };
	})();

	/* ============================================================ *
	 *  GALLERY MODULE
	 * ============================================================ */
	BE.modules.gallery = (() => {
		let galleryContainer = null;
		let scrollObserver = null;
		let nextPageUrl = null;
		const loadedPostIds = new Set();
		let state = 'IDLE';
		let retryTimer = null;

		function init(container) {
			galleryContainer = container;
			galleryContainer.classList.add('be-gallery-grid');

			// Event Delegation
			galleryContainer.addEventListener('click', onGalleryClick, true);
			galleryContainer.addEventListener('pointerover', onGalleryHover, true);
			galleryContainer.addEventListener('pointerout', onGalleryHoverEnd, true);

			applyGridSettings();
			BE.bus.on('settings:changed', ({ key }) => {
				if (key.startsWith('gallery.') || key === 'general.theme' || key === 'general.accentColor') {
					applyGridSettings();
				}
			});

			enhanceThumbnails(galleryContainer);
		}

		function applyGridSettings() {
			if (!galleryContainer) return;
			const cols = BE.settings.get('gallery.gridDensity') || 0;
			const thumbSize = BE.settings.get('gallery.thumbnailSize') || 220;
			const gap = BE.settings.get('gallery.gridGap') ?? 8;
			const compact = BE.settings.get('gallery.compactMode');

			if (cols > 0) {
				galleryContainer.style.setProperty('--be-grid-template', `repeat(${cols}, minmax(0, 1fr))`);
			} else {
				galleryContainer.style.setProperty('--be-grid-template', `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`);
			}
			galleryContainer.style.setProperty('--be-grid-gap', `${gap}px`);
			galleryContainer.classList.toggle('be-compact-mode', compact);
		}

		function enhanceThumbnails(root) {
			const thumbs = BE.adapters.active.getThumbElements(root);
			for (const img of thumbs) {
				const wrap = img.closest('article, span, div, a') || img.parentElement;
				if (wrap) wrap.classList.add('be-thumb-wrap');
				img.classList.add('be-thumb-img');

				const postId = BE.adapters.active.getThumbPostId(img);
				if (postId) {
					img.dataset.bePostId = postId;
					loadedPostIds.add(postId);
				}
			}
		}

		function onGalleryClick(e) {
			const thumb = e.target.closest('.be-thumb-wrap, article, span.thumb, a.thumb, .post-preview');
			if (!thumb) return;

			const img = thumb.matches('img') ? thumb : thumb.querySelector('img');
			if (!img) return;

			e.preventDefault();
			e.stopPropagation();

			const postId = img.dataset.bePostId || BE.adapters.active.getThumbPostId(img);
			if (!postId) return;

			const previewUrl = img.src || img.dataset.src;
			const postUrl = thumb.closest('a')?.href || location.href;

			const minimalPost = emptyPost({
				id: postId,
				previewUrl: previewUrl,
				sampleUrl: previewUrl,
				postUrl: postUrl
			});

			BE.modules.viewer.open(minimalPost);

			enrichSinglePost(postId).then(fullPost => {
				if (fullPost) BE.modules.viewer.updatePost(fullPost);
			}).catch(err => BE.log.error('enrichment failed', err));
		}

		function onGalleryHover(e) {
			if (!BE.settings.get('media.hoverPreview')) return;
			const thumb = e.target.closest('.be-thumb-wrap, article, span.thumb, a.thumb, .post-preview');
			if (!thumb) return;
			const img = thumb.matches('img') ? thumb : thumb.querySelector('img');
			if (img) BE.modules.hover.show(img);
		}

		function onGalleryHoverEnd() {
			if (!BE.settings.get('media.hoverPreview')) return;
			BE.modules.hover.hide();
		}

		async function enrichSinglePost(postId) {
			try {
				return await BE.adapters.active.fetchPost(postId);
			} catch {
				return null;
			}
		}

		function enrichThumbnails() {
			// Background metadata enrichment logic can go here
		}

		function setupInfiniteScroll() {
			if (scrollObserver) scrollObserver.disconnect();

			const sentinel = document.createElement('div');
			sentinel.id = 'be-infinite-scroll-sentinel';
			sentinel.style.height = '10px';
			galleryContainer.parentNode.insertBefore(sentinel, galleryContainer.nextSibling);

			scrollObserver = new IntersectionObserver((entries) => {
				if (entries[0].isIntersecting && state === 'IDLE') {
					loadNextPage();
				}
			}, { rootMargin: '600px 0px' });

			scrollObserver.observe(sentinel);

			const paginatorSelectors = BE.adapters.active.pagination.containerSelectors.join(', ');
			if (paginatorSelectors) {
				const paginator = BE.dom.qs(paginatorSelectors);
				if (paginator) paginator.classList.add('be-pagination-hidden');
			}
		}

		async function loadNextPage() {
			if (state !== 'IDLE') return;
			state = 'LOADING';
			clearTimeout(retryTimer);

			const nextUrl = nextPageUrl || BE.adapters.active.pagination.getNextUrl(document);
			if (!nextUrl) {
				const calc = BE.adapters.active.pagination.calculateNextUrl(location.href);
				if (!calc) {
					state = 'EXHAUSTED';
					BE.log.info('[Gallery] No more pages. Next URL not found.');
					return;
				}
				nextPageUrl = calc;
			}

			BE.log.debug('[Gallery] infinite scroll triggered');
			BE.log.debug(`[Gallery] next URL: ${nextUrl}`);
			BE.log.debug('[Gallery] request started');

			try {
				const res = await BE.net.request({ url: nextUrl, headers: { 'Accept': 'text/html' } }, 3);
				BE.log.debug(`[Gallery] HTTP status: ${res.status}`);
				BE.log.debug(`[Gallery] response length: ${res.responseText.length}`);

				if (res.responseText.includes('login') && res.responseText.includes('password')) {
					throw new Error('Login page returned instead of gallery.');
				}
				if (res.status === 403 || res.status === 404 || res.status === 500) {
					throw new Error(`HTTP ${res.status} error page returned.`);
				}

				const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
				const newContainer = BE.adapters.active.getGalleryContainer(doc);

				if (!newContainer) {
					throw new Error('Gallery container not found in response.');
				}
				BE.log.debug('[Gallery] gallery container found');

				const thumbs = BE.adapters.active.getThumbElements(newContainer);
				BE.log.debug(`[Gallery] thumbnails found: ${thumbs.length}`);

				if (!thumbs.length) {
					state = 'EXHAUSTED';
					BE.log.info('[Gallery] Empty valid page. No more posts.');
					return;
				}

				let inserted = 0;
				for (const thumb of thumbs) {
					const img = thumb.tagName === 'IMG' ? thumb : thumb.querySelector('img');
					if (!img) continue;

					const postId = BE.adapters.active.getThumbPostId(img);
					if (!postId || loadedPostIds.has(postId)) continue;

					loadedPostIds.add(postId);

					const wrap = thumb.closest('article, span, div, a') || thumb.parentElement;
					if (!wrap) continue;

					const clonedWrap = wrap.cloneNode(true);
					clonedWrap.classList.add('be-thumb-wrap');
					const clonedImg = clonedWrap.querySelector('img') || clonedWrap;
					clonedImg.classList.add('be-thumb-img');
					clonedImg.dataset.bePostId = postId;

					galleryContainer.appendChild(clonedWrap);
					inserted++;
				}
				BE.log.debug(`[Gallery] unique posts: ${inserted}`);
				BE.log.debug(`[Gallery] inserted: ${inserted}`);

				nextPageUrl = BE.adapters.active.pagination.getNextUrl(doc);
				if (!nextPageUrl) {
					const calculated = BE.adapters.active.pagination.calculateNextUrl(nextUrl);
					nextPageUrl = calculated;
				}

				if (!nextPageUrl) {
					state = 'EXHAUSTED';
					BE.log.info('[Gallery] No more pages. Next URL not found in response.');
				} else {
					BE.log.debug(`[Gallery] next URL detected: ${nextPageUrl}`);
					state = 'IDLE';
				}

			} catch (err) {
				BE.log.error('[Gallery] pagination error', err);
				BE.log.error(`[Gallery] URL: ${nextUrl}`);
				BE.log.error(`[Gallery] reason: ${err.message}`);
				state = 'ERROR';
				retryTimer = setTimeout(() => {
					state = 'IDLE';
					loadNextPage();
				}, 5000);
			}
		}

		return { init, applyGridSettings, enhanceThumbnails, setupInfiniteScroll };
	})();

	/* ============================================================ *
	 *  UI MODULE (Settings & Toolbar)
	 * ============================================================ */
	BE.modules.ui = (() => {
		function injectStyles() {
			const css = `
			:root {
				--be-accent: ${BE.settings.get('general.accentColor') || '#ff8ac6'};
			}
			.be-gallery-grid {
				display: grid;
				grid-template-columns: var(--be-grid-template, repeat(auto-fill, minmax(var(--be-thumbnail-size, 220px), 1fr)));
				gap: var(--be-grid-gap, 8px);
				align-items: stretch;
			}
			.be-thumb-wrap {
				position: relative;
				overflow: hidden;
				min-width: 0;
				min-height: 0;
				aspect-ratio: 3/4;
				background: rgba(128,128,128,0.1);
				border-radius: 4px;
			}
			.be-thumb-img {
				display: block;
				width: 100%;
				height: 100%;
				max-width: 100%;
				max-height: 100%;
				object-fit: contain;
			}
			.be-pagination-hidden {
				display: none !important;
			}
			.be-toolbar-btn {
				position: fixed;
				bottom: 10px;
				right: 10px;
				z-index: 999999;
				background: var(--be-accent);
				color: #fff;
				border: none;
				padding: 8px 12px;
				border-radius: 4px;
				cursor: pointer;
				font-weight: bold;
			}
			.be-settings-panel {
				position: fixed;
				top: 50px;
				right: 10px;
				width: 320px;
				max-height: 80vh;
				overflow-y: auto;
				background: #fff;
				color: #000;
				border: 1px solid #ccc;
				padding: 15px;
				z-index: 999999;
				box-shadow: 0 4px 10px rgba(0,0,0,0.2);
				font-family: sans-serif;
			}
			.be-settings-panel h3 {
				margin-top: 15px;
				margin-bottom: 5px;
				border-bottom: 1px solid #eee;
				padding-bottom: 5px;
			}
			.be-settings-row {
				margin-bottom: 10px;
			}
			.be-settings-row label {
				display: block;
				font-size: 12px;
				margin-bottom: 4px;
				font-weight: bold;
			}
			`;
			_GM.addStyle(css);
		}

		function createToolbar() {
			const btn = document.createElement('button');
			btn.className = 'be-toolbar-btn';
			btn.textContent = 'BE Settings';
			btn.addEventListener('click', createSettingsPanel);
			document.body.appendChild(btn);
		}

		function createSettingsPanel() {
			let panel = document.getElementById('be-settings-panel');
			if (panel) {
				panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
				return;
			}

			panel = document.createElement('div');
			panel.id = 'be-settings-panel';
			panel.className = 'be-settings-panel';

			const categories = BE.settings.categories();
			for (const cat of categories) {
				const h = document.createElement('h3');
				h.textContent = cat;
				panel.appendChild(h);

				for (const key of BE.settings.byCategory(cat)) {
					const def = BE.settings.SCHEMA[key];
					const row = document.createElement('div');
					row.className = 'be-settings-row';

					const label = document.createElement('label');
					label.textContent = def.label;
					row.appendChild(label);

					let input;
					if (def.type === 'bool') {
						input = document.createElement('input');
						input.type = 'checkbox';
						input.checked = BE.settings.get(key);
						input.addEventListener('change', () => BE.settings.set(key, input.checked));
					} else if (def.type === 'select') {
						input = document.createElement('select');
						for (const choice of def.choices) {
							const opt = document.createElement('option');
							opt.value = choice;
							opt.textContent = choice;
							input.appendChild(opt);
						}
						input.value = BE.settings.get(key);
						input.addEventListener('change', () => BE.settings.set(key, input.value));
					} else if (def.type === 'range' || def.type === 'number') {
						const valSpan = document.createElement('span');
						valSpan.textContent = ` [${BE.settings.get(key)}]`;
						valSpan.style.fontWeight = 'bold';

						input = document.createElement('input');
						input.type = def.type === 'range' ? 'range' : 'number';
						input.min = def.min;
						input.max = def.max;
						input.value = BE.settings.get(key);
						input.style.width = '90%';
						input.addEventListener('input', () => {
							valSpan.textContent = ` [${input.value}]`;
							BE.settings.set(key, Number(input.value));
						});
						row.appendChild(input);
						row.appendChild(valSpan);
						panel.appendChild(row);
						continue;
					} else if (def.type === 'textarea') {
						input = document.createElement('textarea');
						input.value = BE.settings.get(key);
						input.style.width = '100%';
						input.style.height = '60px';
						input.addEventListener('change', () => BE.settings.set(key, input.value));
					} else {
						input = document.createElement('input');
						input.type = 'text';
						input.value = BE.settings.get(key);
						input.style.width = '100%';
						input.addEventListener('change', () => BE.settings.set(key, input.value));
					}
					row.appendChild(input);
					panel.appendChild(row);
				}
			}

			document.body.appendChild(panel);
		}

		return { injectStyles, createToolbar, createSettingsPanel };
	})();

	/* ============================================================ *
	 *  INITIALIZATION
	 * ============================================================ */
	BE.modules.init = function init() {
		BE.store.whenReady(() => {
			BE.settings._load();
			BE.adapters.active = BE.core.detectAdapter();
			if (!BE.adapters.active || !BE.settings.get('general.enabled')) return;

			// 1. IMMEDIATE UI INIT
			BE.modules.ui.injectStyles();
			BE.modules.ui.createToolbar();

			// 2. IMMEDIATE GALLERY BINDING & LAYOUT
			const container = BE.adapters.active.getGalleryContainer();
			if (container) {
				BE.modules.gallery.init(container);
			}

			// 3. ASYNC METADATA ENRICHMENT
			setTimeout(() => BE.modules.gallery.enrichThumbnails(), 0);

			// 4. ASYNC INFINITE SCROLL PREP
			if (BE.settings.get('gallery.infiniteScroll') && container) {
				setTimeout(() => BE.modules.gallery.setupInfiniteScroll(), 1000);
			}
		});
	};

	BE.dom.ready(BE.modules.init);
})();
