import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getMetaUser,
} from "@/app/ad-dashboard/lib/meta-api";
import { setSessionData } from "@/app/ad-dashboard/lib/session";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // User denied permission
  if (error) {
    return NextResponse.redirect(
      new URL("/ad-dashboard/login?error=denied", request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/ad-dashboard/login?error=missing_params", request.url)
    );
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("ad_oauth_state")?.value;
  cookieStore.delete("ad_oauth_state");

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      new URL("/ad-dashboard/login?error=invalid_state", request.url)
    );
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const redirectUri = process.env.META_REDIRECT_URI!;

  try {
    // 1. Exchange code for short-lived token
    const { access_token: shortToken } = await exchangeCodeForToken(
      code,
      appId,
      appSecret,
      redirectUri
    );

    // 2. Exchange for long-lived token (60 days)
    const { access_token: longToken, expires_in } =
      await getLongLivedToken(shortToken, appId, appSecret);

    // 3. Get user info
    const metaUser = await getMetaUser(longToken);

    // 4. Calculate token expiry
    const tokenExpiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    // 5. Store in signed cookie (no DB needed)
    await setSessionData({
      metaUserId: metaUser.id,
      name: metaUser.name,
      email: metaUser.email || null,
      accessToken: longToken,
      tokenExpiresAt,
    });

    // 6. Redirect to dashboard
    return NextResponse.redirect(
      new URL("/ad-dashboard", request.url)
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/ad-dashboard/login?error=auth_failed", request.url)
    );
  }
}
