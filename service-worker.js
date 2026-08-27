// ============================================================================
// Car'Tech Arena — service worker minimal.
//
// Volontairement SANS mise en cache de l'application : le code évolue
// souvent (mises à jour poussées régulièrement via GitHub/Vercel), et un
// cache d'app shell agressif risquerait de servir une version périmée (donc
// potentiellement cassée) après une mise à jour, aussi bien à toi qu'aux
// joueurs. Ce service worker existe uniquement pour remplir la condition
// technique d'installabilité (« avoir un gestionnaire fetch enregistré ») —
// chaque requête est simplement laissée passer normalement au réseau.
// ============================================================================
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
