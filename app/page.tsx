import { getProgram } from "./lib/program";
import { AppShell } from "./components/AppShell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const model = await getProgram();
  return <AppShell model={model} />;
}
