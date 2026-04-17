import { NextRequest, NextResponse } from "next/server";

const GA4_API = "https://analyticsdata.googleapis.com/v1beta";

async function ga4Fetch(propertyId: string, accessToken: string, body: Record<string, unknown>) {
  const res = await fetch(`${GA4_API}/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 API error ${res.status}: ${err}`);
  }

  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken, propertyId, since, until, type } = await request.json();

    if (!accessToken || !propertyId) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const organicFilter = {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: "Organic Search" },
      },
    };

    if (type === "daily") {
      const data = await ga4Fetch(propertyId, accessToken, {
        dateRanges: [{ startDate: since, endDate: until }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
        ],
        dimensionFilter: organicFilter,
        orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
      });

      const daily = (data.rows || []).map((row: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
        date: row.dimensionValues[0].value.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
        sessions: parseInt(row.metricValues[0].value) || 0,
        users: parseInt(row.metricValues[1].value) || 0,
      }));

      return NextResponse.json({ daily });
    }

    // Summary with comparison
    const days = Math.ceil(
      (new Date(until).getTime() - new Date(since).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    const prevEnd = new Date(since);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const data = await ga4Fetch(propertyId, accessToken, {
      dateRanges: [
        { startDate: since, endDate: until },
        { startDate: fmt(prevStart), endDate: fmt(prevEnd) },
      ],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
      dimensionFilter: organicFilter,
    });

    const current = data.rows?.[0]?.metricValues || [];
    const previous = data.rows?.[1]?.metricValues || [];
    const val = (arr: { value: string }[], i: number) => parseFloat(arr[i]?.value || "0");

    return NextResponse.json({
      sessions: val(current, 0),
      users: val(current, 1),
      bounceRate: val(current, 2),
      avgSessionDuration: val(current, 3),
      prevSessions: val(previous, 0),
      prevUsers: val(previous, 1),
      prevBounceRate: val(previous, 2),
      prevAvgSessionDuration: val(previous, 3),
    });
  } catch (err) {
    console.error("GA4 error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "GA4 request failed" },
      { status: 500 }
    );
  }
}
