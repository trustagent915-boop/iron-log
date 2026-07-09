"use client";

import { useEffect } from "react";

// One-shot cleanup that runs on the very first render on the client.
// Older iPad Safari sessions may still hold onto:
//   1. A Service Worker registered from a previous PWA install
//   2. The Cache API entries populated by that SW
//   3. Old HTML kept in Safari's memory cache after "Add to Home Screen"
// None of them should exist for this app (we don't ship a SW) but iOS
// occasionally keeps them alive across origin content changes. This
// hook clears anything it can reach silently and idempotently — after
// the first successful cleanup the localStorage flag prevents extra
// work on every navigation.
export function CacheKiller() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const marker = "iron_log_cache_killer_v1";
    if (window.localStorage.getItem(marker) === "done") return;

    void (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      } catch {
        // ignore — permissions issue or unsupported
      }
      try {
        if ("caches" in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
        }
      } catch {
        // ignore
      }
      try {
        window.localStorage.setItem(marker, "done");
      } catch {
        // localStorage might be disabled; safe to skip
      }
    })();
  }, []);

  return null;
}
