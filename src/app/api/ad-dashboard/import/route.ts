import { NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";

// Without Supabase, import is handled client-side via localStorage.
// This endpoint just acknowledges the request.

export async function POST() {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    imported: 0,
    message: "Import handled client-side",
  });
}
