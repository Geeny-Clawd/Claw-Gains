// Claw Gains service worker: network-first with cache fallback.
//
// Online, every request goes to the network exactly as before (the server
// sends no-store and we never serve stale bytes), but each successful
// response refreshes the cache. Offline — a gym dead spot — the app boots
// and runs from the last good copy; workout state lives in localStorage,
// so logging keeps working and syncs when the connection returns.
const CACHE_NAME = 'clawgains-v1';

const PRECACHE = [
    '/',
    '/app.js',
    '/helpers.js',
    '/style.css',
    '/vendor/preact-bundle.js',
    '/program.json',
    '/manifest.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);
    // API calls (workout sync, error reports) must never be answered from
    // cache: a fake "ok" would make the client mark dirty data as synced.
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') return;
    event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
    } catch (err) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        // Unknown navigations still deserve the app shell offline.
        if (req.mode === 'navigate') {
            const shell = await cache.match('/');
            if (shell) return shell;
        }
        throw err;
    }
}
