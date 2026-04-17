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
    const { task, wpCredentials } = await request.json();

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

    // Step 2: Ask AI what changes to make
    log.push("\nAI מנתח ומכין שינויים...");

    const aiPrompt = `${SEO_EXECUTE_CONTEXT}

---

## המשימה

סוג: ${task.type}
תיאור: ${task.description}
מילת מפתח: ${task.keyword || "לא צוינה"}
URL: ${actualUrl}

## מצב נוכחי בוורדפרס

כותרת הדף: "${currentTitle}"
SEO Title (${seoMeta.plugin}): "${seoMeta.seoTitle || "(ריק — משתמש בכותרת הדף)"}"
SEO Description (${seoMeta.plugin}): "${seoMeta.seoDescription || "(ריק)"}"
תקציר: "${currentExcerpt}"
תוכן (500 תווים): "${contentPreview.slice(0, 500)}"

## הוראות

בצע את השינויים לפי הכללים למעלה. החזר JSON בלבד:
{
  "newSeoTitle": "ה-SEO Title החדש (או null אם לא צריך לשנות)",
  "newSeoDescription": "ה-Meta Description החדש (או null)",
  "newTitle": "כותרת הדף החדשה (או null — בדרך כלל לא צריך לשנות)",
  "changes": "תיאור: מה שינית, למה, השפעה צפויה"
}

חשוב: SEO Title ו-Meta Description הם השדות שמופיעים בגוגל, לא הכותרת של הדף.
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
