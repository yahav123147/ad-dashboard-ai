import { NextResponse } from "next/server";
import { clearSession } from "@/app/ad-dashboard/lib/session";

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
