import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Google OAuth callback — receives the authorization code,
 * validates state, stores code in a temp cookie, and redirects
 * back to the SEO dashboard which reads and exchanges it.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/ad-dashboard?seo_error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/ad-dashboard?seo_error=missing_params", request.url));
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("google_oauth_state")?.value;
  if (state !== savedState) {
    return NextResponse.redirect(new URL("/ad-dashboard?seo_error=invalid_state", request.url));
  }

  // Clear state cookie
  cookieStore.delete("google_oauth_state");

  // Store the code in a short-lived cookie for the frontend to pick up
  cookieStore.set("google_oauth_code", code, {
    httpOnly: false, // Frontend needs to read this
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60, // 1 minute — just enough for the frontend to grab it
  });

  return NextResponse.redirect(new URL("/ad-dashboard?seo_google=success", request.url));
}
