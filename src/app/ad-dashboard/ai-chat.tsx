"use client";

import { useState, useRef, useEffect } from "react";
import type { Summary, Account, Settings } from "./lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatProps {
  sum: Summary;
  accounts: Account[];
  settings: Settings;
}

const SUGGESTED_QUESTIONS = [
  "באיזה שעה הכי כדאי לפרסם?",
  "באיזה יום הכי משתלם לי?",
  "מה המסקנות העיקריות מהנתונים?",
  "איפה אני מבזבז כסף?",
  "מה ה-ROAS שלי ואיך לשפר?",
];

export function AIChatPanel({ sum, accounts, settings }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      inputRef.current?.focus();
    }
  }, [isOpen, messages.length]);

  const buildContext = () => {
    // Build a concise data snapshot for the AI
    const accountSummaries = accounts.map((acc) => {
      const days = acc.days.filter((d) => d.adSpend > 0);
      const totalSpend = days.reduce((s, d) => s + d.adSpend, 0);
      const totalRevenue = days.reduce((s, d) => s + d.revenue, 0);
      const totalClicks = days.reduce((s, d) => s + d.uniqueClicks, 0);
      const totalImpressions = days.reduce((s, d) => s + d.impressions, 0);
      const totalRegistrations = days.reduce((s, d) => s + d.registrations, 0);
      const totalPurchases = days.reduce((s, d) => s + d.purchases, 0);
      const totalLPV = days.reduce((s, d) => s + d.landingPageViews, 0);

      // Best/worst days by profit
      const dayProfits = days.map((d) => ({
        date: d.date,
        dayOfWeek: new Date(d.date).toLocaleDateString("he-IL", { weekday: "long" }),
        hour: new Date(d.date).getHours(),
        spend: d.adSpend,
        revenue: d.revenue,
        profit: d.revenue / (1 + settings.vatRate / 100) - d.adSpend,
        roas: d.adSpend > 0 ? d.revenue / d.adSpend : 0,
        clicks: d.uniqueClicks,
        registrations: d.registrations,
        purchases: d.purchases,
      }));

      // Group by day of week
      const byDay: Record<string, { spend: number; revenue: number; count: number }> = {};
      for (const d of dayProfits) {
        if (!byDay[d.dayOfWeek]) byDay[d.dayOfWeek] = { spend: 0, revenue: 0, count: 0 };
        byDay[d.dayOfWeek].spend += d.spend;
        byDay[d.dayOfWeek].revenue += d.revenue;
        byDay[d.dayOfWeek].count += 1;
      }

      return {
        name: acc.name,
        metaAccountId: acc.metaAccountId,
        activeDays: days.length,
        totalSpend: Math.round(totalSpend),
        totalRevenue: Math.round(totalRevenue),
        totalClicks,
        totalImpressions,
        totalRegistrations,
        totalPurchases,
        totalLPV,
        roas: totalSpend > 0 ? +(totalRevenue / totalSpend).toFixed(2) : 0,
        performanceByDay: Object.entries(byDay).map(([day, data]) => ({
          day,
          avgSpend: Math.round(data.spend / data.count),
          avgRevenue: Math.round(data.revenue / data.count),
          avgRoas: data.spend > 0 ? +(data.revenue / data.spend).toFixed(2) : 0,
          count: data.count,
        })),
        dailyData: dayProfits.slice(-14), // Last 14 active days
      };
    });

    return {
      period: `${settings.month}/${settings.year}`,
      businessName: settings.businessName,
      vatRate: settings.vatRate,
      breakEvenRoas: settings.breakEvenRoas,
      campaignGoal: settings.campaignGoal,
      overall: {
        totalSpend: Math.round(sum.totalSpend),
        totalRevenue: Math.round(sum.totalRevenue),
        totalNetProfit: Math.round(sum.totalNetProfit),
        roas: +sum.overallRoas.toFixed(2),
        roi: +sum.overallRoi.toFixed(1),
        avgCpc: +sum.avgCpc.toFixed(2),
        avgCpm: +sum.avgCpm.toFixed(2),
        avgCtr: +sum.avgCtr.toFixed(2),
        totalRegistrations: sum.totalRegistrations,
        totalPurchases: sum.totalPurchases,
        avgCpa: +sum.avgCpa.toFixed(2),
        activeDays: sum.activeDays,
        profitableDays: sum.profitableDays,
        bestDay: sum.bestDay,
        worstDay: sum.worstDay,
      },
      accounts: accountSummaries,
    };
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ad-dashboard/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text.trim(),
          context: buildContext(),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `שגיאה: ${data.error}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "שגיאה בחיבור לשרת. נסה שוב." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 ${
          isOpen
            ? "bg-gray-800 text-white"
            : "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
        }`}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 left-6 z-50 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-gray-100 bg-gradient-to-l from-blue-50 to-purple-50 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm text-white">
              AI
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">שאל את הנתונים</h3>
              <p className="text-[11px] text-gray-500">AI שמנתח את הדשבורד שלך</p>
            </div>
            <button
              onClick={() => {
                setMessages([]);
              }}
              className="mr-auto text-[11px] text-gray-400 hover:text-gray-600"
            >
              נקה צ׳אט
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3" dir="rtl">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="mb-3 text-center text-xs text-gray-400">
                  שאל שאלה על הנתונים שלך
                </p>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="block w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-right text-xs text-gray-700 transition-all hover:border-blue-200 hover:bg-blue-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`mb-3 ${msg.role === "user" ? "flex justify-start" : ""}`}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue-500 px-3.5 py-2 text-sm text-white">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2.5 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {msg.content}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl bg-gray-100 px-3.5 py-2.5">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                </div>
                <span className="text-xs text-gray-400">מנתח...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2.5"
            dir="rtl"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל שאלה על הנתונים..."
              disabled={isLoading}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none transition-all focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-white transition-all hover:bg-blue-600 disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
