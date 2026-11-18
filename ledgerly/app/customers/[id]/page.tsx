import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { EditNoteForm, NoteForm } from "@/components/customers/note-form";
import { OverdueBook } from "@/components/customers/overdue-book";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describePlan } from "@/lib/accounts";
import { getAccount } from "@/lib/data";
import { formatTimestamp } from "@/lib/dates";
import { formatUsd } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccount(id);
  return { title: account ? account.customer.name : "Customer" };
}

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const { customer, summary, overdueBook, invoices, notes } = account;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        eyebrow="Account"
        title={customer.name}
        description={`${describePlan(customer.plan)} · ${customer.contactName} · ${customer.email}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/customers">All customers</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Overdue balance</CardTitle>
          <CardDescription>
            {summary.overdueCount} overdue {summary.overdueCount === 1 ? "invoice" : "invoices"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight">{formatUsd(summary.overdueCents)}</p>
        </CardContent>
      </Card>

      <OverdueBook rows={overdueBook} />

      <Card>
        <CardHeader>
          <CardTitle>Account activity</CardTitle>
          <CardDescription>Collection notes on this account, newest first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <NoteForm customerId={customer.id} invoices={invoices} />
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No collection notes yet.</p>
          ) : (
            <ol className="space-y-4">
              {notes.map((note) => (
                <li key={note.id} className="space-y-2 border-t border-border pt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{note.authorName}</p>
                    <time dateTime={note.createdAt.toISOString()} className="text-xs text-muted-foreground">
                      {formatTimestamp(note.createdAt)}
                    </time>
                  </div>
                  {note.invoiceNumber ? (
                    <p className="text-xs text-muted-foreground">Invoice {note.invoiceNumber}</p>
                  ) : null}
                  {note.editable ? (
                    <EditNoteForm noteId={note.id} body={note.body} />
                  ) : (
                    <p className="text-sm leading-relaxed">{note.body}</p>
                  )}
                  {note.originalBody !== note.body ? (
                    <p className="text-sm text-muted-foreground">Original note: {note.originalBody}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
