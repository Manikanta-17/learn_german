const CACHE_NAME = "german-lms-shell-v2";
const SHELL_FILES = ["./", "index.html", "manifest.json", "icon.png"];
// Third-party libraries loaded from CDNs. Cached so the app can boot with no connection.
const CDN_FILES = [
    "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
];
const CDN_HOSTS = ["cdn.sheetjs.com", "www.gstatic.com"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            cache.addAll(SHELL_FILES).then(() =>
                // A CDN hiccup must not abort the install — the fetch handler retries later.
                Promise.all(CDN_FILES.map((url) => cache.add(new Request(url, { mode: "cors" })).catch(() => {})))
            )
        ).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Network-first for navigations/HTML so a redeploy is picked up immediately;
// stale-while-revalidate for CDN libraries; cache-first for the static shell assets.
// Firestore traffic is never touched — the app keeps its own offline copy of the data.
self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);

    const isNavigation = req.mode === "navigate" || (req.destination === "document");
    if (isNavigation) {
        event.respondWith(
            fetch(req).then((res) => {
                caches.open(CACHE_NAME).then((cache) => cache.put("index.html", res.clone()));
                return res;
            }).catch(() => caches.match("index.html"))
        );
        return;
    }

    if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) =>
                cache.match(req.url).then((cached) => {
                    const network = fetch(req).then((res) => {
                        if (res.ok) cache.put(req.url, res.clone());
                        return res;
                    });
                    if (cached) { network.catch(() => {}); return cached; }
                    return network;
                })
            )
        );
        return;
    }

    if (url.origin !== self.location.origin) return;
    event.respondWith(
        caches.match(req).then((cached) => cached || fetch(req))
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ("focus" in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow("./");
        })
    );
});
