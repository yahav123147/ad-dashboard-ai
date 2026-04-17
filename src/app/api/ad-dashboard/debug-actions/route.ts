import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { META_API_BASE } from "@/app/ad-dashboard/lib/constants";

// Debug endpoint: shows ALL action types Meta returns for an account
// so the user can see exactly what's being counted
export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { accountId, since, until, month, year } = body;

  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  let dateSince = since;
  let dateUntil = until;
  if (!dateSince && month && year) {
    const lastDay = new Date(year, month, 0).getDate();
    dateSince = `${year}-${String(month).padStart(2, "0")}-01`;
    dateUntil = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  if (!dateSince || !dateUntil) {
    return NextResponse.json({ error: "Missing date range" }, { status: 400 });
  }

  const timeRange = encodeURIComponent(
    JSON.stringify({ since: dateSince, until: dateUntil })
  );

  try {
    const url = `${META_API_BASE}/${accountId}/insights?fields=actions,action_values&time_range=${timeRange}&limit=1&access_token=${session.accessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Meta API error: ${res.status}`);
    }

    const data = await res.json();
    const row = data.data?.[0];

    if (!row) {
      return NextResponse.json({ actions: [], message: "אין נתונים לתקופה הזו" });
    }

    // Summarize all action types and their values
    const actions = (row.actions || []).map(
      (a: { action_type: string; value: string }) => ({
        type: a.action_type,
        count: parseInt(a.value) || 0,
      })
    );

    const actionValues = (row.action_values || []).map(
      (a: { action_type: string; value: string }) => ({
        type: a.action_type,
        value: parseFloat(a.value) || 0,
      })
    );

    return NextResponse.json({
      period: { since: dateSince, until: dateUntil },
      actions: actions.sort(
        (a: { count: number }, b: { count: number }) => b.count - a.count
      ),
      actionValues: actionValues.sort(
        (a: { value: number }, b: { value: number }) => b.value - a.value
      ),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 502 }
    );
  }
}
