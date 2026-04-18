// src/app/ad-dashboard/seo/seo-strategy.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { GLASS, GLASS_HOVER } from "../lib/constants";
import type { SeoConnections, SCKeyword, SCPageData, WPArticle } from "../lib/seo-types";

interface StrategyProps {
  connections: SeoConnections;
  keywords: SCKeyword[];
  articles: WPArticle[];
  scPages: SCPageData[];
}

interface QuickWin {
  type: string;
  targetPageUrl: string;
  targetPageTitle: string;
  description: string;
  anchorText: string;
  anchorType: string;
}

interface ClusterArticle {
  title: string;
  keyword: string;
  intent: string;
  funnel: string;
  angle: string;
  priorityScore: number;
  isExisting: boolean;
  existingUrl: string | null;
  publishWeek: number;
  anchorText: string;
  anchorType: string;
  wordCount?: number;
}

interface Strategy {
  pageAnalysis: {
    title: string;
    intent: string;
    audience: string;
    mainTopic: string;
    isExternalDomain: boolean;
    domainWarning: string | null;
  };
  topicalAuthority: {
    isExisting: boolean;
    strength: string;
    relatedNiches: string[];
    recommendation: string;
  };
  keywords: {
    keyword: string;
    intent: string;
    funnel: string;
    scClicks: number;
    scPosition: number;
    priorityScore: number;
    cannibalizationUrl: string | null;
    cannibalizationAction: string | null;
  }[];
  quickWins: QuickWin[];
  cluster: {
    pillar: ClusterArticle;
    satellites: ClusterArticle[];
  };
  kpis: {
    targetClicks3m: number;
    targetClicks6m: number;
    targetArticles: number;
    targetKeywordsPage1: number;
    nextReviewDate: string;
  };
  timeline: {
    week1_2: string;
    month1_2: string;
    month3_6: string;
    month6_12: string;
  };
  summary: string;
}

const INTENT_LABELS: Record<string, { color: string; label: string }> = {
  informational: { color: "bg-blue-100 text-blue-700", label: "מידע" },
  commercial: { color: "bg-purple-100 text-purple-700", label: "השוואה" },
  transactional: { color: "bg-green-100 text-green-700", label: "קנייה" },
};

const FUNNEL_LABELS: Record<string, { color: string; label: string }> = {
  awareness: { color: "bg-sky-100 text-sky-700", label: "מודעות" },
  consideration: { color: "bg-amber-100 text-amber-700", label: "שקילה" },
  decision: { color: "bg-emerald-100 text-emerald-700", label: "החלטה" },
};

const AUTHORITY_COLORS: Record<string, string> = {
  strong: "bg-green-50 border-green-200 text-green-800",
  moderate: "bg-blue-50 border-blue-200 text-blue-800",
  weak: "bg-amber-50 border-amber-200 text-amber-800",
  none: "bg-red-50 border-red-200 text-red-800",
};

