import { NextResponse } from "next/server";
import { readJsonObject, updateCollectionNote } from "@/lib/notes";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await readJsonObject(request);
  if (!payload) {
    return NextResponse.json({ error: "Write a note before saving." }, { status: 400 });
  }

  const result = await updateCollectionNote(id, payload.body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ note: result.note });
}
