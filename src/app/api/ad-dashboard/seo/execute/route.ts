import { NextRequest, NextResponse } from "next/server";
import { generateJson } from "@/lib/utils/anthropic-client";
import { SEO_EXECUTE_CONTEXT } from "@/app/ad-dashboard/lib/seo-knowledge";

/**
 * SEO Task Execution — AI generates the fix, then we apply it via WP REST API.
 * Supports Yoast SEO and RankMath meta fields.
 */

async function wpApiFetch(siteUrl: string, user: string, appPassword: string, endpoint: string, options?: RequestInit) {
  const url = `${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/${endpoint}`;
  const auth = Buffer.from(`${user}:${appPassword}`).toString("base64");
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WP API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Find a WordPress post/page by URL — matches the full path, not just last slug.
 */
async function findPostByUrl(siteUrl: string, user: string, appPassword: string, pageUrl: string) {
  // Extract the path from the URL
  const urlPath = pageUrl
    .replace(/https?:\/\/[^/]+/, "")
    .replace(/^\/|\/$/g, "");

  // Decode Hebrew URL encoding
  const decodedPath = decodeURIComponent(urlPath);

  // Get the slug (last segment) and also full path for matching
  const segments = decodedPath.split("/").filter(Boolean);
  const slug = segments[segments.length - 1] || decodedPath;

  // Try exact slug match first
  for (const type of ["posts", "pages"]) {
    try {
      const results = await wpApiFetch(siteUrl, user, appPassword,
        `${type}?slug=${encodeURIComponent(slug)}&status=publish,draft&per_page=10`
      );
      if (results.length === 1) return { ...results[0], wpType: type };
      // If multiple matches, find the one whose link matches
      if (results.length > 1) {
        const match = results.find((r: { link: string }) =>
          decodeURIComponent(r.link).includes(decodedPath)
        );
        if (match) return { ...match, wpType: type };
        return { ...results[0], wpType: type };
      }
    } catch { /* continue */ }
  }

  // Try matching by link/permalink
  for (const type of ["posts", "pages"]) {
    try {
      const results = await wpApiFetch(siteUrl, user, appPassword,
        `${type}?per_page=100&status=publish,draft`
      );
      const match = results.find((r: { link: string }) => {
        const rPath = decodeURIComponent(r.link.replace(/https?:\/\/[^/]+/, "").replace(/^\/|\/$/g, ""));
        return rPath === decodedPath || rPath.endsWith(slug);
      });
      if (match) return { ...match, wpType: type };
    } catch { /* continue */ }
  }

  return null;
}

/**
 * Detect SEO plugin and get current meta values
 */
function getSeoMeta(post: Record<string, unknown>): {
  plugin: "yoast" | "rankmath" | "none";
  seoTitle: string;
  seoDescription: string;
} {
  const meta = (post.meta || {}) as Record<string, string>;
  const yoastMeta = post.yoast_head_json as Record<string, string> | undefined;

  // Check Yoast
  if (meta._yoast_wpseo_title || meta._yoast_wpseo_metadesc || (yoastMeta && Object.keys(yoastMeta).length > 0)) {
    return {
      plugin: "yoast",
      seoTitle: meta._yoast_wpseo_title || (yoastMeta?.title || ""),
      seoDescription: meta._yoast_wpseo_metadesc || (yoastMeta?.description || ""),
    };
  }

  // Check RankMath
  if (meta.rank_math_title || meta.rank_math_description) {
    return {
      plugin: "rankmath",
      seoTitle: meta.rank_math_title || "",
      seoDescription: meta.rank_math_description || "",
    };
  }

  return {
    plugin: "none",
    seoTitle: "",
    seoDescription: "",
  };
}

export async function POST(request: NextRequest) {
  try {
    const { task, wpCredentials, googleToken, googleSiteUrl, ga4PropertyId } = await request.json();

    if (!task || !wpCredentials) {
      return NextResponse.json({ error: "Missing task or credentials" }, { status: 400 });
    }

    const { siteUrl, user, appPassword } = wpCredentials;
    const log: string[] = [];

    // Step 1: Fetch the current page from WordPress
    log.push("שולף את הדף מ-WordPress...");
    const post = await findPostByUrl(siteUrl, user, appPassword, task.url);

    if (!post) {
      return NextResponse.json({
        success: false,
        error: `לא מצאתי את הדף "${task.url}" ב-WordPress.\n\nסיבות אפשריות:\n- הדף לא קיים (ה-AI המליץ ליצור דף חדש)\n- ה-URL השתנה\n- זה דף שנבנה עם Elementor ולא חשוף דרך ה-REST API\n\nאם זה דף חדש שצריך ליצור, צור אותו ידנית ב-WordPress ואז חזור לכאן.`,
      });
    }

    const currentTitle = (post.title?.rendered || "").replace(/<[^>]*>/g, "");
    const currentExcerpt = (post.excerpt?.rendered || "").replace(/<[^>]*>/g, "").trim();
    const contentPreview = (post.content?.rendered || "").replace(/<[^>]*>/g, "").slice(0, 1000);
    const seoMeta = getSeoMeta(post);
    const actualUrl = post.link || task.url;

    log.push(`נמצא: "${currentTitle}" (ID: ${post.id}, סוג: ${post.wpType})`);
    log.push(`URL אמיתי: ${actualUrl}`);
    log.push(`SEO Plugin: ${seoMeta.plugin === "none" ? "לא זוהה" : seoMeta.plugin}`);
    if (seoMeta.seoTitle) log.push(`SEO Title נוכחי: "${seoMeta.seoTitle}"`);
    if (seoMeta.seoDescription) log.push(`SEO Description נוכחי: "${seoMeta.seoDescription}"`);

    // Step 2: Fetch Search Console data for THIS specific page
    let pageKeywords: { query: string; clicks: number; impressions: number; ctr: number; position: number }[] = [];
    let pageTotalClicks = 0;
    let pageTotalImpressions = 0;
    let pageAvgPosition = 0;
    let pageAvgCtr = 0;

    if (googleToken && googleSiteUrl) {
      try {
        log.push("שולף נתוני Search Console לדף הזה...");
        const now = new Date();
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

        const scRes = await fetch("https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(googleSiteUrl) + "/searchAnalytics/query", {
          method: "POST",
          headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate: fmt(monthAgo),
            endDate: fmt(now),
            dimensions: ["query"],
            dimensionFilterGroups: [{ filters: [{ dimension: "page", expression: actualUrl }] }],
            rowLimit: 20,
          }),
        });

        if (scRes.ok) {
          const scData = await scRes.json();
          pageKeywords = (scData.rows || []).map((r: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }) => ({
            query: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: Math.round(r.ctr * 10000) / 100,
            position: Math.round(r.position * 10) / 10,
          }));
          pageTotalClicks = pageKeywords.reduce((s, k) => s + k.clicks, 0);
          pageTotalImpressions = pageKeywords.reduce((s, k) => s + k.impressions, 0);
          pageAvgCtr = pageTotalImpressions > 0 ? Math.round((pageTotalClicks / pageTotalImpressions) * 10000) / 100 : 0;
          pageAvgPosition = pageKeywords.length > 0 ? Math.round(pageKeywords.reduce((s, k) => s + k.position, 0) / pageKeywords.length * 10) / 10 : 0;

          log.push(`נמצאו ${pageKeywords.length} מילות מפתח | ${pageTotalClicks} קליקים | מיקום ממוצע ${pageAvgPosition}`);
          pageKeywords.slice(0, 5).forEach(k => log.push(`  "${k.query}" — מיקום ${k.position}, ${k.clicks} קליקים, CTR ${k.ctr}%`));
        }
      } catch (err) {
        console.error("SC page data error:", err);
        log.push("לא הצלחתי לשלוף נתוני Search Console לדף");
      }
    }

    // Step 2b: Fetch GA4 data for this specific page
    let pageBounceRate = -1;
    let pageAvgDuration = -1;
    let pageSessions = 0;

    if (googleToken && ga4PropertyId) {
      try {
        log.push("שולף נתוני Analytics לדף הזה...");
        // Extract page path from URL for GA4 filter
        const pagePath = actualUrl.replace(/https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";

        const ga4Res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${ga4PropertyId}:runReport`, {
          method: "POST",
          headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
            dimensions: [{ name: "pagePath" }],
            metrics: [
              { name: "sessions" },
              { name: "bounceRate" },
              { name: "averageSessionDuration" },
              { name: "engagedSessions" },
            ],
            dimensionFilter: {
              filter: {
                fieldName: "pagePath",
                stringFilter: { matchType: "EXACT", value: pagePath },
              },
            },
          }),
        });

        if (ga4Res.ok) {
          const ga4Data = await ga4Res.json();
          const row = ga4Data.rows?.[0];
          if (row) {
            pageSessions = parseInt(row.metricValues[0]?.value || "0");
            pageBounceRate = Math.round(parseFloat(row.metricValues[1]?.value || "0") * 100) / 100;
            pageAvgDuration = Math.round(parseFloat(row.metricValues[2]?.value || "0"));
            const engagedSessions = parseInt(row.metricValues[3]?.value || "0");
            const engagementRate = pageSessions > 0 ? Math.round((engagedSessions / pageSessions) * 100) : 0;

            log.push(`GA4: ${pageSessions} כניסות | bounce ${pageBounceRate}% | זמן ממוצע ${Math.floor(pageAvgDuration / 60)}:${String(pageAvgDuration % 60).padStart(2, "0")} | engagement ${engagementRate}%`);
          } else {
            log.push("GA4: אין נתונים לדף הזה ב-30 הימים האחרונים");
          }
        }
      } catch (err) {
        console.error("GA4 page data error:", err);
      }
    }

    // Step 3: Ask AI what changes to make (with real data!)
    log.push("\nAI מנתח ומכין שינויים...");

    const keywordsSection = pageKeywords.length > 0
      ? `## נתוני Search Console לדף הזה (30 ימים אחרונים)

סה"כ: ${pageTotalClicks} קליקים | ${pageTotalImpressions} חשיפות | CTR ${pageAvgCtr}% | מיקום ממוצע ${pageAvgPosition}

מילות מפתח שמביאות טראפיק לדף:
${pageKeywords.map(k => `- "${k.query}" — מיקום ${k.position}, ${k.clicks} קליקים, ${k.impressions} חשיפות, CTR ${k.ctr}%`).join("\n")}

CTR Benchmarks: pos 1=25-35%, pos 2=12-18%, pos 3=8-12%, pos 4-5=5-8%, pos 6-10=2-5%`
      : "## אין נתוני Search Console זמינים לדף הזה — היזהר עם שינויים";

    const ga4Section = pageSessions > 0
      ? `## נתוני Google Analytics לדף (30 ימים)

${pageSessions} כניסות | Bounce Rate ${pageBounceRate}% | זמן ממוצע ${Math.floor(pageAvgDuration / 60)}:${String(pageAvgDuration % 60).padStart(2, "0")}

פרשנות:
- Bounce Rate מעל 70% = ה-title/meta מבטיח משהו שהתוכן לא נותן, או שהתוכן דק
- Bounce Rate מתחת ל-40% = מצוין, התוכן מתאים לציפיות
- זמן ממוצע מתחת ל-30 שניות = אנשים לא קוראים, בעיה בתוכן
- זמן ממוצע מעל 2 דקות = תוכן מעמיק, אל תשנה את הכיוון`
      : "";

    const aiPrompt = `${SEO_EXECUTE_CONTEXT}

---

## המשימה

סוג: ${task.type}
תיאור: ${task.description}
מילת מפתח: ${task.keyword || "לא צוינה"}
URL: ${actualUrl}

${keywordsSection}

${ga4Section}

## מצב נוכחי בוורדפרס

כותרת הדף: "${currentTitle}"
SEO Title (${seoMeta.plugin}): "${seoMeta.seoTitle || "(ריק — משתמש בכותרת הדף)"}"
SEO Description (${seoMeta.plugin}): "${seoMeta.seoDescription || "(ריק)"}"
תקציר: "${currentExcerpt}"
תוכן (500 תווים): "${contentPreview.slice(0, 500)}"

## כללי החלטה קריטיים

1. אל תשנה title שעובד! אם ה-CTR גבוה מהבנצ'מרק למיקום שלו — אל תיגע בו
2. מילת המפתח שמביאה הכי הרבה קליקים חייבת להישאר ב-title
3. אם ה-CTR כבר טוב — רק meta description (אם ריק)
4. כל שינוי חייב להיות מבוסס על הנתונים למעלה, לא על ניחוש
5. אם אין מה לשנות — החזר null בכל השדות. עדיף לא לשנות מלשבור
6. אם Bounce Rate מעל 70% — ה-title/meta מבטיח יותר מדי. התאם לתוכן האמיתי
7. אם זמן שהייה מתחת ל-30 שניות — התוכן לא מספק. ציין זאת בהמלצה
8. אם Bounce Rate נמוך + זמן שהייה גבוה — התוכן מצוין, אל תשנה כיוון

החזר JSON בלבד:
{
  "newSeoTitle": "ה-SEO Title החדש (או null אם ה-title הנוכחי עובד טוב)",
  "newSeoDescription": "ה-Meta Description החדש (או null)",
  "newTitle": null,
  "changes": "הסבר מבוסס דאטא: איזה נתון הוביל להחלטה, מה שינית, ולמה. אם לא שינית — הסבר למה"
}

כתוב בעברית טבעית. אל תשתמש ב-em dash.`;

    const aiResult = await generateJson<{
      newSeoTitle: string | null;
      newSeoDescription: string | null;
      newTitle: string | null;
      changes: string;
    }>({
      prompt: aiPrompt,
      systemPrompt: "אתה מומחה SEO. החזר JSON בלבד.",
      maxTokens: 1000,
      model: "sonnet",
    });

    if (!aiResult.json) {
      return NextResponse.json({
        success: false,
        error: "AI לא הצליח לייצר המלצות",
      });
    }

    const { newSeoTitle, newSeoDescription, newTitle, changes } = aiResult.json;

    // Step 3: Build changes list and update payload
    const changesList: { field: string; label: string; before: string; after: string }[] = [];
    const updates: Record<string, unknown> = {};
    const metaUpdates: Record<string, string> = {};

    // SEO Title
    if (newSeoTitle) {
      const before = seoMeta.seoTitle || currentTitle;
      if (newSeoTitle !== before) {
        if (seoMeta.plugin === "yoast") {
          metaUpdates._yoast_wpseo_title = newSeoTitle;
        } else if (seoMeta.plugin === "rankmath") {
          metaUpdates.rank_math_title = newSeoTitle;
        } else {
          // No SEO plugin — update the actual page title
          updates.title = newSeoTitle;
        }
        changesList.push({ field: "seo_title", label: "SEO Title (מופיע בגוגל)", before, after: newSeoTitle });
        log.push(`SEO Title: "${before}" → "${newSeoTitle}"`);
      }
    }

    // SEO Description
    if (newSeoDescription) {
      const before = seoMeta.seoDescription || currentExcerpt;
      if (newSeoDescription !== before) {
        if (seoMeta.plugin === "yoast") {
          metaUpdates._yoast_wpseo_metadesc = newSeoDescription;
        } else if (seoMeta.plugin === "rankmath") {
          metaUpdates.rank_math_description = newSeoDescription;
        } else {
          updates.excerpt = newSeoDescription;
        }
        changesList.push({ field: "seo_description", label: "Meta Description (מופיע בגוגל)", before, after: newSeoDescription });
        log.push(`Meta Description: "${before.slice(0, 60)}..." → "${newSeoDescription.slice(0, 60)}..."`);
      }
    }

    // Page title (rarely changed)
    if (newTitle && newTitle !== currentTitle) {
      updates.title = newTitle;
      changesList.push({ field: "title", label: "כותרת הדף", before: currentTitle, after: newTitle });
      log.push(`כותרת דף: "${currentTitle}" → "${newTitle}"`);
    }

    // Add meta updates
    if (Object.keys(metaUpdates).length > 0) {
      updates.meta = metaUpdates;
    }

    // Step 4: Apply changes via WP REST API
    if (Object.keys(updates).length > 0) {
      await wpApiFetch(siteUrl, user, appPassword, `${post.wpType}/${post.id}`, {
        method: "POST",
        body: JSON.stringify(updates),
      });
      log.push("\nהשינויים נשמרו ב-WordPress!");
    } else {
      log.push("\nAI לא המליץ על שינויים ספציפיים בשלב זה.");
    }

    log.push(`\nסיכום AI: ${changes}`);

    return NextResponse.json({
      success: true,
      result: log.join("\n"),
      taskId: task.id,
      changes: changesList,
      wpPostId: post.id,
      wpPostType: post.wpType,
      actualUrl,
    });
  } catch (err) {
    console.error("Task execution error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Execution failed",
      taskId: "",
    }, { status: 500 });
  }
}
