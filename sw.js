const CACHE_VERSION = 'logiclab-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',

    './css/main.css',
    './css/sidebar.css',
    './css/animations.css',
    './css/advanced.css',
    './css/polish.css',
    './css/fonts.css',

    './css/fonts/dm-sans-400.woff2',
    './css/fonts/dm-sans-500.woff2',
    './css/fonts/dm-sans-600.woff2',
    './css/fonts/dm-sans-700.woff2',
    './css/fonts/dm-sans-800.woff2',
    './css/fonts/jetbrains-mono-400.woff2',
    './css/fonts/jetbrains-mono-500.woff2',
    './css/fonts/jetbrains-mono-700.woff2',
    './css/fonts/space-grotesk-500.woff2',
    './css/fonts/space-grotesk-700.woff2',

    './js/storage.js',
    './js/router.js',
    './js/simulator.js',
    './js/truth-table.js',
    './js/boolean.js',
    './js/builder-advanced.js',
    './js/particles.js',
    './js/app.js',

    './logo/logo.png',
    './logo/logo.svg',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache =>
                Promise.allSettled(
                    PRECACHE_URLS.map(url =>
                        cache.add(url).catch(err =>
                            console.warn('Precache skip:', url, err.message)
                        )
                    )
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;

            return fetch(request).then(response => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const copy = response.clone();
                caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
                return response;
            }).catch(() => {
                if (request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});