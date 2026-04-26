import { NextRequest, NextResponse } from "next/server";
import { getMetaUser } from "@/app/ad-dashboard/lib/meta-api";
import { setSessionData } from "@/app/ad-dashboard/lib/session";
import { saveTokenToFile } from "@/app/ad-dashboard/lib/token-file";

export async function POST(request: NextRequest) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "חסר טוקן. הדבק את ה-Access Token של Meta." },
      { status: 400 }
    );
  }

  let metaUser;
  try {
    metaUser = await getMetaUser(token);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "טוקן לא תקין או שפג תוקפו";
    return NextResponse.json(
      { error: `אימות נכשל: ${message}` },
      { status: 401 }
    );
  }

  const sessionData = {
    metaUserId: metaUser.id,
    name: metaUser.name ?? null,
    email: metaUser.email ?? null,
    accessToken: token,
    tokenExpiresAt: null,
  };

  await saveTokenToFile(sessionData);
  await setSessionData(sessionData);

  return NextResponse.json({
    ok: true,
    user: {
      id: metaUser.id,
      name: metaUser.name,
      email: metaUser.email ?? null,
    },
  });
}
