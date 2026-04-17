import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { getMediaWithInsights } from "@/app/ad-dashboard/lib/instagram-api";

export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { accountId, limit } = await request.json();

    if (!accountId) {
      return NextResponse.json(
        { error: "Missing accountId" },
        { status: 400 }
      );
    }

    const media = await getMediaWithInsights(
      session.accessToken,
      accountId,
      limit || 50
    );

    return NextResponse.json({ media });
  } catch (err) {
    console.error("Instagram media error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch media" },
      { status: 500 }
    );
  }
}
