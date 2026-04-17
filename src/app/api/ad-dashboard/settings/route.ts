import { NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";

// Without Supabase, settings are stored client-side in localStorage.
// These endpoints return defaults for GET and acknowledge PUT.

export async function GET() {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  return NextResponse.json({
    settings: {
      businessName: "",
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      vatRate: 18,
      breakEvenRoas: 2.0,
      campaignGoal: "registrations",
    },
  });
}

export async function PUT() {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Settings stored client-side
  return NextResponse.json({ ok: true });
}
