import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { getAccountInsights } from "@/app/ad-dashboard/lib/instagram-api";

export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { accountId, since, until } = await request.json();

    if (!accountId || !since || !until) {
      return NextResponse.json(
        { error: "Missing accountId, since, or until" },
        { status: 400 }
      );
    }

    const insights = await getAccountInsights(
      session.accessToken,
      accountId,
      since,
      until
    );

    return NextResponse.json({ insights });
  } catch (err) {
    console.error("Instagram insights error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch insights" },
      { status: 500 }
    );
  }
}
