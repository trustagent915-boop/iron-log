import { NextResponse } from "next/server";

import {
  armTrackerSyncCookieName,
  cleanSecret,
  getSnapshotAccessToken
} from "@/lib/arm-tracker/snapshot-auth.server";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  const expectedToken = getSnapshotAccessToken();
  const cookieHeader = request.headers.get("cookie") ?? "";
  const hasCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie.startsWith(`${armTrackerSyncCookieName}=`));

  return NextResponse.json({
    configured: Boolean(expectedToken),
    authenticated: Boolean(expectedToken && hasCookie)
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const expectedToken = getSnapshotAccessToken();
  const providedToken = isRecord(body) && typeof body.token === "string" ? cleanSecret(body.token) : "";

  if (!expectedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "Token sync non valido." }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });

  response.cookies.set({
    name: armTrackerSyncCookieName,
    value: expectedToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });

  response.cookies.set({
    name: armTrackerSyncCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}
