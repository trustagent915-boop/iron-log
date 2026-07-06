// Force browsers (Safari in particular) to never cache these API responses.
// Safari has been observed to cache the old 401 auth response and keep
// serving it even after the server started returning 200 without auth.
export const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0"
} as const;
