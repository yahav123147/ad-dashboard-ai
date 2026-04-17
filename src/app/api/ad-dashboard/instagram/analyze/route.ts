import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { generateJson } from "@/lib/utils/anthropic-client";

// ═══════════════════════════════════════════════════════════
// Instagram AI Analysis — Claude-powered
// ═══════════════════════════════════════════════════════════

interface PostData {
  caption: string;
  mediaType: string;
  likeCount: number;
  commentsCount: number;
  saved?: number;
  shares?: number;
  reach?: number;
  engagement?: number;
  timestamp: string;
}

function preparePostsForAI(posts: PostData[], limit = 25) {
  return posts.slice(0, limit).map((p, i) => {
    const reach = p.reach || 0;
    const date = new Date(p.timestamp);
    return {
      rank: i + 1,
      type: p.mediaType === "VIDEO" ? "ריל" : p.mediaType === "CAROUSEL_ALBUM" ? "קרוסלה" : "תמונה",
      caption: (p.caption || "").slice(0, 300),
      likes: p.likeCount,
      comments: p.commentsCount,
      saves: p.saved || 0,
      shares: p.shares || 0,
      reach,
      engagement: p.engagement || 0,
      savesRate: reach > 0 ? Number(((p.saved || 0) / reach * 100).toFixed(2)) : 0,
      sharesRate: reach > 0 ? Number(((p.shares || 0) / reach * 100).toFixed(2)) : 0,
      engRate: reach > 0 ? Number(((p.engagement || 0) / reach * 100).toFixed(2)) : 0,
      date: date.toISOString().slice(0, 10),
      day: date.toLocaleDateString("he-IL", { weekday: "long" }),
      hour: date.getHours(),
      daysAgo: Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)),
    };
  });
}

