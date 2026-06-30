export const armTrackerSyncCookieName = "iron_log_sync_token";

export function cleanSecret(value: string | undefined) {
  return value
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim() ?? "";
}

export function getSnapshotAccessToken() {
  return cleanSecret(process.env.ARM_TRACKER_SYNC_TOKEN) || cleanSecret(process.env.ARM_TRACKER_OWNER_KEY);
}

function getCookieValue(request: Request, cookieName: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const matchingCookie = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`));

  if (!matchingCookie) {
    return "";
  }

  return decodeURIComponent(matchingCookie.slice(cookieName.length + 1));
}

export function isAuthorizedSnapshotRequest(request: Request) {
  const expectedToken = getSnapshotAccessToken();

  if (!expectedToken) {
    return false;
  }

  const providedToken =
    request.headers.get("x-arm-tracker-sync-token") ??
    request.headers.get("x-arm-tracker-owner-key") ??
    getCookieValue(request, armTrackerSyncCookieName);

  return providedToken === expectedToken;
}
