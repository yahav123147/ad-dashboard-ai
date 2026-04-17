import { NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";

// Without Supabase, export is handled client-side from localStorage.
// This endpoint returns empty structure — client will override with its own data.

export async function GET() {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exportData = {
    settings: null,
    accounts: [],
    _lastUpdated: new Date().toISOString(),
    _updatedBy: "dashboard-export",
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ad-dashboard-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
