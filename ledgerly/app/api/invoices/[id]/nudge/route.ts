import { NextResponse } from "next/server";
import { sendInvoiceNudge } from "@/lib/nudge";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await sendInvoiceNudge(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.redirect(new URL(`/customers/${result.activity.customerId}`, request.url), 303);
}
