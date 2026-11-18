"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({
  customerId,
  invoices,
}: {
  customerId: string;
  invoices: { id: string; number: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = formData.get("body");
    const invoiceId = formData.get("invoiceId");
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          invoiceId: typeof invoiceId === "string" && invoiceId ? invoiceId : undefined,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(payload));
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError("Could not save the note.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="collection-note-body">Note</Label>
        <Textarea
          id="collection-note-body"
          name="body"
          rows={3}
          placeholder="Promise to pay, dispute context, or what the customer said."
          disabled={pending}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="collection-note-invoice">Invoice</Label>
        <select
          id="collection-note-invoice"
          name="invoiceId"
          disabled={pending}
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
          defaultValue=""
        >
          <option value="">No linked invoice</option>
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.number}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        Save note
      </Button>
    </form>
  );
}

export function EditNoteForm({ noteId, body }: { noteId: string; body: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = `edit-note-${noteId}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: formData.get("body") }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(payload));
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save the note.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Label htmlFor={fieldId}>Edit note</Label>
      <Textarea id={fieldId} name="body" rows={3} defaultValue={body} disabled={pending} required />
      <p className="text-xs text-muted-foreground">Editable for 15 minutes from when it was saved.</p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        Save changes
      </Button>
    </form>
  );
}

function readError(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return "Could not save the note.";
}
