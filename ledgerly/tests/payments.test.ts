import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/invoices/[id]/payments/route";
import AccountDetailPage from "@/app/customers/[id]/page";
import InvoiceDetailPage from "@/app/invoices/[id]/page";
import { RecordPayment } from "@/components/invoices/record-payment";
import { outstandingCents } from "@/lib/accounts";
import { DEMO_AS_OF } from "@/lib/clock";
import { DEMO_OPERATOR } from "@/lib/demo-session";
import { formatUsd } from "@/lib/money";
import { PAYMENT_METHODS, paymentConfirmQuestion, type PaymentMethod } from "@/lib/payments";
import { PLAN_PRICE_CENTS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => {} }),
}));

const ALDER = "cus_alderbio";
const ALDER_INVOICE = "inv_2003";
const ALDER_NUMBER = "INV-2003";

function postPayment(id: string, body: unknown) {
  return POST(
    new Request(`http://127.0.0.1/api/invoices/${id}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function restoreAlder() {
  await prisma.activity.deleteMany({ where: { invoiceId: ALDER_INVOICE } });
  await prisma.payment.deleteMany({ where: { invoiceId: ALDER_INVOICE } });
  await prisma.invoice.update({
    where: { id: ALDER_INVOICE },
    data: { status: "OVERDUE", paidOn: null },
  });
}

function invoiceHrefs(markup: string) {
  return [...markup.matchAll(/href="\/invoices\/([^"]+)"/g)].map((match) => match[1]);
}

function dollarAmounts(markup: string) {
  return [...markup.matchAll(/\$[\d,]+\.\d{2}/g)].map((match) => match[0]);
}

beforeEach(restoreAlder);
afterEach(restoreAlder);

describe("full payment", () => {
  it.each(PAYMENT_METHODS)(
    "records a %s payment for the outstanding balance and marks the invoice paid",
    async (method: PaymentMethod) => {
      const response = await postPayment(ALDER_INVOICE, { method });
      expect(response.status).toBe(201);
      const body = (await response.json()) as {
        payment: { amountCents: number; method: string; recordedBy: string; recordedAt: string };
        activity: {
          type: string;
          status: string;
          amountCents: number;
          method: string;
          actorName: string;
          occurredOn: string;
        };
        invoice: { status: string; paidOn: string };
      };
      expect(body.payment).toMatchObject({
        amountCents: PLAN_PRICE_CENTS.SCALE,
        method,
        recordedBy: DEMO_OPERATOR.name,
        recordedAt: DEMO_AS_OF.toISOString(),
      });
      expect(body.activity).toMatchObject({
        type: "PAYMENT_RECORDED",
        status: "recorded",
        amountCents: PLAN_PRICE_CENTS.SCALE,
        method,
        actorName: DEMO_OPERATOR.name,
        occurredOn: DEMO_AS_OF.toISOString(),
      });
      expect(body.invoice).toMatchObject({
        status: "PAID",
        paidOn: DEMO_AS_OF.toISOString(),
      });

      const stored = await prisma.invoice.findUniqueOrThrow({
        where: { id: ALDER_INVOICE },
        include: { payments: true },
      });
      expect(stored.status).toBe("PAID");
      expect(stored.paidOn?.toISOString()).toBe(DEMO_AS_OF.toISOString());
      expect(outstandingCents(stored)).toBe(0);

      const accountMarkup = renderToStaticMarkup(
        await AccountDetailPage({ params: Promise.resolve({ id: ALDER }) }),
      );
      expect(invoiceHrefs(accountMarkup)).not.toContain(ALDER_INVOICE);
      expect(accountMarkup).toContain("PAYMENT_RECORDED");
      expect(accountMarkup).toContain(formatUsd(PLAN_PRICE_CENTS.SCALE));
      expect(accountMarkup).toContain(method);
      expect(accountMarkup).toContain(DEMO_OPERATOR.name);
      expect(accountMarkup).toContain("recorded");

      const invoiceMarkup = renderToStaticMarkup(
        await InvoiceDetailPage({ params: Promise.resolve({ id: ALDER_INVOICE }) }),
      );
      expect(invoiceMarkup).toContain("Payment history");
      expect(invoiceMarkup).toContain(method);
      expect(invoiceMarkup).toContain(formatUsd(PLAN_PRICE_CENTS.SCALE));
      expect(invoiceMarkup).toContain(DEMO_OPERATOR.name);
      expect(invoiceMarkup).not.toContain("Record payment");
    },
  );

  it("returns 400 when the outstanding balance is already 0 and leaves the invoice unchanged", async () => {
    const first = await postPayment(ALDER_INVOICE, { method: "check" });
    expect(first.status).toBe(201);
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: ALDER_INVOICE } });

    const second = await postPayment(ALDER_INVOICE, { method: "cash" });
    expect(second.status).toBe(400);
    const again = await prisma.invoice.findUniqueOrThrow({ where: { id: ALDER_INVOICE } });
    expect(again.status).toBe(paid.status);
    expect(again.paidOn?.toISOString()).toBe(paid.paidOn?.toISOString());
    expect(await prisma.payment.count({ where: { invoiceId: ALDER_INVOICE } })).toBe(1);
    expect(await prisma.activity.count({ where: { invoiceId: ALDER_INVOICE } })).toBe(1);
  });
});

describe("amount that is not the outstanding balance", () => {
  it("offers only the full outstanding balance on the confirm step", () => {
    const markup = renderToStaticMarkup(
      createElement(RecordPayment, {
        invoiceId: ALDER_INVOICE,
        invoiceNumber: ALDER_NUMBER,
        outstandingCents: PLAN_PRICE_CENTS.SCALE,
        initialStep: "confirm",
        initialMethod: "check",
      }),
    );
    expect(markup).toContain(paymentConfirmQuestion(PLAN_PRICE_CENTS.SCALE, ALDER_NUMBER));
    expect(dollarAmounts(markup)).toEqual([formatUsd(PLAN_PRICE_CENTS.SCALE)]);
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("amountCents");
  });

  it("does not collect a second amount on the record-payment form", () => {
    const markup = renderToStaticMarkup(
      createElement(RecordPayment, {
        invoiceId: ALDER_INVOICE,
        invoiceNumber: ALDER_NUMBER,
        outstandingCents: PLAN_PRICE_CENTS.SCALE,
      }),
    );
    expect(markup).toContain("Record payment");
    expect(markup).not.toContain(paymentConfirmQuestion(PLAN_PRICE_CENTS.SCALE, ALDER_NUMBER));
    for (const method of PAYMENT_METHODS) {
      expect(markup).toContain(`value="${method}"`);
    }
    expect(dollarAmounts(markup)).toEqual([formatUsd(PLAN_PRICE_CENTS.SCALE)]);
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("amountCents");
  });

  it("returns 400 and stores nothing when amountCents is not the outstanding balance", async () => {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: ALDER_INVOICE },
      include: { payments: true },
    });
    const balance = outstandingCents(invoice);
    const response = await postPayment(ALDER_INVOICE, { method: "ach", amountCents: balance - 1 });
    expect(response.status).toBe(400);

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: ALDER_INVOICE } });
    expect(after.status).toBe("OVERDUE");
    expect(after.paidOn).toBeNull();
    expect(await prisma.payment.count({ where: { invoiceId: ALDER_INVOICE } })).toBe(0);
    expect(await prisma.activity.count({ where: { invoiceId: ALDER_INVOICE } })).toBe(0);
  });

  it("records the outstanding balance when amountCents matches it", async () => {
    const response = await postPayment(ALDER_INVOICE, {
      method: "card_on_file",
      amountCents: PLAN_PRICE_CENTS.SCALE,
    });
    expect(response.status).toBe(201);
    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: ALDER_INVOICE } });
    expect(payment.amountCents).toBe(PLAN_PRICE_CENTS.SCALE);
    expect(payment.method).toBe("card_on_file");
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: ALDER_INVOICE } });
    expect(invoice.status).toBe("PAID");
  });

  it("returns 400 and stores nothing when amountCents is not an integer", async () => {
    const response = await postPayment(ALDER_INVOICE, {
      method: "cash",
      amountCents: PLAN_PRICE_CENTS.SCALE + 0.5,
    });
    expect(response.status).toBe(400);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: ALDER_INVOICE } });
    expect(invoice.status).toBe("OVERDUE");
    expect(await prisma.payment.count({ where: { invoiceId: ALDER_INVOICE } })).toBe(0);
    expect(await prisma.activity.count({ where: { invoiceId: ALDER_INVOICE } })).toBe(0);
  });

  it("returns 400 and stores nothing for a method outside the catalog", async () => {
    const response = await postPayment(ALDER_INVOICE, { method: "wire" });
    expect(response.status).toBe(400);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: ALDER_INVOICE } });
    expect(invoice.status).toBe("OVERDUE");
    expect(await prisma.payment.count({ where: { invoiceId: ALDER_INVOICE } })).toBe(0);
  });
});

describe("payment route edges", () => {
  it("returns 404 for an unknown invoice", async () => {
    const response = await postPayment("inv_missing", { method: "check" });
    expect(response.status).toBe(404);
  });

  it("deletes payments and activities before invoices in the seed", () => {
    const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
    const paymentDelete = seed.indexOf("prisma.payment.deleteMany");
    const activityDelete = seed.indexOf("prisma.activity.deleteMany");
    const invoiceDelete = seed.indexOf("prisma.invoice.deleteMany");
    expect(paymentDelete).toBeGreaterThan(-1);
    expect(activityDelete).toBeGreaterThan(-1);
    expect(paymentDelete).toBeLessThan(invoiceDelete);
    expect(activityDelete).toBeLessThan(invoiceDelete);
  });
});
