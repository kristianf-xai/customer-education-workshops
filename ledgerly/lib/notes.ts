import { randomUUID } from "node:crypto";
import { NOTE_ADDED } from "@/lib/accounts";
import { DEMO_AS_OF } from "@/lib/clock";
import { DEMO_OPERATOR } from "@/lib/demo-session";
import { prisma } from "@/lib/prisma";

export const NOTE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export type NoteActivityPayload = {
  noteId: string;
  body: string;
};

type SavedNote = {
  id: string;
  customerId: string;
  invoiceId: string | null;
  authorName: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

export type NoteWriteResult =
  | { ok: true; note: SavedNote }
  | { ok: false; status: 400 | 403 | 404; error: string };

export function noteActivityPayload(noteId: string, body: string): string {
  const payload: NoteActivityPayload = { noteId, body };
  return JSON.stringify(payload);
}

export function readNoteActivityPayload(payload: string): NoteActivityPayload | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { noteId?: unknown; body?: unknown };
    if (typeof record.noteId !== "string" || typeof record.body !== "string") return null;
    return { noteId: record.noteId, body: record.body };
  } catch {
    return null;
  }
}

export function noteIsEditable(
  note: { authorName: string; createdAt: Date },
  now = Date.now(),
): boolean {
  if (note.authorName !== DEMO_OPERATOR.name) return false;
  const ageMs = now - note.createdAt.getTime();
  return ageMs >= 0 && ageMs < NOTE_EDIT_WINDOW_MS;
}

function readNoteBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.trim();
  return body.length > 0 ? body : null;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function createCollectionNote(
  customerId: string,
  input: { body: unknown; invoiceId: unknown },
): Promise<NoteWriteResult> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) {
    return { ok: false, status: 404, error: "Customer not found." };
  }

  const body = readNoteBody(input.body);
  if (!body) {
    return { ok: false, status: 400, error: "Write a note before saving." };
  }

  let invoiceId: string | null = null;
  if (input.invoiceId !== undefined && input.invoiceId !== null && input.invoiceId !== "") {
    if (typeof input.invoiceId !== "string") {
      return { ok: false, status: 400, error: "Invoice is not on this account." };
    }
    invoiceId = input.invoiceId.trim();
    if (!invoiceId) {
      invoiceId = null;
    }
  }

  if (invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { customerId: true },
    });
    if (!invoice || invoice.customerId !== customerId) {
      return { ok: false, status: 400, error: "Invoice is not on this account." };
    }
  }

  const createdAt = new Date();
  const noteId = `note_${randomUUID()}`;
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.collectionNote.create({
      data: {
        id: noteId,
        customerId,
        invoiceId,
        authorName: DEMO_OPERATOR.name,
        body,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await tx.activity.create({
      data: {
        id: `act_${randomUUID()}`,
        customerId,
        invoiceId,
        type: NOTE_ADDED,
        actorName: DEMO_OPERATOR.name,
        payload: noteActivityPayload(created.id, body),
        occurredOn: DEMO_AS_OF,
        createdAt,
      },
    });
    return created;
  });

  return { ok: true, note };
}

export async function updateCollectionNote(id: string, bodyInput: unknown): Promise<NoteWriteResult> {
  const note = await prisma.collectionNote.findUnique({ where: { id } });
  if (!note) {
    return { ok: false, status: 404, error: "Note not found." };
  }

  const body = readNoteBody(bodyInput);
  if (!body) {
    return { ok: false, status: 400, error: "Write a note before saving." };
  }

  if (!noteIsEditable(note)) {
    return { ok: false, status: 403, error: "This note can no longer be edited." };
  }

  const updated = await prisma.collectionNote.update({
    where: { id },
    data: { body },
  });
  return { ok: true, note: updated };
}
