import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { OverdueBook } from "@/components/customers/overdue-book";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describePlan } from "@/lib/accounts";
import { formatDate } from "@/lib/dates";
import { getAccount } from "@/lib/data";
import { formatUsd } from "@/lib/money";
import { NUDGE_FAILED_DETAIL, NUDGE_SENT } from "@/lib/nudge";

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

  const { customer, summary, overdueBook, activities } = account;
  const mostPastDue = overdueBook[0];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        eyebrow="Account"
        title={customer.name}
        description={`${describePlan(customer.plan)} · ${customer.contactName} · ${customer.email}`}
        actions={
          <>
            <div data-nudge="account">
              {mostPastDue ? (
                <form method="post" action={`/api/invoices/${mostPastDue.invoiceId}/nudge`}>
                  <Button type="submit" size="sm">
                    Send Nudge
                  </Button>
                </form>
              ) : (
                <Button type="button" size="sm" disabled>
                  Send Nudge
                </Button>
              )}
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/customers">All customers</Link>
            </Button>
          </>
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
          <CardTitle>Activity</CardTitle>
          <CardDescription>Collections history for this account, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity on this account.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="space-y-1 text-sm"
                  data-activity-type={activity.type}
                  data-activity-status={activity.status}
                >
                  <p className="font-medium">
                    {activity.type}
                    <span className="font-normal text-muted-foreground"> · {activity.status}</span>
                    {activity.channel ? (
                      <span className="font-normal text-muted-foreground"> · {activity.channel}</span>
                    ) : null}
                  </p>
                  <p>{activity.actorName}</p>
                  <p>{activity.body}</p>
                  {activity.type === NUDGE_SENT && activity.status === "failed" ? (
                    <p>{NUDGE_FAILED_DETAIL}</p>
                  ) : null}
                  <p className="text-muted-foreground">{formatDate(activity.occurredOn)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
