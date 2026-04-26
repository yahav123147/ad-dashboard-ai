import { promises as fs } from "fs";
import path from "path";
import type { SessionData } from "./session";

const TOKEN_FILE = path.join(process.cwd(), ".meta-token.json");

export async function saveTokenToFile(data: SessionData): Promise<void> {
  await fs.writeFile(TOKEN_FILE, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export async function loadTokenFromFile(): Promise<SessionData | null> {
  try {
    const raw = await fs.readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function deleteTokenFile(): Promise<void> {
  try {
    await fs.unlink(TOKEN_FILE);
  } catch {
    /* ignore */
  }
}
