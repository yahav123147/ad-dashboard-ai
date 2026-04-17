import { NextRequest, NextResponse } from "next/server";

const SC_API = "https://www.googleapis.com/webmasters/v3";

interface SCRequest {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
  startRow?: number;
}

async function scFetch(siteUrl: string, accessToken: string, body: SCRequest) {
  const encodedSite = encodeURIComponent(siteUrl);
  const res = await fetch(
    `${SC_API}/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Search Console API error ${res.status}: ${err}`);
  }

  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken, siteUrl, since, until, type } = await request.json();

    if (!accessToken || !siteUrl) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    if (type === "keywords") {
      const current = await scFetch(siteUrl, accessToken, {
        startDate: since,
        endDate: until,
        dimensions: ["query"],
        rowLimit: 500,
      });

      const days = Math.ceil(
        (new Date(until).getTime() - new Date(since).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
      const prevEnd = new Date(since);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - days + 1);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const previous = await scFetch(siteUrl, accessToken, {
        startDate: fmt(prevStart),
        endDate: fmt(prevEnd),
        dimensions: ["query"],
        rowLimit: 500,
      });

      const prevMap = new Map<string, { clicks: number; impressions: number; ctr: number; position: number }>();
      for (const row of previous.rows || []) {
        prevMap.set(row.keys[0], {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        });
      }

      const keywords = (current.rows || []).map((row: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => {
        const prev = prevMap.get(row.keys[0]);
        return {
          query: row.keys[0],
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
          prevClicks: prev?.clicks,
          prevImpressions: prev?.impressions,
          prevCtr: prev?.ctr,
          prevPosition: prev?.position,
        };
      });

      return NextResponse.json({ keywords });
    }

    if (type === "pages") {
      const data = await scFetch(siteUrl, accessToken, {
        startDate: since,
        endDate: until,
        dimensions: ["page"],
        rowLimit: 500,
      });

      const pages = (data.rows || []).map((row: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
        page: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      }));

      return NextResponse.json({ pages });
    }

    if (type === "daily") {
      const data = await scFetch(siteUrl, accessToken, {
        startDate: since,
        endDate: until,
        dimensions: ["date"],
      });

      const daily = (data.rows || []).map((row: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
        date: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      }));

      return NextResponse.json({ daily });
    }

    // Summary — no dimensions
    const data = await scFetch(siteUrl, accessToken, {
      startDate: since,
      endDate: until,
      dimensions: [],
    });

    const row = data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    return NextResponse.json({
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
  } catch (err) {
    console.error("Search Console error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SC request failed" },
      { status: 500 }
    );
  }
}
