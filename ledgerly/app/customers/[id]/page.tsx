import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { OverdueBook } from "@/components/customers/overdue-book";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describePlan } from "@/lib/accounts";
import { getAccount } from "@/lib/data";
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

  const { customer, summary, overdueBook } = account;

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
    </div>
  );
}
