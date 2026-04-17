import { NextResponse } from "next/server";
import { getSessionData } from "@/app/ad-dashboard/lib/session";
import { getAdAccounts } from "@/app/ad-dashboard/lib/meta-api";

export async function GET() {
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const metaAccounts = await getAdAccounts(session.accessToken);

    return NextResponse.json({
      accounts: metaAccounts.map((a, i) => ({
        id: a.id,
        metaAccountId: a.id,
        name: a.name,
        sortOrder: i,
      })),
    });
  } catch (err) {
    console.error("Failed to fetch Meta accounts:", err);
    return NextResponse.json(
      { error: "Failed to fetch accounts from Meta" },
      { status: 502 }
    );
  }
}
