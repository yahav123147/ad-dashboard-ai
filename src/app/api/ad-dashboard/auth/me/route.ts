import { NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";

export async function GET() {
  const session = await getSessionData();

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const hasValidToken = session.tokenExpiresAt
    ? new Date(session.tokenExpiresAt) > new Date()
    : true;

  return NextResponse.json({
    user: {
      id: session.metaUserId,
      metaUserId: session.metaUserId,
      name: session.name,
      email: session.email,
      hasValidToken,
      tokenExpiresAt: session.tokenExpiresAt,
    },
  });
}
