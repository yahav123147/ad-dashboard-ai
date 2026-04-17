import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import {
  getAccountInsights,
  getMediaWithInsights,
  getAudienceInsights,
} from "@/app/ad-dashboard/lib/instagram-api";

/**
 * Combined endpoint: fetches insights + media + audience in ONE request.
 * The page token cache ensures getPages() is called only once,
 * even though all 3 functions call getPageTokenForIg() internally.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { accountId, since, until, mediaLimit, include } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }

    // Determine what to fetch (default: all)
    const fetchInsights = !include || include.includes("insights");
    const fetchMedia = !include || include.includes("media");
    const fetchAudience = !include || include.includes("audience");

    const promises: Promise<unknown>[] = [];
    const keys: string[] = [];

    if (fetchInsights && since && until) {
      keys.push("insights");
      promises.push(
        getAccountInsights(session.accessToken, accountId, since, until)
          .catch((err) => ({ error: err.message }))
      );
    }

    if (fetchMedia) {
      keys.push("media");
      promises.push(
        getMediaWithInsights(session.accessToken, accountId, mediaLimit || 50)
          .catch((err) => ({ error: err.message }))
      );
    }

    if (fetchAudience) {
      keys.push("audience");
      promises.push(
        getAudienceInsights(session.accessToken, accountId)
          .catch((err) => ({ error: err.message }))
      );
    }

    const results = await Promise.allSettled(promises);

    const response: Record<string, unknown> = {};
    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        response[keys[idx]] = result.value;
      } else {
        response[keys[idx]] = { error: result.reason?.message || "Failed" };
      }
    });

    return NextResponse.json(response);
  } catch (err) {
    console.error("Instagram all error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
