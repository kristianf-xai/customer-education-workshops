import { randomUUID } from "node:crypto";
import { outstandingCents } from "@/lib/accounts";
import { DEMO_AS_OF } from "@/lib/clock";
import { DEMO_OPERATOR } from "@/lib/demo-session";
import { formatUsd } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export const PAYMENT_METHODS = ["check", "ach", "card_on_file", "cash"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_RECORDED = "PAYMENT_RECORDED";

const ACTIVITY_RECORDED = "recorded";

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "check":
      return "Check";
    case "ach":
      return "ACH";
    case "card_on_file":
      return "Card on file";
    case "cash":
      return "Cash";
    default: {
      const exhaustive: never = method;
      return exhaustive;
    }
  }
}

/** Confirm copy. The only amount in the sentence is the outstanding balance. */
export function paymentConfirmQuestion(amountCents: number, invoiceNumber: string): string {
  return `Record ${formatUsd(amountCents)} payment against ${invoiceNumber}?`;
}

type SuppliedAmount =
  | { kind: "omitted" }
  | { kind: "present"; amountCents: number }
  | { kind: "invalid" };

function suppliedAmount(value: unknown): SuppliedAmount {
  if (value === undefined) return { kind: "omitted" };
  if (typeof value !== "number" || !Number.isInteger(value)) return { kind: "invalid" };
  return { kind: "present", amountCents: value };
}

export type RecordPaymentResult =
  | {
      ok: true;
      payment: {
        id: string;
        invoiceId: string;
        amountCents: number;
        method: PaymentMethod;
        recordedBy: string;
        recordedAt: Date;
      };
      activity: {
        id: string;
        customerId: string;
        invoiceId: string | null;
        type: typeof PAYMENT_RECORDED;
        status: typeof ACTIVITY_RECORDED;
        actorName: string;
        amountCents: number;
        method: PaymentMethod;
        occurredOn: Date;
      };
      invoice: { id: string; status: string; paidOn: Date | null };
    }
  | { ok: false; status: 400 | 404; error: string };

/**
 * Records the full outstanding balance for one invoice.
 * A supplied amountCents that is not that balance is rejected and stores nothing.
 * An omitted amountCents is filled in by the server.
 */
export async function recordFullPayment(input: {
  invoiceId: string;
  method: unknown;
  amountCents?: unknown;
}): Promise<RecordPaymentResult> {
  if (!isPaymentMethod(input.method)) {
    return {
      ok: false,
      status: 400,
      error: "method must be check, ach, card_on_file, or cash",
    };
  }
  const method = input.method;
  const supplied = suppliedAmount(input.amountCents);
  if (supplied.kind === "invalid") {
    return { ok: false, status: 400, error: "amountCents must be an integer number of cents" };
  }

  return prisma.$transaction(async (tx): Promise<RecordPaymentResult> => {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { payments: { select: { amountCents: true } } },
    });
    if (!invoice) {
      return { ok: false, status: 404, error: "Invoice not found" };
    }

    const balance = outstandingCents(invoice);
    if (balance === 0) {
      return { ok: false, status: 400, error: "Invoice has no outstanding balance" };
    }
    if (supplied.kind === "present" && supplied.amountCents !== balance) {
      return {
        ok: false,
        status: 400,
        error: "amountCents must equal the outstanding balance",
      };
    }

    const recordedAt = DEMO_AS_OF;
    const payment = await tx.payment.create({
      data: {
        id: `pay_${randomUUID()}`,
        invoiceId: invoice.id,
        amountCents: balance,
        method,
        recordedBy: DEMO_OPERATOR.name,
        recordedAt,
      },
    });
    const activity = await tx.activity.create({
      data: {
        id: `act_${randomUUID()}`,
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        type: PAYMENT_RECORDED,
        status: ACTIVITY_RECORDED,
        actorName: DEMO_OPERATOR.name,
        amountCents: balance,
        method,
        occurredOn: recordedAt,
      },
    });
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidOn: recordedAt },
    });

    return {
      ok: true as const,
      payment: {
        id: payment.id,
        invoiceId: payment.invoiceId,
        amountCents: payment.amountCents,
        method,
        recordedBy: payment.recordedBy,
        recordedAt: payment.recordedAt,
      },
      activity: {
        id: activity.id,
        customerId: activity.customerId,
        invoiceId: activity.invoiceId,
        type: PAYMENT_RECORDED,
        status: ACTIVITY_RECORDED,
        actorName: activity.actorName,
        amountCents: balance,
        method,
        occurredOn: activity.occurredOn,
      },
      invoice: { id: updated.id, status: updated.status, paidOn: updated.paidOn },
    };
  });
}
