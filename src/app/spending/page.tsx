import { requireShell } from "../ui/shell-page.ts";
import { Shell } from "../ui/shell.tsx";
import { SpendingScreen } from "../ui/spending.tsx";

/** Screen 10, Spending. The page asks the server for each level; nothing about the level goes in the web address. */
export default async function SpendingPage() {
  const data = await requireShell("/spending");
  const { range, ...header } = data;
  return (
    <Shell screen="spending" {...header}>
      <SpendingScreen periodKey={`${header.period}|${range}`} />
    </Shell>
  );
}
