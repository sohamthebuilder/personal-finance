import { redirect } from "next/navigation";
import type { ReturnScreen } from "../../lib/auth/session.ts";
import { currentScreen, type ShellData, shellData } from "./server-state.ts";

/** Shell pages show only once the summary is confirmed. Anything else goes back to the server-chosen start. */
export async function requireShell(screen: ReturnScreen): Promise<ShellData> {
  const { start, token } = await currentScreen();
  if (start.screen !== "shell") redirect("/");
  const data = shellData(token, screen);
  if (data === null) redirect("/");
  return data;
}
