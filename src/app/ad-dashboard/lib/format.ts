export function fmtN(n: number): string {
  if (!n) return "-";
  return n.toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

export function fmtCurrency(n: number): string {
  if (!n) return "-";
  return `₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

export function fmtSigned(n: number): string {
  if (!n) return "-";
  const s = n > 0 ? "+" : "";
  return `${s}₪${n.toLocaleString("he-IL", { maximumFractionDigits: 0 })}`;
}

export function fmtPct(n: number): string {
  if (!n) return "-";
  return `${n.toFixed(1)}%`;
}

export function fmtRoas(n: number): string {
  if (!n) return "-";
  return `${n.toFixed(2)}x`;
}

export function fmtDec(n: number): string {
  if (!n) return "-";
  return `₪${n.toFixed(1)}`;
}
