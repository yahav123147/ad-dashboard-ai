import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { getInsights } from "@/app/ad-dashboard/lib/meta-api";

export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { accountId, month, year, leadActionType, campaignId } = body;
  let { since, until } = body;

  if (!accountId) {
    return NextResponse.json(
      { error: "Missing accountId" },
      { status: 400 }
    );
  }

  // Support both since/until and month/year
  if (!since && month && year) {
    const lastDay = new Date(year, month, 0).getDate();
    since = `${year}-${String(month).padStart(2, "0")}-01`;
    until = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  if (!since || !until) {
    return NextResponse.json(
      { error: "Missing date range" },
      { status: 400 }
    );
  }

  try {
    const insights = await getInsights(
      session.accessToken,
      accountId,
      { since, until },
      leadActionType || "auto",
      campaignId
    );

    const now = new Date().toISOString();

    // Return raw data — client will merge into its state
    return NextResponse.json({
      synced: true,
      days: insights.length,
      lastSynced: now,
      data: insights.map((i) => ({
        date: i.date,
        adSpend: i.spend,
        impressions: i.impressions,
        uniqueClicks: i.uniqueClicks,
        landingPageViews: i.landingPageViews,
        registrations: i.registrations,
        purchases: i.purchases,
        revenue: i.revenue,
      })),
    });
  } catch (err) {
    console.error("Sync error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to sync with Meta",
      },
      { status: 502 }
    );
  }
}
