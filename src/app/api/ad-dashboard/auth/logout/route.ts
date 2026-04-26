import { NextResponse } from "next/server";
import { clearSession } from "@/app/ad-dashboard/lib/session";
import { deleteTokenFile } from "@/app/ad-dashboard/lib/token-file";

export async function POST() {
  await clearSession();
  await deleteTokenFile();
  return NextResponse.json({ ok: true });
}
