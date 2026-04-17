import { NextRequest, NextResponse } from "next/server";

/**
 * Debug endpoint — test Google API connection with stored tokens.
 * Call: POST /api/ad-dashboard/seo/debug with { accessToken, siteUrl, propertyId }
 */
export async function POST(request: NextRequest) {
  try {
    const { accessToken, siteUrl, propertyId } = await request.json();
    const results: Record<string, unknown> = { accessToken: accessToken ? `${accessToken.slice(0, 20)}...` : "MISSING" };

    // Test 1: Search Console sites list
    const scListRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const scListText = await scListRes.text();
    results.scSitesList = { status: scListRes.status, body: scListText.slice(0, 1000) };

    // Test 2: Search Console query (if siteUrl provided)
    if (siteUrl) {
      const encoded = encodeURIComponent(siteUrl);
      const scQueryRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: "2026-04-01", endDate: "2026-04-15", dimensions: [] }),
        }
      );
      const scQueryText = await scQueryRes.text();
      results.scQuery = { status: scQueryRes.status, siteUrl, body: scQueryText.slice(0, 1000) };
    }

    // Test 3: GA4 account summaries
    const ga4ListRes = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ga4ListText = await ga4ListRes.text();
    results.ga4AccountSummaries = { status: ga4ListRes.status, body: ga4ListText.slice(0, 1000) };

    // Test 4: GA4 report (if propertyId provided)
    if (propertyId) {
      const ga4ReportRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate: "2026-04-01", endDate: "2026-04-15" }],
            metrics: [{ name: "sessions" }],
          }),
        }
      );
      const ga4ReportText = await ga4ReportRes.text();
      results.ga4Report = { status: ga4ReportRes.status, propertyId, body: ga4ReportText.slice(0, 1000) };
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Debug failed" }, { status: 500 });
  }
}
