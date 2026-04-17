import { NextRequest, NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { generateText } from "@/lib/utils/anthropic-client";

export async function POST(request: NextRequest) {
  const session = await getSessionData();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { question, context } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    const systemPrompt = `אתה אנליסט שיווק דיגיטלי מומחה. אתה מנתח נתוני פרסום ממערכת Meta Ads ואינסטגרם.

כללים:
- כתוב בעברית טבעית, קצר וישיר
- תמיד תבסס תשובות על הנתונים שקיבלת
- תן תובנות אקשנביליות, לא רק מספרים
- אם אין מספיק נתונים לענות, אמור את זה בכנות
- אל תשתמש ב-em dash (—)
- השתמש באימוג'ים במידה לניווט ויזואלי
- כשנשאל על שעות/ימים מומלצים, תן תשובה ספציפית עם הסבר למה`;

    const prompt = `הנה נתוני הדשבורד הנוכחיים:

${JSON.stringify(context, null, 2)}

שאלת המשתמש: ${question}

ענה בצורה ישירה ומועילה. אם יש תובנה מפתיעה בנתונים, ציין אותה.`;

    const result = await generateText({
      prompt,
      systemPrompt,
      maxTokens: 2000,
      model: "sonnet",
    });

    if (result.error) {
      return NextResponse.json(
        { error: "לא הצלחתי לנתח. נסה שוב." },
        { status: 500 }
      );
    }

    return NextResponse.json({ answer: result.text });
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
