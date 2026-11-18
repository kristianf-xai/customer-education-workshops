import { NextResponse } from "next/server";
import { createCollectionNote, readJsonObject } from "@/lib/notes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await readJsonObject(request);
  if (!payload) {
    return NextResponse.json({ error: "Write a note before saving." }, { status: 400 });
  }

  const result = await createCollectionNote(id, {
    body: payload.body,
    invoiceId: payload.invoiceId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ note: result.note });
}
