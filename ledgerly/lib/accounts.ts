import { DEMO_AS_OF } from "@/lib/clock";
import { daysBetween } from "@/lib/dates";
import { formatUsd, sumCents } from "@/lib/money";
import { PLAN_LABEL, PLAN_PRICE_CENTS, isPlanId } from "@/lib/plans";

export const NO_ACTIVITY = "—";

export type AccountInvoice = {
  id: string;
  number: string;
  status: string;
  issuedOn: Date;
  dueOn: Date;
  totalCents: number;
};

export type OverdueBookRow = {
  invoiceId: string;
  number: string;
  issuedOn: Date;
  dueOn: Date;
  daysPastDue: number;
  outstandingCents: number;
  lastActivityOn: Date | null;
};

/** Enough of an activity row to date the last Nudge on an invoice. */
export type NudgeActivityStamp = {
  invoiceId: string | null;
  type: string;
  occurredOn: Date;
};

export type AccountSummary = {
  id: string;
  name: string;
  plan: string;
  overdueCount: number;
  overdueCents: number;
};

/** Single seam for what an invoice still owes. Payments will subtract from this. */
export function outstandingCents(invoice: Pick<AccountInvoice, "totalCents">): number {
  return invoice.totalCents;
}

export function daysPastDue(dueOn: Date): number {
  return daysBetween(DEMO_AS_OF, dueOn);
}

/** Latest Nudge on an invoice. Other activity types do not set this date. */
export function latestNudgeOn(activities: readonly NudgeActivityStamp[], invoiceId: string): Date | null {
  let latest: Date | null = null;
  for (const activity of activities) {
    if (activity.type !== "NUDGE_SENT" || activity.invoiceId !== invoiceId) continue;
    if (!latest || activity.occurredOn.getTime() > latest.getTime()) {
      latest = activity.occurredOn;
    }
  }
  return latest;
}

/** Overdue invoices for one account, most days past due first. */
export function buildOverdueBook(
  invoices: AccountInvoice[],
  activities: readonly NudgeActivityStamp[] = [],
): OverdueBookRow[] {
  return invoices
    .filter((invoice) => invoice.status === "OVERDUE")
    .map((invoice) => ({
      invoiceId: invoice.id,
      number: invoice.number,
      issuedOn: invoice.issuedOn,
      dueOn: invoice.dueOn,
      daysPastDue: daysPastDue(invoice.dueOn),
      outstandingCents: outstandingCents(invoice),
      lastActivityOn: latestNudgeOn(activities, invoice.id),
    }))
    .sort((a, b) => b.daysPastDue - a.daysPastDue || a.number.localeCompare(b.number));
}

export function summarizeAccount(
  customer: { id: string; name: string; plan: string },
  book: OverdueBookRow[],
): AccountSummary {
  return {
    id: customer.id,
    name: customer.name,
    plan: customer.plan,
    overdueCount: book.length,
    overdueCents: sumCents(book.map((row) => row.outstandingCents)),
  };
}

/** Accounts with the largest overdue balance first, then by name. */
export function compareAccounts(a: AccountSummary, b: AccountSummary): number {
  return b.overdueCents - a.overdueCents || a.name.localeCompare(b.name);
}

/** Plan name with its catalog price. Plan ids outside the catalog show as written. */
export function describePlan(plan: string): string {
  return isPlanId(plan) ? `${PLAN_LABEL[plan]} · ${formatUsd(PLAN_PRICE_CENTS[plan])}` : plan;
}
