import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { getAdInsights } from "@/app/ad-dashboard/lib/meta-api";

export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { accountId, since, until, month, year, minSpend = 0, leadActionType, campaignId } = body;

  if (!accountId) {
    return NextResponse.json(
      { error: "Missing accountId" },
      { status: 400 }
    );
  }

  // Support both since/until and month/year
  let dateSince = since;
  let dateUntil = until;
  if (!dateSince && month && year) {
    const lastDay = new Date(year, month, 0).getDate();
    dateSince = `${year}-${String(month).padStart(2, "0")}-01`;
    dateUntil = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  if (!dateSince || !dateUntil) {
    return NextResponse.json(
      { error: "Missing date range" },
      { status: 400 }
    );
  }

  try {
    const ads = await getAdInsights(
      session.accessToken,
      accountId,
      { since: dateSince, until: dateUntil },
      minSpend,
      leadActionType || "auto",
      campaignId || undefined
    );

    return NextResponse.json({ ads });
  } catch (err) {
    console.error("Ad insights error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch ad insights",
      },
      { status: 502 }
    );
  }
}