export function SeoStrategy({ connections, keywords, articles, scPages }: StrategyProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved strategy from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("seo_strategy");
      if (saved) {
        const parsed = JSON.parse(saved);
        setStrategy(parsed.strategy);
        setUrl(parsed.url);
      }
    } catch { /* no saved strategy */ }
  }, []);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  const generateStrategy = async (retryCount = 0) => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ad-dashboard/seo/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: url,
          googleToken: connections.google.accessToken,
          googleSiteUrl: connections.google.siteUrl,
          ga4PropertyId: connections.google.propertyId,
          scKeywords: keywords,
          scPages: scPages,
          wpArticles: articles,
        }),
      });
      const data = await res.json();
      if (data.success && data.strategy) {
        setStrategy(data.strategy);
        localStorage.setItem("seo_strategy", JSON.stringify({ url, strategy: data.strategy, createdAt: new Date().toISOString() }));
      } else if (data.canRetry && retryCount < 1) {
        // Auto-retry once on timeout
        setLoading(false);
        return generateStrategy(retryCount + 1);
      } else {
        setError(data.error || "לא הצלחתי לבנות אסטרטגיה");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Strategy failed");
    } finally {
      setLoading(false);
    }
  };

  const STEPS = [
    { at: 0, label: "סורק את הדף...", pct: 5 },
    { at: 8, label: "שולף נתוני Search Console...", pct: 10 },
    { at: 15, label: "ממפה סמכות נושאית...", pct: 20 },
    { at: 30, label: "מחקר מילות מפתח...", pct: 30 },
    { at: 50, label: "בודק קניבליזציה...", pct: 40 },
    { at: 75, label: "בונה Cluster תוכן...", pct: 55 },
    { at: 100, label: "מגדיר Quick Wins...", pct: 65 },
    { at: 130, label: "כותב אסטרטגיה מפורטת...", pct: 75 },
    { at: 170, label: "מסכם ובונה timeline...", pct: 85 },
    { at: 220, label: "כמעט מסיים...", pct: 92 },
    { at: 300, label: "עדיין עובד... אסטרטגיה מלאה לוקחת זמן", pct: 95 },
    { at: 400, label: "מנסה שוב אם צריך...", pct: 97 },
  ];

  // Loading state
  if (loading) {
    const currentStep = [...STEPS].reverse().find(s => elapsed >= s.at) || STEPS[0];
    return (
      <div className={`${GLASS} p-8`}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm font-medium text-gray-700">{currentStep.label}</p>
          <div className="w-full max-w-md">
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div className="h-2 rounded-full bg-emerald-500 transition-all duration-1000" style={{ width: `${currentStep.pct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-gray-400">
              <span>{currentStep.pct}%</span>
              <span>{String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400">אסטרטגיה מלאה לוקחת 2-5 דקות</p>
        </div>
      </div>
    );
  }

  // Input state (no strategy yet)
  if (!strategy) {
    return (
      <div className="space-y-4">
        <div className={`${GLASS} p-6`}>
          <h3 className="text-base font-semibold text-gray-800 mb-2">🎯 בנה אסטרטגיית קידום</h3>
          <p className="text-xs text-gray-500 mb-4">הכנס את ה-URL של הדף שאתה רוצה לקדם. אני אנתח את הדף, אבדוק מה כבר עובד באתר שלך, ואבנה תוכנית פעולה מלאה.</p>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/my-landing-page"
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-300"
              dir="ltr"
            />
            <button
              onClick={generateStrategy}
              disabled={!url.trim()}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
            >
              נתח ובנה אסטרטגיה
            </button>
          </div>
          {error && <div className="mt-3 text-xs text-red-600">{error}</div>}
        </div>
      </div>
    );
  }

  // Strategy display
  const s = strategy;

  return (
    <div className="space-y-5">
      {/* Header with URL + reset */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">🎯 אסטרטגיית קידום</h3>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">{url}</a>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setStrategy(null); localStorage.removeItem("seo_strategy"); }}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            אסטרטגיה חדשה
          </button>
          <button
            onClick={() => alert("בקרוב — ביצוע כל האסטרטגיה בלחיצה")}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            🚀 בצע הכל עם Claude
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className={`${GLASS} border-emerald-200 bg-emerald-50/50 p-4`}>
        <p className="text-sm text-gray-700">{s.summary}</p>
      </div>

      {/* Section 1: Page Analysis */}
      <div className={`${GLASS} p-5`}>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">1. ניתוח הדף</h4>
        <p className="text-[11px] text-gray-400 mb-3">מה יש בדף שאתה רוצה לקדם — על מה הוא, למי הוא מיועד, ומה המטרה שלו</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-[10px] text-gray-500">מוצר/שירות</div>
            <div className="text-sm font-medium text-gray-800">{s.pageAnalysis.title}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-[10px] text-gray-500">כוונת הדף</div>
            <div className="text-sm font-medium text-gray-800">{s.pageAnalysis.intent === "sale" ? "מכירה" : s.pageAnalysis.intent === "registration" ? "רישום" : "מידע"}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-[10px] text-gray-500">קהל יעד</div>
            <div className="text-sm font-medium text-gray-800">{s.pageAnalysis.audience}</div>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <div className="text-[10px] text-gray-500">נושא מרכזי</div>
            <div className="text-sm font-medium text-gray-800">{s.pageAnalysis.mainTopic}</div>
          </div>
        </div>
        {s.pageAnalysis.domainWarning && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
            ⚠️ {s.pageAnalysis.domainWarning}
          </div>
        )}
      </div>

      {/* Section 2: Topical Authority */}
      <div className={`${GLASS} p-5`}>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">2. סמכות נושאית</h4>
        <p className="text-[11px] text-gray-400 mb-3">האם גוגל כבר מכיר אותך כמומחה בנושא הזה? אם כן — קל יותר לדרג. אם לא — צריך לבנות אמון קודם</p>
        <div className={`rounded-lg border p-4 ${AUTHORITY_COLORS[s.topicalAuthority.strength] || AUTHORITY_COLORS.none}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{s.topicalAuthority.strength === "strong" ? "💪" : s.topicalAuthority.strength === "moderate" ? "👍" : s.topicalAuthority.strength === "weak" ? "⚠️" : "🔴"}</span>
            <span className="text-sm font-semibold">
              {s.topicalAuthority.strength === "strong" ? "האתר חזק בנושא הזה" :
               s.topicalAuthority.strength === "moderate" ? "יש בסיס, צריך חיזוק" :
               s.topicalAuthority.strength === "weak" ? "נושא חלש — צריך לבנות סמכות" :
               "נושא חדש לגמרי — תהליך ארוך"}
            </span>
          </div>
          <p className="text-xs">{s.topicalAuthority.recommendation}</p>
          {s.topicalAuthority.relatedNiches.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {s.topicalAuthority.relatedNiches.map(n => (
                <span key={n} className="rounded bg-white/50 px-2 py-0.5 text-[10px]">{n}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Keywords */}
      <div className={`${GLASS} p-5`}>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">3. מילות מפתח ({s.keywords.length})</h4>
        <p className="text-[11px] text-gray-400 mb-3">מה אנשים מחפשים בגוגל שקשור לדף שלך — ואילו מילים שווה לטרגט</p>
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="px-3 py-2 text-right font-medium">מילה</th>
                <th className="px-3 py-2 text-right font-medium">Intent</th>
                <th className="px-3 py-2 text-right font-medium">משפך</th>
                <th className="px-3 py-2 text-right font-medium">קליקים</th>
                <th className="px-3 py-2 text-right font-medium">מיקום</th>
                <th className="px-3 py-2 text-right font-medium">ציון</th>
              </tr>
            </thead>
            <tbody>
              {s.keywords.map((k, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {k.keyword}
                    {k.cannibalizationUrl && (
                      <span className="block text-[10px] text-amber-500">⚠️ {k.cannibalizationAction || "קניבליזציה"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${INTENT_LABELS[k.intent]?.color || "bg-gray-100 text-gray-600"}`}>
                      {INTENT_LABELS[k.intent]?.label || k.intent}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${FUNNEL_LABELS[k.funnel]?.color || "bg-gray-100 text-gray-600"}`}>
                      {FUNNEL_LABELS[k.funnel]?.label || k.funnel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{k.scClicks || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{k.scPosition ? k.scPosition.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      k.priorityScore >= 8 ? "bg-green-100 text-green-700" :
                      k.priorityScore >= 5 ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>{k.priorityScore}/10</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Quick Wins */}
      {s.quickWins.length > 0 && (
        <div className={`${GLASS} p-5`}>
          <h4 className="text-sm font-semibold text-gray-700 mb-1">4. שיפורים מיידיים — תוצאות תוך ימים</h4>
          <p className="text-[11px] text-gray-400 mb-3">דברים קטנים שאפשר לתקן עכשיו ולראות שיפור מהר. לינקים מדפים קיימים, תיאורים חסרים, ועוד</p>
          <div className="space-y-2">
            {s.quickWins.map((qw, i) => (
              <div key={i} className={`${GLASS_HOVER} rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-3`}>
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-800">{qw.description}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {qw.targetPageTitle} | Anchor: &quot;{qw.anchorText}&quot; ({qw.anchorType})
                  </div>
                </div>
                <button className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
                  בצע עם Claude
                </button>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${
                  qw.type === "add_link" ? "bg-blue-100 text-blue-700" :
                  qw.type === "update_meta" ? "bg-purple-100 text-purple-700" :
                  "bg-emerald-100 text-emerald-700"
                }`}>
                  {qw.type === "add_link" ? "🔗 לינק" : qw.type === "update_meta" ? "📝 Meta" : "🏗️ Schema"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 5: Content Cluster */}
      <div className={`${GLASS} p-5`}>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">5. תוכנית תוכן — מאמרים שיביאו טראפיק</h4>
        <p className="text-[11px] text-gray-400 mb-3">מאמרים שגוגל ידרג גבוה ויביאו אנשים לדף שלך. כל מאמר מכוון למילת חיפוש אחרת ומקשר לדף הנחיתה</p>

        {/* Pillar */}
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50/30 p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">PILLAR</span>
            <span className="text-sm font-semibold text-gray-800">{s.cluster.pillar.title}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className={`rounded-full px-1.5 py-0.5 ${INTENT_LABELS[s.cluster.pillar.intent]?.color || ""}`}>{INTENT_LABELS[s.cluster.pillar.intent]?.label}</span>
            <span className="text-gray-500">מילה: {s.cluster.pillar.keyword}</span>
            <span className="text-gray-500">{s.cluster.pillar.wordCount || 2000}+ מילים</span>
          </div>
          <p className="text-[11px] text-gray-600 mt-1">זווית: {s.cluster.pillar.angle}</p>
          <button className="mt-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-[10px] font-semibold text-white hover:bg-emerald-700">
            ✍️ כתוב מאמר Pillar עם Claude
          </button>
        </div>

        {/* Satellites */}
        <div className="space-y-2">
          {s.cluster.satellites.map((sat, i) => (
            <div key={i} className={`rounded-lg border border-gray-200 p-3 ${sat.isExisting ? "bg-blue-50/30" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">שבוע {sat.publishWeek}</span>
                    {sat.isExisting && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">קיים — לעדכן</span>}
                    {!sat.isExisting && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-600">חדש</span>}
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${FUNNEL_LABELS[sat.funnel]?.color || ""}`}>{FUNNEL_LABELS[sat.funnel]?.label}</span>
                  </div>
                  <div className="text-xs font-medium text-gray-800 mt-1">{sat.title}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    מילה: {sat.keyword} | זווית: {sat.angle}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Anchor: &quot;{sat.anchorText}&quot; ({sat.anchorType})
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {!sat.isExisting && (
                    <button className="shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
                      ✍️ כתוב
                    </button>
                  )}
                  {sat.isExisting && (
                    <button className="shrink-0 rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100">
                      🔄 עדכן
                    </button>
                  )}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    sat.priorityScore >= 8 ? "bg-green-100 text-green-700" :
                    sat.priorityScore >= 5 ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>{sat.priorityScore}/10</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 6: KPIs + Timeline */}
      <div className={`${GLASS} p-5`}>
        <h4 className="text-sm font-semibold text-gray-700 mb-1">6. מה צפוי לקרות ומתי</h4>
        <p className="text-[11px] text-gray-400 mb-3">קידום אורגני לוקח זמן, אבל התוצאות מצטברות. הנה מה לצפות בכל שלב</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
          <div className="rounded-lg bg-emerald-50 p-3 text-center">
            <div className="text-xl font-bold text-emerald-700">{s.kpis.targetClicks3m}</div>
            <div className="text-[10px] text-emerald-600">קליקים ב-3 חודשים</div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 text-center">
            <div className="text-xl font-bold text-emerald-700">{s.kpis.targetClicks6m}</div>
            <div className="text-[10px] text-emerald-600">קליקים ב-6 חודשים</div>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-center">
            <div className="text-xl font-bold text-blue-700">{s.kpis.targetArticles}</div>
            <div className="text-[10px] text-blue-600">מאמרים לפרסם</div>
          </div>
          <div className="rounded-lg bg-purple-50 p-3 text-center">
            <div className="text-xl font-bold text-purple-700">{s.kpis.targetKeywordsPage1}</div>
            <div className="text-[10px] text-purple-600">מילים בעמוד 1</div>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          {[
            { label: "שבוע 1-2", text: s.timeline.week1_2, color: "border-r-emerald-500" },
            { label: "חודש 1-2", text: s.timeline.month1_2, color: "border-r-blue-500" },
            { label: "חודש 3-6", text: s.timeline.month3_6, color: "border-r-purple-500" },
            { label: "חודש 6-12", text: s.timeline.month6_12, color: "border-r-amber-500" },
          ].map((phase) => (
            <div key={phase.label} className={`rounded-lg border border-gray-200 border-r-4 ${phase.color} p-3 flex items-center gap-3`}>
              <span className="text-xs font-semibold text-gray-600 w-20 shrink-0">{phase.label}</span>
              <span className="text-xs text-gray-700">{phase.text}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 text-[11px] text-gray-400 text-center">
          בדיקה הבאה: {s.kpis.nextReviewDate}
        </div>
      </div>
    </div>
  );
}
