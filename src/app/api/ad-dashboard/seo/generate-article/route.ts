import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";

/**
 * Generate and PUBLISH a new SEO article based on top-performing content.
 * Uses Claude CLI to write the article, then publishes via WP REST API.
 */

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "-", "--output-format", "json", "--model", "sonnet"], {
      timeout: 300_000,
      env: { ...process.env, HOME: process.env.HOME, CLAUDECODE: "", CLAUDE_CODE_ENTRYPOINT: "" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 300)}`));
    });
    child.on("error", (err) => reject(err));
    if (!child.stdin.write(prompt)) {
      child.stdin.once("drain", () => child.stdin.end());
    } else {
      child.stdin.end();
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const { topArticles, topKeywords, wpCredentials } = await request.json();

    if (!wpCredentials?.siteUrl) {
      return NextResponse.json({ success: false, error: "WordPress לא מחובר" }, { status: 400 });
    }

    // Step 1: Ask Claude to analyze and write an article
    const prompt = `אתה כותב תוכן SEO מקצועי בעברית. נתח את המאמרים ומילות המפתח המצליחים ביותר של האתר וכתוב מאמר חדש.

מאמרים מצליחים (ממוינים לפי קליקים):
${JSON.stringify(topArticles)}

מילות מפתח עם טראפיק:
${JSON.stringify(topKeywords)}

הוראות:
1. בחר נושא שעוד לא כתבו עליו אבל קשור למילות המפתח המצליחות
2. כתוב מאמר של 1,200-1,800 מילים בעברית
3. השתמש בסגנון של המאמרים המצליחים
4. כלול H2 ו-H3 headings (בתוך תגיות HTML)
5. כלול internal links למאמרים הקיימים
6. כתוב עם הוכחות, מספרים, וטיפים מעשיים

החזר JSON בלבד:
{
  "title": "כותרת המאמר (40-60 תווים, כולל מילת מפתח)",
  "slug": "url-slug-in-english",
  "seoTitle": "SEO Title למטא (עד 60 תווים)",
  "seoDescription": "Meta description (120-160 תווים עם CTA)",
  "content": "<p>תוכן המאמר בHTML עם <h2>, <h3>, <p>, <ul>, <li>, <strong>, <a href>...</p>",
  "excerpt": "תקציר של 2-3 משפטים",
  "targetKeyword": "מילת המפתח הראשית"
}`;

    const stdout = await runClaude(prompt);

    let resultText = "";
    try {
      const parsed = JSON.parse(stdout);
      resultText = parsed?.result || stdout;
    } catch {
      resultText = stdout;
    }

    // Extract JSON
    let articleData: {
      title: string;
      slug: string;
      seoTitle?: string;
      seoDescription?: string;
      content: string;
      excerpt?: string;
      targetKeyword?: string;
    } | null = null;

    const patterns = [
      /```json\n([\s\S]*?)\n```/,
      /```\n(\{[\s\S]*?\})\n```/,
      /(\{[\s\S]*"title"[\s\S]*"content"[\s\S]*\})/,
    ];

    for (const pattern of patterns) {
      const match = resultText.match(pattern);
      if (match?.[1]) {
        try {
          articleData = JSON.parse(match[1]);
          break;
        } catch { /* try next */ }
      }
    }

    if (!articleData) {
      try { articleData = JSON.parse(resultText); } catch { /* not JSON */ }
    }

    if (!articleData?.title || !articleData?.content) {
      return NextResponse.json({
        success: false,
        error: "AI לא הצליח לייצר מאמר מלא. נסה שוב.",
      });
    }

    // Step 2: Publish to WordPress
    const { siteUrl, user, appPassword } = wpCredentials;
    const auth = Buffer.from(`${user}:${appPassword}`).toString("base64");

    const wpPayload: Record<string, unknown> = {
      title: articleData.title,
      slug: articleData.slug,
      content: articleData.content,
      excerpt: articleData.excerpt || "",
      status: "publish", // Publish immediately
    };

    // Add Yoast SEO meta if available
    if (articleData.seoTitle || articleData.seoDescription) {
      wpPayload.meta = {
        ...(articleData.seoTitle && { _yoast_wpseo_title: articleData.seoTitle }),
        ...(articleData.seoDescription && { _yoast_wpseo_metadesc: articleData.seoDescription }),
      };
    }

    const wpRes = await fetch(`${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(wpPayload),
    });

    if (!wpRes.ok) {
      const err = await wpRes.text();
      return NextResponse.json({
        success: false,
        error: `שגיאה בפרסום ב-WordPress: ${err.slice(0, 200)}`,
      });
    }

    const published = await wpRes.json();

    return NextResponse.json({
      success: true,
      title: articleData.title,
      url: published.link,
      editUrl: `${siteUrl.replace(/\/$/, "")}/wp-admin/post.php?post=${published.id}&action=edit`,
      postId: published.id,
      targetKeyword: articleData.targetKeyword,
    });
  } catch (err) {
    console.error("Generate article error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Article generation failed",
    }, { status: 500 });
  }
}
