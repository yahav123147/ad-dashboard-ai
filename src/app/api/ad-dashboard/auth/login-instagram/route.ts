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

  // Request all scopes: ads + pages + instagram
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "ads_read,pages_show_list,pages_read_engagement,business_management,instagram_basic,instagram_manage_insights",
    response_type: "code",
    state,
    // Force re-auth so user sees the new permissions dialog
    auth_type: "rerequest",
  });

  const loginUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;

  return NextResponse.redirect(loginUrl);
}
