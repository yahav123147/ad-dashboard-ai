import { NextRequest, NextResponse } from "next/server";

/**
 * Test WordPress REST API connection using Application Password auth.
 * No Claude CLI needed — direct HTTP call.
 */
export async function POST(request: NextRequest) {
  try {
    const { siteUrl, user, appPassword } = await request.json();

    if (!siteUrl || !user || !appPassword) {
      return NextResponse.json(
        { success: false, error: "חסרים פרטים: כתובת אתר, שם משתמש, ו-Application Password" },
        { status: 400 }
      );
    }

    const baseUrl = siteUrl.replace(/\/$/, "");
    const auth = Buffer.from(`${user}:${appPassword}`).toString("base64");

    // Test connection by fetching site info
    const res = await fetch(`${baseUrl}/wp-json`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!res.ok) {
      const status = res.status;
      if (status === 401 || status === 403) {
        return NextResponse.json({
          success: false,
          error: "שם משתמש או Application Password שגויים. ודא שיצרת Application Password ב-Users > Profile > Application Passwords",
        });
      }
      return NextResponse.json({
        success: false,
        error: `שגיאה ${status} מהאתר. ודא שה-URL נכון ושה-REST API פעיל.`,
      });
    }

    const data = await res.json();

    return NextResponse.json({
      success: true,
      siteUrl: baseUrl,
      siteTitle: data.name || "",
      user,
      appPassword,
    });
  } catch (err) {
    console.error("WP connect error:", err);
    const msg = err instanceof Error ? err.message : "Connection failed";
    const isNetwork = msg.includes("fetch") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED");
    return NextResponse.json(
      {
        success: false,
        error: isNetwork
          ? "לא מצליח להתחבר לאתר. ודא שהכתובת נכונה (כולל https://)"
          : msg,
      },
      { status: 500 }
    );
  }
}
