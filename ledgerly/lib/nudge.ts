import { randomBytes } from "node:crypto";
import { outstandingCents } from "@/lib/accounts";
import { DEMO_AS_OF } from "@/lib/clock";
import { formatDate } from "@/lib/dates";
import { DEMO_OPERATOR } from "@/lib/demo-session";
import { formatUsd } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export const NUDGE_SENT = "NUDGE_SENT";
export const NUDGE_CHANNEL = "email";

export const NUDGE_FAILED_DETAIL =
  "This Nudge failed. The email on file is missing or not an email address.";

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let createdAtMillis = 0;

/** Millisecond timestamps so two Nudges in the same second still sort newest first. */
function nextCreatedAt(): Date {
  createdAtMillis = Math.max(Date.now(), createdAtMillis + 1);
  return new Date(createdAtMillis);
}

/** On-file address that can take an email Nudge. Empty and non-addresses cannot. */
export function isDeliverableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_ADDRESS.test(email.trim());
}

/** Fixed reminder. Names the invoice number, outstanding balance, and due date. */
export function nudgeTemplate(input: {
  number: string;
  outstandingCents: number;
  dueOn: Date;
}): string {
  return `Invoice ${input.number} is past due. The outstanding balance is ${formatUsd(input.outstandingCents)}, due ${formatDate(input.dueOn)}.`;
}

export type NudgeActivity = {
  id: string;
  customerId: string;
  invoiceId: string | null;
  type: string;
  status: string;
  channel: string | null;
  actorName: string;
  body: string;
  occurredOn: Date;
  createdAt: Date;
};

export type SendNudgeResult =
  | { ok: true; activity: NudgeActivity }
  | { ok: false; status: 400 | 404; error: string };

/**
 * Email the fixed reminder to the address on file and append NUDGE_SENT.
 * A missing or invalid address is stored as failed. The request is not dropped.
 * No custom body: the template is the only copy.
 */
export async function sendInvoiceNudge(invoiceId: string): Promise<SendNudgeResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: true },
  });
  if (!invoice) {
    return { ok: false, status: 404, error: "Invoice not found" };
  }
  if (invoice.status !== "OVERDUE") {
    return { ok: false, status: 400, error: "Nudge is only available for an OVERDUE invoice" };
  }

  const status = isDeliverableEmail(invoice.customer.email) ? "sent" : "failed";
  const activity = await prisma.activity.create({
    data: {
      id: `act_${randomBytes(8).toString("hex")}`,
      customerId: invoice.customerId,
      invoiceId: invoice.id,
      type: NUDGE_SENT,
      status,
      channel: NUDGE_CHANNEL,
      actorName: DEMO_OPERATOR.name,
      body: nudgeTemplate({
        number: invoice.number,
        outstandingCents: outstandingCents(invoice),
        dueOn: invoice.dueOn,
      }),
      occurredOn: DEMO_AS_OF,
      createdAt: nextCreatedAt(),
    },
  });

  return { ok: true, activity };
}
