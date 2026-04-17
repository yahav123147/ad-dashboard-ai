import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { SEO_EXPERT_SYSTEM_PROMPT, SEO_TASK_TYPES } from "@/app/ad-dashboard/lib/seo-knowledge";

/**
 * AI Task Generation — pipes prompt via stdin to Claude CLI.
 * Runs through the user's Claude subscription, no API key needed.
 */

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "-", "--output-format", "json", "--model", "sonnet"], {
      timeout: 300_000,
      env: { ...process.env, HOME: process.env.HOME, CLAUDECODE: "", CLAUDE_CODE_ENTRYPOINT: "" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr.slice(0, 300)}`));
      }
    });

    child.on("error", (err) => reject(err));

    // Write prompt to stdin and close (handle backpressure)
    if (!child.stdin.write(prompt)) {
      child.stdin.once("drain", () => child.stdin.end());
    } else {
      child.stdin.end();
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const { keywords, articles, scPages } = await request.json();

    // Trim data — only send what AI needs
    const topKeywords = (keywords || []).slice(0, 20).map((k: { query: string; clicks: number; impressions: number; ctr: number; position: number }) => ({
      q: k.query,
      pos: Math.round(k.position * 10) / 10,
      clicks: k.clicks,
      imp: k.impressions,
      ctr: Math.round(k.ctr * 10000) / 100,
    }));

    const topArticles = (articles || []).slice(0, 15).map((a: { title: string; url: string; clicks?: number; position?: number }) => ({
      title: a.title?.slice(0, 80),
      url: a.url,
      clicks: a.clicks || 0,
      pos: a.position ? Math.round(a.position * 10) / 10 : 0,
    }));

    const prompt = `אתה מומחה SEO. נתח נתונים וצור משימות. החזר JSON בלבד בעברית. אל תשתמש ב-em dash.

סוגי משימות: critical_indexing, missing_meta_description, title_too_long, title_too_short, weak_title_ctr, thin_content, keyword_dropped, keyword_opportunity, missing_schema, internal_linking, eeat_gap, content_cluster, opportunity_keyword

עדיפויות: critical (חוסם אינדוקס) > high (משפיע על דירוג) > medium (אופטימיזציה) > low (נחמד שיהיה)

CTR Benchmarks: pos 1=25-35%, pos 2=12-18%, pos 3=8-12%, pos 4-5=5-8%, pos 6-10=2-5%, pos 11-20=0.5-2%

Title: 40-60 תווים, מילת מפתח בהתחלה. Meta: 120-160 תווים עם CTA.

---

## נתוני האתר

מילות מפתח (מ-Search Console, ממוינות לפי קליקים):
${JSON.stringify(topKeywords)}

מאמרים מ-WordPress (URLs אמיתיים שאפשר לערוך):
${JSON.stringify(topArticles)}

דפים מ-Search Console (URLs אמיתיים עם נתוני ביצועים):
${JSON.stringify((scPages || []).slice(0, 20).map((p: { page: string; clicks: number; impressions: number; position: number }) => ({ url: p.page, clicks: p.clicks, imp: p.impressions, pos: Math.round(p.position * 10) / 10 })))}

## הוראות חשובות

1. חשב SEO Health Score (0-100) לפי המשקלות למעלה
2. השווה CTR בפועל ל-CTR Benchmarks — זהה פערים
3. זהה הזדמנויות: מילים במיקום 8-20, CTR נמוך מהצפוי, תוכן דק
4. תעדוף: critical > high > medium > low
5. צור עד 10 משימות ממוקדות עם מספרים ספציפיים

## קריטי: השתמש רק ב-URLs אמיתיים!
- כל URL במשימה חייב להיות מהרשימות שקיבלת (מאמרים או מילות מפתח)
- אל תמציא URLs חדשים! אם אין URL מתאים, השאר את שדה ה-url ריק
- אם אתה ממליץ ליצור דף חדש, כתוב זאת בתיאור המשימה אבל אל תמציא URL

החזר JSON בלבד:
{"healthScore":75,"tasks":[{"type":"סוג מטבלת הסוגים","title":"תיאור קצר","description":"הסבר מפורט עם מספרים מהנתונים","url":"URL של הדף","keyword":"מילת מפתח","priority":"critical|high|medium|low"}],"summary":"סיכום 2-3 משפטים על מצב SEO כללי + ההזדמנות הגדולה ביותר"}`;

    const stdout = await runClaude(prompt);

    // Parse Claude CLI JSON output
    let resultText = "";
    try {
      const parsed = JSON.parse(stdout);
      resultText = parsed?.result || stdout;
    } catch {
      resultText = stdout;
    }

    // Extract JSON from response
    const patterns = [
      /```json\n([\s\S]*?)\n```/,
      /```\n(\{[\s\S]*?\})\n```/,
      /(\{[\s\S]*"tasks"[\s\S]*\})/,
    ];

    for (const pattern of patterns) {
      const match = resultText.match(pattern);
      if (match?.[1]) {
        try {
          const json = JSON.parse(match[1]);
          if (json.tasks) {
            const tasks = json.tasks.map((t: Record<string, string>, i: number) => ({
              ...t,
              id: `seo-task-${Date.now()}-${i}`,
              status: "pending" as const,
              createdAt: new Date().toISOString(),
            }));
            return NextResponse.json({ tasks, summary: json.summary || "" });
          }
        } catch { /* try next pattern */ }
      }
    }

    // Try parsing the entire text as JSON
    try {
      const json = JSON.parse(resultText);
      if (json.tasks) {
        const tasks = json.tasks.map((t: Record<string, string>, i: number) => ({
          ...t,
          id: `seo-task-${Date.now()}-${i}`,
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        }));
        return NextResponse.json({ tasks, summary: json.summary || "" });
      }
    } catch { /* not valid JSON */ }

    return NextResponse.json(
      { error: "לא הצלחתי לחלץ משימות", detail: resultText.slice(0, 300) },
      { status: 500 }
    );
  } catch (err) {
    console.error("SEO tasks error:", err);
    const msg = err instanceof Error ? err.message : "Task generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
