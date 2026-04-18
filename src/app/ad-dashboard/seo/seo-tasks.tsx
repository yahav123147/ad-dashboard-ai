"use client";

import { useState, useEffect, useRef } from "react";
import { GLASS, GLASS_HOVER } from "../lib/constants";
import type { SeoTask, SeoTaskStatus, SeoConnections } from "../lib/seo-types";
import { SEO_TASK_TYPE_LABELS } from "../lib/seo-types";

const STATUS_STYLES: Record<SeoTaskStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-gray-100", text: "text-gray-600", label: "ממתין" },
  running: { bg: "bg-blue-100", text: "text-blue-700", label: "בביצוע" },
  done: { bg: "bg-amber-100", text: "text-amber-700", label: "ממתין לאישור" },
  approved: { bg: "bg-green-100", text: "text-green-700", label: "✅ אושר" },
  error: { bg: "bg-red-100", text: "text-red-600", label: "שגיאה" },
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-r-4 border-r-red-400",
  medium: "border-r-4 border-r-amber-400",
  low: "border-r-4 border-r-gray-300",
};

interface SeoTasksProps {
  tasks: SeoTask[];
  loading: boolean;
  connections: SeoConnections;
  onTaskUpdate: (taskId: string, updates: Partial<SeoTask>) => void;
  summary?: string;
}