export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { posts, action, username, followersCount, bio, brandContext } = await request.json();

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ error: "No posts data provided" }, { status: 400 });
    }

    const postsData = preparePostsForAI(posts);

    const systemPrompt = `אתה אסטרטג תוכן מומחה לאינסטגרם. אתה מנתח חשבונות אינסטגרם של עסקים ויוצרי תוכן ישראליים.

כללים:
- כתוב בעברית טבעית, שפה ישירה ובטוחה
- היה ספציפי ומבוסס על הנתונים בלבד
- כשאתה כותב תוכן, חקה את הסגנון של הפוסטים המצליחים
- אל תשתמש ב-em dash
- החזר JSON בלבד, בלי הסברים מחוץ ל-JSON`;

    let prompt = "";

    if (action === "analyze") {
      prompt = `נתח את @${username} (${followersCount?.toLocaleString()} עוקבים).

הנה ${postsData.length} הפוסטים ממוינים לפי engagement:
${JSON.stringify(postsData, null, 2)}

החזר JSON בפורמט הזה בדיוק:
{
  "contentTypes": [
    {"type": "VIDEO", "label": "ריל", "count": 10, "avgEng": 500, "savesRate": 1.5, "sharesRate": 0.8}
  ],
  "bestContentType": {"type": "VIDEO", "label": "ריל", "avgEng": 500, "count": 10, "savesRate": 1.5},
  "bestDay": {"name": "שלישי", "avgEng": 600},
  "bestHour": {"hour": 10, "avgEng": 550},
  "worstDay": {"name": "שבת", "avgEng": 200},
  "engRate": {"value": 3.5, "benchmark": "טוב"},
  "savesRate": {"value": 1.2, "status": "טוב"},
  "sharesRate": {"value": 0.5, "status": "צריך שיפור"},
  "avgCaptionLength": 180,
  "bestPost": {"caption": "...", "engagement": 1000, "likes": 500, "comments": 50, "saves": 100, "type": "ריל"},
  "tips": ["טיפ ספציפי 1", "טיפ ספציפי 2", "טיפ ספציפי 3"],
  "hooks": ["ההוק הטוב ביותר מהפוסטים", "הוק שני"],
  "patternAnalysis": "פסקה של 2-3 משפטים שמסבירה את הדפוס המרכזי: מה עובד, למה, ומה הסגנון הייחודי של החשבון"
}

חשב את הנתונים מהפוסטים שקיבלת. ב-benchmark: מצוין/טוב/ממוצע/צריך שיפור. ב-tips: 3 המלצות ספציפיות עם מספרים מהנתונים.`;
    } else if (action === "generate") {
      const brandInfo = brandContext
        ? `\n\nהנה תיאור הפרסונל ברנד מבעל החשבון עצמו:\n"${brandContext}"\n`
        : "";
      const bioInfo = bio ? `\nביו באינסטגרם: "${bio}"` : "";

      prompt = `אתה אסטרטג תוכן בכיר ליוצרי תוכן ישראליים. המשימה שלך: לכתוב פוסטים ויראליים לאינסטגרם.

## שלב 1: הבן את הפרסונל ברנד
החשבון: @${username} (${followersCount?.toLocaleString()} עוקבים)${bioInfo}${brandInfo}

## שלב 2: נתח את הפוסטים המצליחים (לא לשכפל - ללמוד מהם!)
${JSON.stringify(postsData, null, 2)}

מהפוסטים, למד:
- את השפה והטון (מילים ספציפיות שחוזרות, סלנג, אורך משפטים)
- את ה-voice הייחודי (ישיר? רגשי? מקצועי? פרובוקטיבי?)
- מה הקהל מגיב אליו חזק (saves = ערך, shares = הזדהות, comments = ויכוח)

## שלב 3: חשוב מה חם עכשיו
מגמות תוכן באינסטגרם 2025-2026:
- ריל 15-30 שניות עם הוק ב-3 שניות הראשונות
- "edutainment" - ללמד בצורה מבדרת
- hot takes ודעות שנויות במחלוקת
- "myth busting" - לשבור מיתוסים בנישה
- "day in my life" ו-BTS אותנטי
- "you're doing X wrong" - להראות את הדרך הנכונה
- קרוסלות "save-worthy" עם ערך מעשי
- storytelling עם twist בסוף

## שלב 4: צור 5 רעיונות ויראליים

כל רעיון חייב להיות:
1. רלוונטי לנישה ולקהל של @${username} עכשיו (לא שכפול של פוסט ישן)
2. עם הוק שעוצר גלילה - ספציפי, מפתיע, יוצר סקרנות
3. כיתוב מלא מוכן להעתקה - בשפה ובטון של @${username}
4. מבנה ויראלי: הוק > בניית מתח > ערך > CTA
5. מבוסס על מגמה חמה + מה שעובד לחשבון הזה

החזר JSON:
{
  "brandIdentity": "2-3 משפטים: מי הוא, מה הנישה, מה הטון הייחודי, מי הקהל שלו",
  "voiceAnalysis": "משפט שמתאר את הסגנון: מילים ספציפיות שהוא משתמש, אורך אופייני, טון",
  "ideas": [
    {
      "title": "שם קצר וקליט",
      "type": "ריל / קרוסלה / תמונה",
      "trend": "על איזה מגמה/פורמט חם זה מבוסס",
      "hook": "שורת הפתיחה - 10-15 מילים מקסימום. חייבת לעצור גלילה.",
      "caption": "הכיתוב המלא. 150-250 מילים. מוכן להעתקה ישירה. בשפה של @${username}. מבנה: הוק חזק > 2-3 פסקאות עם ערך > CTA. שבירות שורה קצרות. אמוג'ים רק אם הוא משתמש.",
      "cta": "קריאה לפעולה שמייצרת אנגייג'מנט (שאלה / תייגו / שמרו / שתפו)",
      "bestTime": "יום + שעה (מבוסס על הנתונים)",
      "reason": "למה זה יעבוד: איזו מגמה + למה הקהל הספציפי הזה יגיב"
    }
  ]
}

חשוב: אל תכתוב תוכן גנרי. כל כיתוב צריך להרגיש כאילו @${username} כתב את זה, עם תוכן חדש ורלוונטי, לא שכפול.`;
    } else if (action === "weekly") {
      // Filter to recent posts only (last 30 days)
      const recentPosts = postsData.filter(p => p.daysAgo <= 30);
      const thisWeekPosts = postsData.filter(p => p.daysAgo <= 7);
      const today = new Date().toISOString().slice(0, 10);

      prompt = `צור דו"ח תקופתי ל-@${username} (${followersCount?.toLocaleString()} עוקבים).
היום: ${today}

פוסטים מ-7 הימים האחרונים (${thisWeekPosts.length} פוסטים):
${thisWeekPosts.length > 0 ? JSON.stringify(thisWeekPosts, null, 2) : "אין פוסטים מהשבוע האחרון."}

פוסטים מ-30 הימים האחרונים (${recentPosts.length} פוסטים):
${recentPosts.length > 0 ? JSON.stringify(recentPosts, null, 2) : "אין פוסטים מהחודש האחרון."}

כל הפוסטים (לניתוח דפוסים כלליים):
${JSON.stringify(postsData, null, 2)}

שים לב: כל פוסט כולל שדה "daysAgo" (כמה ימים עברו מהפרסום) ו-"date" (תאריך). השתמש בנתונים האלה כדי לדעת מה באמת אחרון.

${thisWeekPosts.length === 0 ? "אין פוסטים מהשבוע האחרון - התייחס לזה בדו\"ח והמלץ על תדירות פרסום." : ""}

החזר JSON:
{
  "weeklyStats": {"reach": 0, "engagement": 0, "saves": 0, "shares": 0, "postsCount": ${thisWeekPosts.length}, "avgEng": 0, "period": "7 ימים אחרונים"},
  "weeklyBestPost": ${thisWeekPosts.length > 0 ? '{"caption": "...", "engagement": 0, "type": "ריל", "date": "YYYY-MM-DD"}' : "null"},
  "weeklyImprove": "משפט אחד ספציפי עם מספרים",
  "weeklyInsight": "תובנה מפתיעה אחת מהנתונים",
  "postingFrequency": "${thisWeekPosts.length} פוסטים בשבוע האחרון${thisWeekPosts.length < 3 ? " - מומלץ להעלות ל-3-5 פוסטים בשבוע" : ""}",
  "weeklyPlan": [
    {"day": "שלישי", "time": "10:00", "type": "ריל", "topic": "נושא ספציפי", "hookIdea": "רעיון להוק"}
  ]
}

חשב weeklyStats רק מהפוסטים מ-7 הימים האחרונים. weeklyPlan = 3 פוסטים לשבוע הבא.`;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const result = await generateJson({
      prompt,
      systemPrompt,
      maxTokens: 6000,
      model: "sonnet",
    });

    if (result.json) {
      return NextResponse.json({ ...result.json, action });
    }

    // If JSON parsing failed, return error
    return NextResponse.json(
      { error: "לא הצלחתי לנתח את הנתונים. נסה שוב." },
      { status: 500 }
    );
  } catch (err) {
    console.error("Instagram analyze error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
