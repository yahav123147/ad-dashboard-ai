import { NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { getInstagramAccounts } from "@/app/ad-dashboard/lib/instagram-api";

export async function GET() {
  const session = await getSessionData();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const accounts = await getInstagramAccounts(session.accessToken);
    return NextResponse.json({ accounts });
  } catch (err) {
    console.error("Instagram accounts error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch Instagram accounts" },
      { status: 500 }
    );
  }
}