export function SeoTasks({ tasks, loading, connections, onTaskUpdate, summary }: SeoTasksProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "approved" | "urgent">("all");
  const [execElapsed, setExecElapsed] = useState(0);
  const execTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const revertTask = async (task: SeoTask) => {
    if (!task.changes?.length || !task.wpPostId) return;
    setRevertingId(task.id);
    try {
      const res = await fetch("/api/ad-dashboard/seo/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wpCredentials: {
            siteUrl: connections.wordpress.siteUrl,
            user: connections.wordpress.user,
            appPassword: connections.wordpress.appPassword,
          },
          wpPostId: task.wpPostId,
          wpPostType: task.wpPostType,
          changes: task.changes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onTaskUpdate(task.id, { status: "pending", result: undefined, changes: undefined, wpPostId: undefined, wpPostType: undefined });
      } else {
        alert(`שגיאה בהחזרה: ${data.error}`);
      }
    } catch (err) {
      alert(`שגיאה: ${err instanceof Error ? err.message : "Revert failed"}`);
    } finally {
      setRevertingId(null);
    }
  };

  const executeTask = async (task: SeoTask) => {
    if (!connections.wordpress.connected) {
      alert("חבר את WordPress קודם");
      return;
    }

    setExecutingId(task.id);
    setExecElapsed(0);
    execTimerRef.current = setInterval(() => setExecElapsed((e) => e + 1), 1000);
    onTaskUpdate(task.id, { status: "running" });

    try {
      const res = await fetch("/api/ad-dashboard/seo/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          wpCredentials: {
            siteUrl: connections.wordpress.siteUrl,
            user: connections.wordpress.user,
            appPassword: connections.wordpress.appPassword,
          },
          googleToken: connections.google.accessToken,
          googleSiteUrl: connections.google.siteUrl,
          ga4PropertyId: connections.google.propertyId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onTaskUpdate(task.id, {
          status: "done",
          result: data.result,
          changes: data.changes,
          wpPostId: data.wpPostId,
          wpPostType: data.wpPostType,
          actualUrl: data.actualUrl,
        });
        setExpandedId(task.id); // Auto-expand to show changes
      } else {
        onTaskUpdate(task.id, { status: "error", result: data.error });
      }
    } catch (err) {
      onTaskUpdate(task.id, {
        status: "error",
        result: err instanceof Error ? err.message : "Execution failed",
      });
    } finally {
      setExecutingId(null);
      if (execTimerRef.current) clearInterval(execTimerRef.current);
    }
  };

  // Timer for loading state
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  const STEPS = [
    { at: 0, label: "מתחבר ל-Claude...", pct: 5 },
    { at: 5, label: "שולח נתוני מילות מפתח ומאמרים...", pct: 10 },
    { at: 10, label: "Claude מנתח דפוסי טראפיק...", pct: 20 },
    { at: 20, label: "מזהה בעיות טכניות...", pct: 35 },
    { at: 35, label: "מתעדף משימות לפי השפעה...", pct: 50 },
    { at: 50, label: "כותב המלצות ספציפיות...", pct: 65 },
    { at: 70, label: "מסיים ניתוח...", pct: 80 },
    { at: 90, label: "כמעט סיים, עוד רגע...", pct: 90 },
    { at: 120, label: "עדיין עובד... לוקח קצת יותר הפעם", pct: 93 },
    { at: 180, label: "מנסה שוב אוטומטית...", pct: 95 },
    { at: 240, label: "עוד קצת סבלנות...", pct: 97 },
  ];

  if (loading) {
    const currentStep = [...STEPS].reverse().find((s) => elapsed >= s.at) || STEPS[0];
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");

    return (
      <div className={`${GLASS} p-8`}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm font-medium text-gray-700">{currentStep.label}</p>

          {/* Progress bar */}
          <div className="w-full max-w-md">
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all duration-1000"
                style={{ width: `${currentStep.pct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-gray-400">
              <span>{currentStep.pct}%</span>
              <span>{mm}:{ss}</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-400">בדרך כלל לוקח 30-90 שניות</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className={`${GLASS} border-emerald-200 bg-emerald-50/50 p-4`}>
          <div className="text-xs font-semibold text-emerald-700 mb-1">סיכום AI</div>
          <p className="text-sm text-gray-700">{summary}</p>
        </div>
      )}

      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setTaskFilter(taskFilter === "all" ? "all" : "all")}
          className={`rounded-full px-3 py-1 font-medium transition-all cursor-pointer ${taskFilter === "all" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          הכל ({tasks.length})
        </button>
        <button
          onClick={() => setTaskFilter(taskFilter === "pending" ? "all" : "pending")}
          className={`rounded-full px-3 py-1 font-medium transition-all cursor-pointer ${taskFilter === "pending" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          {tasks.filter((t) => t.status === "pending").length} ממתינות
        </button>
        <button
          onClick={() => setTaskFilter(taskFilter === "approved" ? "all" : "approved")}
          className={`rounded-full px-3 py-1 font-medium transition-all cursor-pointer ${taskFilter === "approved" ? "bg-green-600 text-white" : "bg-green-100 text-green-600 hover:bg-green-200"}`}
        >
          {tasks.filter((t) => t.status === "approved").length} אושרו
        </button>
        <button
          onClick={() => setTaskFilter(taskFilter === "urgent" ? "all" : "urgent")}
          className={`rounded-full px-3 py-1 font-medium transition-all cursor-pointer ${taskFilter === "urgent" ? "bg-red-600 text-white" : "bg-red-100 text-red-500 hover:bg-red-200"}`}
        >
          {tasks.filter((t) => t.priority === "high" || t.priority === "critical").length} דחופות
        </button>
      </div>

      <div className="space-y-3">
        {tasks.filter((t) => {
          if (taskFilter === "pending") return t.status === "pending" || t.status === "running" || t.status === "done";
          if (taskFilter === "approved") return t.status === "approved";
          if (taskFilter === "urgent") return t.priority === "high" || t.priority === "critical";
          return true;
        }).map((task) => {
          const typeInfo = SEO_TASK_TYPE_LABELS[task.type] || { icon: "📋", label: task.type };
          const statusInfo = STATUS_STYLES[task.status];
          const isExpanded = expandedId === task.id;
          const isExecuting = executingId === task.id;

          return (
            <div key={task.id} className={`${GLASS} ${GLASS_HOVER} ${PRIORITY_STYLES[task.priority]} overflow-hidden`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{typeInfo.icon}</span>
                      <h4 className="font-medium text-gray-900">{task.title}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{task.description}</p>
                    {task.url && (
                      <a href={task.actualUrl || task.url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[11px] text-blue-500 hover:underline">
                        {task.url.replace(/https?:\/\//, "")}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {task.status === "pending" && (
                      <button
                        onClick={() => executeTask(task)}
                        disabled={isExecuting || !connections.wordpress.connected}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                          isExecuting
                            ? "border-blue-300 bg-blue-50 text-blue-700 animate-pulse"
                            : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        }`}
                      >
                        {isExecuting
                          ? `🔄 שולף דף ← AI מנתח ← שומר... ${String(Math.floor(execElapsed / 60)).padStart(2, "0")}:${String(execElapsed % 60).padStart(2, "0")}`
                          : "בצע עם Claude"}
                      </button>
                    )}
                    {task.status === "running" && (
                      <span className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 animate-pulse">
                        🔄 שולף דף ← AI מנתח ← שומר... {String(Math.floor(execElapsed / 60)).padStart(2, "0")}:{String(execElapsed % 60).padStart(2, "0")}
                        <span className="block text-[10px] text-blue-400 mt-0.5">בדרך כלל 20-40 שניות</span>
                      </span>
                    )}
                    {task.result && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : task.id)}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        {isExpanded ? "סגור" : "פרטים"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {isExpanded && task.result && (
                <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
                  {/* Status Banner */}
                  {task.status === "done" && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-center gap-2">
                      <span className="text-lg">⚡</span>
                      <div>
                        <div className="text-xs font-semibold text-amber-800">השינויים כבר בוצעו באתר!</div>
                        <div className="text-[11px] text-amber-600">בדוק את התוצאה ואשר, או החזר למצב הקודם</div>
                      </div>
                      {task.url && (
                        <a href={task.actualUrl || task.url} target="_blank" rel="noopener noreferrer" className="mr-auto rounded-lg bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-700">
                          צפה בדף באתר →
                        </a>
                      )}
                    </div>
                  )}
                  {task.status === "approved" && (
                    <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2">
                      <span className="text-lg">✅</span>
                      <div className="text-xs font-semibold text-green-800">אושר! השינויים פעילים באתר</div>
                      {task.url && (
                        <a href={task.actualUrl || task.url} target="_blank" rel="noopener noreferrer" className="mr-auto rounded-lg bg-green-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-green-700">
                          צפה בדף →
                        </a>
                      )}
                    </div>
                  )}

                  {/* Before/After Changes */}
                  {task.changes && task.changes.length > 0 && (
                    <div className="space-y-2">
                      {task.changes.map((change) => (
                        <div key={change.field} className="rounded-lg border border-gray-200 bg-white p-3">
                          <div className="text-[11px] font-semibold text-gray-500 mb-2">{change.label}</div>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">לפני</span>
                              <span className="text-xs text-gray-600 line-through">{change.before || "(ריק)"}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-600">אחרי</span>
                              <span className="text-xs text-gray-900 font-medium">{change.after}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI Summary */}
                  <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer hover:text-gray-700">לוג מפורט</summary>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-600 leading-relaxed" dir="auto">
                      {task.result}
                    </pre>
                  </details>

                  {/* Action Buttons */}
                  {task.status === "done" && task.changes && task.changes.length > 0 && (
                    <div className="flex gap-2 pt-2 border-t border-gray-200">
                      <button
                        onClick={() => { onTaskUpdate(task.id, { status: "approved" }); setExpandedId(null); }}
                        className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-green-700"
                      >
                        ✅ מרוצה, אשר שינויים
                      </button>
                      <button
                        onClick={() => revertTask(task)}
                        disabled={revertingId === task.id}
                        className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition-all hover:bg-red-100 disabled:opacity-50"
                      >
                        {revertingId === task.id ? "מחזיר..." : "↩️ לא טוב, החזר למצב קודם"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">חבר את Google + WordPress כדי לייצר משימות</div>
        )}
      </div>
    </div>
  );
}
