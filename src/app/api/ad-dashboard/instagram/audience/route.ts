import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { getAudienceInsights } from "@/app/ad-dashboard/lib/instagram-api";

export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json(
        { error: "Missing accountId" },
        { status: 400 }
      );
    }

    const audience = await getAudienceInsights(session.accessToken, accountId);
    return NextResponse.json({ audience });
  } catch (err) {
    console.error("Instagram audience error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch audience data" },
      { status: 500 }
    );
  }
}
