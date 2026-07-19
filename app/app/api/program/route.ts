import { NextResponse } from "next/server";
import { getProgram } from "@/app/lib/program";

export const dynamic = "force-dynamic";

export async function GET() {
  const model = await getProgram();
  return NextResponse.json(model);
}
