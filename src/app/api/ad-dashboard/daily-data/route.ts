import { NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";

// Without Supabase, daily data is stored client-side in localStorage.
// These endpoints return empty for GET and acknowledge PUT.

export async function GET() {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ rows: [] });
}

export async function PUT() {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Data stored client-side
  return NextResponse.json({ ok: true });
}
