import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

/**
 * GET  → Redirect user to Google OAuth consent screen
 *        Uses the EXISTING registered redirect URI (invoice-manager callback)
 *        with a "seo:" prefix in the state to route back to SEO dashboard.
 *
 * POST → Exchange code for tokens (called from seo-view after redirect)
 */

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
].join(" ");

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  // Use the ALREADY REGISTERED redirect URI
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI not set" }, { status: 500 });
  }

  // CSRF state with "seo:" prefix so the callback knows to redirect to SEO dashboard
  const nonce = crypto.randomBytes(32).toString("hex");
  const state = `seo:${nonce}`;

  const cookieStore = await cookies();
  cookieStore.set("invoice_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export async function POST(request: Request) {
  try {
    const { code, refreshToken: incomingRefreshToken } = await request.json();

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ success: false, error: "Google OAuth not configured" }, { status: 500 });
    }

    // Token refresh flow
    if (incomingRefreshToken && !code) {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: incomingRefreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!refreshRes.ok) {
        return NextResponse.json({ success: false, error: "Token refresh failed" }, { status: 401 });
      }
      const refreshData = await refreshRes.json();
      return NextResponse.json({
        success: true,
        accessToken: refreshData.access_token,
        expiresAt: Date.now() + (refreshData.expires_in || 3600) * 1000,
      });
    }

    if (!redirectUri) {
      return NextResponse.json({ success: false, error: "Google OAuth not configured" }, { status: 500 });
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return NextResponse.json({ success: false, error: `Token exchange failed: ${err}` });
    }

    const tokens = await tokenRes.json();
    const accessToken = tokens.access_token;
    console.log("[google-auth] Token received, scopes:", tokens.scope);

    // Fetch Search Console sites
    const scRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const scRaw = await scRes.text();
    console.log("[google-auth] SC response:", scRes.status, scRaw.slice(0, 500));
    let scData: { siteEntry?: { siteUrl: string }[] } = { siteEntry: [] };
    if (scRes.ok) { try { scData = JSON.parse(scRaw); } catch { /* not JSON */ } }
    const sites = (scData.siteEntry || []).map((s: { siteUrl: string }) => s.siteUrl);
    console.log("[google-auth] SC sites found:", sites);

    // Fetch GA4 properties
    const ga4Res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ga4Raw = await ga4Res.text();
    console.log("[google-auth] GA4 response:", ga4Res.status, ga4Raw.slice(0, 500));
    let properties: { id: string; name: string }[] = [];
    if (ga4Res.ok) {
      let ga4Data: { accountSummaries?: { propertySummaries?: { property: string; displayName: string }[] }[] } = {};
      try { ga4Data = JSON.parse(ga4Raw); } catch { /* not JSON */ }
      for (const account of ga4Data.accountSummaries || []) {
        for (const prop of account.propertySummaries || []) {
          properties.push({ id: prop.property, name: prop.displayName });
        }
      }
    }

    return NextResponse.json({
      success: true,
      accessToken,
      refreshToken: tokens.refresh_token || null,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      searchConsole: { siteUrl: sites[0] || "", sites },
      analytics: { propertyId: properties[0]?.id || "", properties },
    });
  } catch (err) {
    console.error("Google token exchange error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Token exchange failed",
    }, { status: 500 });
  }
}
