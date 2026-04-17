export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "last_3_months";

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "היום" },
  { key: "yesterday", label: "אתמול" },
  { key: "last_7d", label: "7 ימים" },
  { key: "last_14d", label: "14 ימים" },
  { key: "last_30d", label: "30 ימים" },
  { key: "this_week", label: "השבוע" },
  { key: "last_week", label: "שבוע שעבר" },
  { key: "this_month", label: "החודש" },
  { key: "last_month", label: "חודש שעבר" },
  { key: "last_3_months", label: "3 חודשים" },
];

export function getDateRange(preset: DatePreset): { since: string; until: string } {
  const now = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = fmt(now);

  switch (preset) {
    case "today":
      return { since: today, until: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ys = fmt(y);
      return { since: ys, until: ys };
    }
    case "last_7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { since: fmt(d), until: today };
    }
    case "last_14d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 13);
      return { since: fmt(d), until: today };
    }
    case "last_30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { since: fmt(d), until: today };
    }
    case "this_week": {
      const day = now.getDay();
      const d = new Date(now);
      d.setDate(d.getDate() - day);
      return { since: fmt(d), until: today };
    }
    case "last_week": {
      const day = now.getDay();
      const end = new Date(now);
      end.setDate(end.getDate() - day - 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { since: fmt(start), until: fmt(end) };
    }
    case "this_month":
      return {
        since: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
        until: today,
      };
    case "last_month": {
      const m = now.getMonth() === 0 ? 12 : now.getMonth();
      const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const lastDay = new Date(y, m, 0).getDate();
      return {
        since: `${y}-${String(m).padStart(2, "0")}-01`,
        until: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    }
    case "last_3_months": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return { since: fmt(d), until: today };
    }
  }
}
