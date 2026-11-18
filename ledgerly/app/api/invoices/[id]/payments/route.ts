import { NextResponse } from "next/server";
import { recordFullPayment } from "@/lib/payments";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const record = body as { method?: unknown; amountCents?: unknown };
  const result = await recordFullPayment({
    invoiceId: id,
    method: record.method,
    amountCents: record.amountCents,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { payment: result.payment, activity: result.activity, invoice: result.invoice },
    { status: 201 },
  );
}
