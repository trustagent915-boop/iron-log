import { NextResponse } from "next/server";

// Force every request (both HTML and API) to bypass any CDN or browser
// cache. Safari iOS was observed to hold onto multi-hour old HTML
// referencing chunks from a pre-fix build, which kept surfacing "Cloud
// bloccato" and no data even after new deployments.
export function middleware() {
  const response = NextResponse.next();
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");
  return response;
}

export const config = {
  // Everything except static assets (fonts, images) that are safe to cache
  matcher: ["/((?!_next/static|favicon.ico|icon.svg|manifest.webmanifest).*)"]
};
