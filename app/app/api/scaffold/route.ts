import { NextResponse } from "next/server";
import { scaffoldDocs } from "@/app/lib/doctree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { engagementId } = (await req.json()) as { engagementId: string };
  const r = await scaffoldDocs(engagementId);
  return NextResponse.json(r);
}
