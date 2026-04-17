import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function GET() {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return NextResponse.json(
      { error: "Meta App not configured. Set META_APP_ID and META_REDIRECT_URI." },
      { status: 500 }
    );
  }

  // Generate CSRF state token
  const state = crypto.randomBytes(32).toString("hex");

  // Store state in cookie for validation in callback
  const cookieStore = await cookies();
  cookieStore.set("ad_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "ads_read",
    response_type: "code",
    state,
  });

  const loginUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;

  return NextResponse.redirect(loginUrl);
}
