// src/app/api/ad-dashboard/seo/strategy/route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
// Using inline focused prompt instead of full SEO_EXPERT_SYSTEM_PROMPT to reduce size

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "-", "--output-format", "json", "--model", "sonnet"], {
      timeout: 600_000, // 10 minutes — strategy is complex
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

function stripHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMeta(html: string): { title: string; description: string; h1: string[]; h2: string[] } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => stripHtml(m[1]));
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => stripHtml(m[1]));
  return {
    title: titleMatch ? stripHtml(titleMatch[1]) : "",
    description: descMatch ? descMatch[1] : "",
    h1: h1Matches.slice(0, 5),
    h2: h2Matches.slice(0, 10),
  };
}

export async function POST(request: NextRequest) {
  try {
    const { targetUrl, googleToken, googleSiteUrl, ga4PropertyId, scKeywords, scPages, wpArticles } = await request.json();

    void googleToken;
    void ga4PropertyId;

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing target URL" }, { status: 400 });
    }

    // Step 1: Fetch and analyze the target page
    let pageContent = "";
    let pageMeta = { title: "", description: "", h1: [] as string[], h2: [] as string[] };
    let pageWordCount = 0;

    try {
      const pageRes = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SEO-Dashboard/1.0)" },
        redirect: "follow",
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        pageMeta = extractMeta(html);
        pageContent = stripHtml(html).slice(0, 3000);
        pageWordCount = pageContent.split(/\s+/).length;
      }
    } catch {
      pageContent = "(לא הצלחתי לסרוק את הדף)";
    }

    // Step 2: Get SC data for related keywords from main site
    const relatedKeywords = (scKeywords || []).slice(0, 30).map((k: { query: string; clicks: number; impressions: number; position: number; ctr: number }) => ({
      q: k.query,
      clicks: k.clicks,
      imp: k.impressions,
      pos: Math.round(k.position * 10) / 10,
      ctr: Math.round((k.ctr || 0) * 10000) / 100,
    }));

    // Step 3: Get existing articles from WP
    const existingArticles = (wpArticles || []).slice(0, 20).map((a: { title: string; url: string; clicks?: number }) => ({
      title: a.title?.slice(0, 80),
      url: a.url,
      clicks: a.clicks || 0,
    }));

    // Step 4: Get SC pages for cannibalization check
    const existingPages = (scPages || []).slice(0, 30).map((p: { page: string; clicks: number; position: number }) => ({
      url: p.page,
      clicks: p.clicks,
      pos: Math.round(p.position * 10) / 10,
    }));

    // Detect if external domain
    const mainDomain = googleSiteUrl?.replace(/https?:\/\//, "").replace(/\/$/, "") || "";
    const targetDomain = targetUrl.replace(/https?:\/\//, "").split("/")[0];
    const isExternalDomain = mainDomain && !targetDomain.includes(mainDomain.replace("sc-domain:", ""));

    // Step 5: Build prompt for Claude
    const prompt = `אתה אסטרטג SEO מומחה (רמת Enterprise, 2026). בנה אסטרטגיית קידום אורגני בעברית. אל תשתמש ב-em dash.

## ידע מקצועי שחייב להנחות אותך

CTR Benchmarks: pos 1=25-35%, pos 2=12-18%, pos 3=8-12%, pos 4-5=5-8%, pos 6-10=2-5%, pos 11-20=0.5-2%

E-E-A-T (2025): Experience 20%, Expertise 25%, Authoritativeness 25%, Trustworthiness 30%. כל מאמר חייב: ניסיון אישי, מספרים מהשטח, credentials.

Content minimums: בלוג 1,500 מילים, שירות 800, מוצר 400, pillar 2,000+

Schema 2026 ACTIVE: Article, Person, Organization, BreadcrumbList, Product, Review. DEPRECATED: HowTo, FAQPage (רק ממשלה/בריאות).

Topical Authority: גוגל מדרג clusters לא מאמרים בודדים. Pillar + 5-8 satellites = סמכות.

Title: 40-60 תווים, מילת מפתח בהתחלה, שנה אם רלוונטי. Meta: 120-160, CTA + הוכחה חברתית.

Anchor text: 30% branded, 30% partial match, 20% natural, 20% exact match. לעולם לא 100% exact.

ציון תעדוף (1-10): קושי נמוך × טראפיק פוטנציאלי × קרבה להמרה.

משפך: awareness (informational) → consideration (commercial) → decision (transactional). כל שלב מקשר לבא.

## הדף לקידום

URL: ${targetUrl}
${isExternalDomain ? `⚠️ דומיין חיצוני (${targetDomain}) — לא ניתן לדרג ישירות. יש לקדם דרך האתר הראשי (${mainDomain}).` : ""}
כותרת: "${pageMeta.title}"
Meta Description: "${pageMeta.description}"
H1: ${pageMeta.h1.length > 0 ? pageMeta.h1.join(" | ") : "(אין)"}
H2: ${pageMeta.h2.length > 0 ? pageMeta.h2.join(" | ") : "(אין)"}
מילים: ${pageWordCount}
תוכן (3000 תווים ראשונים): "${pageContent.slice(0, 2000)}"

## נתוני האתר הראשי (Search Console)

מילות מפתח שכבר מביאות טראפיק:
${JSON.stringify(relatedKeywords)}

דפים קיימים (לבדיקת קניבליזציה):
${JSON.stringify(existingPages)}

מאמרים קיימים ב-WordPress:
${JSON.stringify(existingArticles)}

## הוראות

בנה אסטרטגיה ב-6 שלבים. החזר JSON בלבד:

{
  "pageAnalysis": {
    "title": "שם הדף/מוצר",
    "intent": "sale|registration|info",
    "audience": "תיאור קהל יעד קצר",
    "mainTopic": "הנושא המרכזי",
    "isExternalDomain": ${isExternalDomain},
    "domainWarning": "הסבר אם דומיין חיצוני, או null"
  },
  "topicalAuthority": {
    "isExisting": true,
    "strength": "strong|moderate|weak|none",
    "relatedNiches": ["נישה 1", "נישה 2"],
    "recommendation": "הסבר: האם הנושא בתוך הסמכות הקיימת או חדש, ומה לעשות"
  },
  "keywords": [
    {
      "keyword": "מילת מפתח",
      "intent": "informational|commercial|transactional",
      "funnel": "awareness|consideration|decision",
      "scClicks": 0,
      "scPosition": 0,
      "priorityScore": 8,
      "cannibalizationUrl": null,
      "cannibalizationAction": null
    }
  ],
  "quickWins": [
    {
      "type": "add_link|update_meta|add_schema",
      "targetPageUrl": "URL של הדף לעדכון",
      "targetPageTitle": "שם הדף",
      "description": "מה לעשות",
      "anchorText": "טקסט הלינק המומלץ",
      "anchorType": "branded|partial_match|natural|exact_match"
    }
  ],
  "cluster": {
    "pillar": {
      "title": "כותרת מאמר Pillar (40-60 תווים)",
      "keyword": "מילת מפתח ראשית",
      "intent": "informational",
      "funnel": "awareness",
      "angle": "הזווית הייחודית מבוססת ניסיון/דאטא של בעל האתר",
      "wordCount": 2000,
      "isExisting": false,
      "existingUrl": null
    },
    "satellites": [
      {
        "title": "כותרת (40-60 תווים)",
        "keyword": "מילת מפתח",
        "intent": "commercial",
        "funnel": "consideration",
        "angle": "זווית ייחודית",
        "priorityScore": 8,
        "isExisting": false,
        "existingUrl": null,
        "publishWeek": 1,
        "anchorText": "טקסט לינק לדף הנחיתה",
        "anchorType": "partial_match"
      }
    ]
  },
  "kpis": {
    "targetClicks3m": 200,
    "targetClicks6m": 500,
    "targetArticles": 6,
    "targetKeywordsPage1": 3,
    "nextReviewDate": "2026-05-18"
  },
  "timeline": {
    "week1_2": "Quick Wins: לינקים + meta → שיפור תוך ימים",
    "month1_2": "מאמרים ראשונים מתאנדקסים → תנועה ראשונית",
    "month3_6": "Cluster בונה סמכות → צמיחה משמעותית",
    "month6_12": "דירוגים מתייצבים → ROI"
  },
  "summary": "סיכום אסטרטגי של 3-4 משפטים"
}

כללים:
- כל מילת מפתח חייבת להיות מבוססת על הנתונים (SC) או על ניתוח התוכן
- בדוק קניבליזציה: אם כבר יש דף שמדורג — "חזק קיים" לא "צור חדש"
- Quick wins רק על דפים שבאמת קיימים ב-WordPress
- Anchor text מגוון: 30% branded, 30% partial, 20% natural, 20% exact
- ציון תעדוף: קושי נמוך × טראפיק פוטנציאלי × קרבה להמרה
- אם דומיין חיצוני — SEO דרך האתר הראשי בלבד
- כתוב בעברית. אל תשתמש ב-em dash.`;

    const stdout = await runClaude(prompt);

    // Parse Claude response
    let resultText = "";
    try {
      const parsed = JSON.parse(stdout);
      resultText = parsed?.result || stdout;
    } catch {
      resultText = stdout;
    }

    // Extract JSON
    const patterns = [
      /```json\n([\s\S]*?)\n```/,
      /```\n(\{[\s\S]*?\})\n```/,
      /(\{[\s\S]*"pageAnalysis"[\s\S]*"cluster"[\s\S]*\})/,
    ];

    for (const pattern of patterns) {
      const match = resultText.match(pattern);
      if (match?.[1]) {
        try {
          const strategy = JSON.parse(match[1]);
          if (strategy.pageAnalysis && strategy.cluster) {
            return NextResponse.json({ success: true, strategy });
          }
        } catch { /* try next */ }
      }
    }

    try {
      const strategy = JSON.parse(resultText);
      if (strategy.pageAnalysis) {
        return NextResponse.json({ success: true, strategy });
      }
    } catch { /* not JSON */ }

    return NextResponse.json({ error: "לא הצלחתי לבנות אסטרטגיה. נסה שוב.", detail: resultText.slice(0, 300) }, { status: 500 });
  } catch (err) {
    console.error("Strategy error:", err);
    const msg = err instanceof Error ? err.message : "Strategy generation failed";
    const isTimeout = msg.includes("143") || msg.includes("SIGTERM");
    return NextResponse.json({
      error: isTimeout ? "הניתוח לקח יותר מדי זמן. נסה שוב." : msg,
      canRetry: isTimeout,
    }, { status: isTimeout ? 504 : 500 });
  }
}
