import { NextRequest, NextResponse } from "next/server";

/**
 * Revert SEO task changes — restore original values via WP REST API.
 * Handles both regular fields and Yoast/RankMath meta fields.
 */
export async function POST(request: NextRequest) {
  try {
    const { wpCredentials, wpPostId, wpPostType, changes } = await request.json();

    if (!wpCredentials || !wpPostId || !changes?.length) {
      return NextResponse.json({ error: "Missing data for revert" }, { status: 400 });
    }

    const { siteUrl, user, appPassword } = wpCredentials;
    const url = `${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/${wpPostType}/${wpPostId}`;
    const auth = Buffer.from(`${user}:${appPassword}`).toString("base64");

    // Build revert payload — handle both direct fields and meta fields
    const revertData: Record<string, unknown> = {};
    const metaRevert: Record<string, string> = {};

    for (const change of changes) {
      if (change.field === "seo_title") {
        // Try all possible SEO plugin fields
        metaRevert._yoast_wpseo_title = change.before;
        metaRevert.rank_math_title = change.before;
      } else if (change.field === "seo_description") {
        metaRevert._yoast_wpseo_metadesc = change.before;
        metaRevert.rank_math_description = change.before;
      } else {
        revertData[change.field] = change.before;
      }
    }

    if (Object.keys(metaRevert).length > 0) {
      revertData.meta = metaRevert;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(revertData),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ success: false, error: `WP API ${res.status}: ${err.slice(0, 200)}` });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Revert failed",
    }, { status: 500 });
  }
}
