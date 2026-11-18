import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { POST as postInvoiceNudge } from "@/app/api/invoices/[id]/nudge/route";
import AccountDetailPage from "@/app/customers/[id]/page";
import CustomersPage from "@/app/customers/page";
import InvoiceDetailPage from "@/app/invoices/[id]/page";
import { NAV } from "@/components/app-chrome";
import { OverdueBook } from "@/components/customers/overdue-book";
import {
  NO_ACTIVITY,
  buildOverdueBook,
  describePlan,
  outstandingCents,
  type AccountInvoice,
} from "@/lib/accounts";
import { DEMO_AS_OF } from "@/lib/clock";
import { getAccount, getAccounts, getInvoice } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { DEMO_OPERATOR } from "@/lib/demo-session";
import { formatUsd } from "@/lib/money";
import { NUDGE_FAILED_DETAIL, NUDGE_SENT, nudgeTemplate } from "@/lib/nudge";
import { PLAN_PRICE_CENTS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const COBALT = "cus_quarrypine";
const SILVERPINE = "cus_silverpine";
const NO_OVERDUE = "cus_harborline";

function invoice(partial: Partial<AccountInvoice> & Pick<AccountInvoice, "id" | "dueOn">): AccountInvoice {
  return {
    number: partial.id.toUpperCase(),
    status: "OVERDUE",
    issuedOn: new Date("2026-07-01T12:00:00.000Z"),
    totalCents: 9900,
    ...partial,
  };
}

async function renderAccount(id: string) {
  const element = await AccountDetailPage({ params: Promise.resolve({ id }) });
  return renderToStaticMarkup(element);
}

function invoiceHrefs(markup: string) {
  return [...markup.matchAll(/href="\/invoices\/([^"]+)"/g)].map((match) => match[1]);
}

describe("Overdue Book rows", () => {
  const book = buildOverdueBook([
    invoice({ id: "inv_a", dueOn: new Date("2026-08-20T12:00:00.000Z") }),
    invoice({ id: "inv_b", dueOn: new Date("2026-07-01T12:00:00.000Z"), totalCents: 24900 }),
    invoice({ id: "inv_paid", dueOn: new Date("2026-06-01T12:00:00.000Z"), status: "PAID" }),
    invoice({ id: "inv_open", dueOn: new Date("2026-06-02T12:00:00.000Z"), status: "OPEN" }),
    invoice({ id: "inv_c", dueOn: new Date("2026-08-04T12:00:00.000Z"), totalCents: 4900 }),
  ]);

  it("keeps only OVERDUE invoices", () => {
    expect(book.map((row) => row.invoiceId)).toEqual(["inv_b", "inv_c", "inv_a"]);
  });

  it("sorts by days past due descending against the demo clock", () => {
    expect(book.map((row) => row.daysPastDue)).toEqual([53, 19, 3]);
  });

  it("uses the invoice total as the outstanding balance", () => {
    expect(book.map((row) => row.outstandingCents)).toEqual([24900, 4900, 9900]);
    expect(outstandingCents({ totalCents: 4900 })).toBe(4900);
  });

  it("has no last activity because no activity records exist yet", () => {
    expect(book.every((row) => row.lastActivityOn === null)).toBe(true);
  });

  it("fills last activity when a Nudge is on the invoice", () => {
    const occurredOn = new Date("2026-08-23T12:00:00.000Z");
    const earlier = new Date("2026-08-20T12:00:00.000Z");
    const dated = buildOverdueBook(
      [
        invoice({ id: "inv_a", dueOn: new Date("2026-08-01T12:00:00.000Z") }),
        invoice({ id: "inv_b", dueOn: new Date("2026-07-01T12:00:00.000Z") }),
      ],
      [
        { invoiceId: "inv_a", type: "NOTE_ADDED", occurredOn },
        { invoiceId: "inv_b", type: "NUDGE_SENT", occurredOn: earlier },
        { invoiceId: "inv_a", type: "NUDGE_SENT", occurredOn: earlier },
        { invoiceId: "inv_a", type: "NUDGE_SENT", occurredOn },
      ],
    );
    expect(dated.find((row) => row.invoiceId === "inv_a")?.lastActivityOn).toEqual(occurredOn);
    expect(dated.find((row) => row.invoiceId === "inv_b")?.lastActivityOn).toEqual(earlier);
  });

  it("is empty when no invoice is OVERDUE", () => {
    expect(buildOverdueBook([invoice({ id: "inv_x", dueOn: new Date(), status: "OPEN" })])).toEqual([]);
  });
});

describe("Customers navigation and list", () => {
  it("adds Customers to the nav", () => {
    expect(NAV).toContainEqual(expect.objectContaining({ href: "/customers", label: "Customers" }));
  });

  it("leaves Collections as the cross-account queue", () => {
    expect(NAV).toContainEqual(expect.objectContaining({ href: "/collections", label: "Collections" }));
  });

  it("lists every seeded account with plan, overdue count, and overdue balance", async () => {
    const accounts = await getAccounts();
    expect(accounts).toHaveLength(24);
    const cobalt = accounts.find((account) => account.id === COBALT);
    expect(cobalt).toMatchObject({
      name: "Cobalt Goods",
      plan: "SCALE",
      overdueCount: 1,
      overdueCents: PLAN_PRICE_CENTS.SCALE,
    });
    expect(accounts.find((account) => account.id === NO_OVERDUE)).toMatchObject({
      overdueCount: 0,
      overdueCents: 0,
    });
  });

  it("renders the list with links to Account Detail and seeded plans through formatUsd", async () => {
    const markup = renderToStaticMarkup(await CustomersPage());
    expect(markup).toContain(`href="/customers/${COBALT}"`);
    expect(markup).toContain("Cobalt Goods");
    expect(markup).toContain(describePlan("SCALE"));
    expect(describePlan("SCALE")).toBe(`Scale · ${formatUsd(24900)}`);
    expect(markup).toContain(formatUsd(24900));
  });
});

describe("Account Detail overdue book", () => {
  it("lists only that account's OVERDUE invoices with every column", async () => {
    const markup = await renderAccount(COBALT);
    expect(invoiceHrefs(markup)).toEqual(["inv_1043"]);
    const cells = [...markup.matchAll(/<td[^>]*>(?:<a[^>]*>)?([^<]*)/g)].map((match) => match[1]);
    expect(cells.slice(0, 6)).toEqual([
      "INV-1043",
      "Jul 10, 2026",
      "Aug 9, 2026",
      "14",
      formatUsd(24900),
      NO_ACTIVITY,
    ]);
    expect(cells).toHaveLength(7);
    expect(markup).toContain('data-nudge="invoice"');
    expect(markup).toContain('action="/api/invoices/inv_1043/nudge"');
    expect(markup).not.toContain("INV-2003");
  });

  it("shows days past due as the demo clock minus the due date", async () => {
    const account = await getAccount(SILVERPINE);
    expect(account?.overdueBook).toHaveLength(1);
    expect(account?.overdueBook[0]).toMatchObject({
      invoiceId: "inv_1047",
      daysPastDue: 11,
      outstandingCents: 9900,
      lastActivityOn: null,
    });
  });

  it("orders multiple rows by days past due descending", () => {
    const markup = renderToStaticMarkup(
      createElement(OverdueBook, {
        rows: buildOverdueBook([
          invoice({ id: "inv_new", dueOn: new Date("2026-08-20T12:00:00.000Z") }),
          invoice({ id: "inv_old", dueOn: new Date("2026-07-01T12:00:00.000Z") }),
        ]),
      }),
    );
    expect(invoiceHrefs(markup)).toEqual(["inv_old", "inv_new"]);
  });

  it("shows no invoice rows when the account has no OVERDUE invoices", async () => {
    const markup = await renderAccount(NO_OVERDUE);
    expect(markup).toContain("Overdue Book");
    expect(invoiceHrefs(markup)).toEqual([]);
    expect(markup).not.toContain("<tbody");
  });

  it("returns not found for an unknown account", async () => {
    await expect(renderAccount("cus_missing")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("Overdue row to invoice page", () => {
  it("links to the existing invoice page, which shows its line items", async () => {
    const [invoiceId] = invoiceHrefs(await renderAccount(COBALT));
    expect(invoiceId).toBe("inv_1043");

    const found = await getInvoice(invoiceId);
    expect(found?.lines.length).toBeGreaterThan(0);

    const page = await InvoiceDetailPage({ params: Promise.resolve({ id: invoiceId }) });
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Line items");
    for (const line of found?.lines ?? []) {
      expect(markup).toContain(line.description);
    }
    expect(markup).not.toContain("Send Nudge");
    expect(markup).not.toContain("/nudge");
  });
});

const PROBE_INVOICE = "inv_1099";

function postNudge(id: string, body?: string) {
  return postInvoiceNudge(
    new Request(`http://127.0.0.1:43173/api/invoices/${id}/nudge`, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body,
    }),
    { params: Promise.resolve({ id }) },
  );
}

function accountNudgeBlock(markup: string) {
  return markup.match(/<div data-nudge="account">([\s\S]*?)<\/div>/)?.[1] ?? "";
}

async function clearAccountActivity(customerId: string) {
  await prisma.activity.deleteMany({ where: { customerId } });
}

describe("Sending a Nudge", () => {
  it("logs NUDGE_SENT for an overdue invoice with an email on file", async () => {
    try {
      const custom = await postNudge("inv_1043", JSON.stringify({ body: "Write your own reminder" }));
      expect(custom.status).toBe(303);
      expect(custom.headers.get("location")).toContain(`/customers/${COBALT}`);
      const again = await postNudge("inv_1043");
      expect(again.status).toBe(303);

      const template = nudgeTemplate({
        number: "INV-1043",
        outstandingCents: PLAN_PRICE_CENTS.SCALE,
        dueOn: new Date("2026-08-09T12:00:00.000Z"),
      });
      const account = await getAccount(COBALT);
      const activities = account?.activities ?? [];
      expect(activities).toHaveLength(2);
      expect(activities[0]).toMatchObject({
        type: NUDGE_SENT,
        status: "sent",
        channel: "email",
        actorName: DEMO_OPERATOR.name,
        invoiceId: "inv_1043",
        body: template,
        occurredOn: DEMO_AS_OF,
      });
      expect(activities[1].body).toBe(template);
      expect(activities[0].createdAt.getTime()).toBeGreaterThan(activities[1].createdAt.getTime());
      expect(account?.overdueBook[0]).toMatchObject({
        invoiceId: "inv_1043",
        lastActivityOn: DEMO_AS_OF,
      });

      const markup = await renderAccount(COBALT);
      expect(markup).toContain('data-activity-type="NUDGE_SENT"');
      expect(markup).toContain('data-activity-status="sent"');
      expect(markup).toContain(` · email`);
      expect(markup).toContain(DEMO_OPERATOR.name);
      expect(markup).toContain(template);
      expect(markup).toContain(formatDate(DEMO_AS_OF));
      expect(markup).not.toContain("Write your own reminder");
    } finally {
      await clearAccountActivity(COBALT);
    }
  });

  it("sends the account Nudge for the most-past-due overdue invoice", async () => {
    await prisma.invoice.deleteMany({ where: { id: PROBE_INVOICE } });
    await prisma.invoice.create({
      data: {
        id: PROBE_INVOICE,
        number: "INV-1099",
        workspaceId: "ws_fieldnote",
        customerId: COBALT,
        plan: "STARTER",
        status: "OVERDUE",
        issuedOn: new Date("2026-05-01T12:00:00.000Z"),
        dueOn: new Date("2026-06-01T12:00:00.000Z"),
        subtotalCents: PLAN_PRICE_CENTS.STARTER,
        taxCents: 0,
        totalCents: PLAN_PRICE_CENTS.STARTER,
      },
    });
    try {
      const markup = await renderAccount(COBALT);
      expect(invoiceHrefs(markup)).toEqual([PROBE_INVOICE, "inv_1043"]);
      expect(accountNudgeBlock(markup)).toContain(`action="/api/invoices/${PROBE_INVOICE}/nudge"`);
      expect(accountNudgeBlock(markup)).not.toMatch(/<button[^>]*\sdisabled=""/);
      expect(markup).toContain('action="/api/invoices/inv_1043/nudge"');

      const response = await postNudge(PROBE_INVOICE);
      expect(response.status).toBe(303);
      const account = await getAccount(COBALT);
      expect(account?.activities[0]).toMatchObject({
        type: NUDGE_SENT,
        status: "sent",
        invoiceId: PROBE_INVOICE,
        channel: "email",
        actorName: DEMO_OPERATOR.name,
      });
      expect(account?.activities[0].body).toContain("INV-1099");
      expect(account?.activities[0].body).toContain(formatUsd(PLAN_PRICE_CENTS.STARTER));
      expect(account?.activities[0].body).toContain("Jun 1, 2026");
      expect(account?.overdueBook.find((row) => row.invoiceId === PROBE_INVOICE)?.lastActivityOn).toEqual(
        DEMO_AS_OF,
      );
    } finally {
      await prisma.activity.deleteMany({ where: { invoiceId: PROBE_INVOICE } });
      await prisma.invoice.deleteMany({ where: { id: PROBE_INVOICE } });
      await clearAccountActivity(COBALT);
    }
  });

  it("disables the Nudge control when the account has no overdue invoices", async () => {
    const markup = await renderAccount(NO_OVERDUE);
    const accountNudge = accountNudgeBlock(markup);
    expect(accountNudge).toContain("Send Nudge");
    expect(accountNudge).toMatch(/<button[^>]*\sdisabled=""/);
    expect(accountNudge).not.toContain("action=");
    expect(markup).not.toContain('data-nudge="invoice"');
  });

  it("does not record a Nudge for an invoice that is not OVERDUE", async () => {
    const response = await postNudge("inv_1041");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Nudge is only available for an OVERDUE invoice",
    });
    expect(await prisma.activity.count({ where: { invoiceId: "inv_1041" } })).toBe(0);
  });

  it("returns 404 when the invoice does not exist", async () => {
    const response = await postNudge("inv_missing");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Invoice not found" });
  });
});

describe("A Nudge that cannot be emailed", () => {
  it.each(["", "not-an-email"])(
    "shows NUDGE_SENT as failed when the email is %j",
    async (email) => {
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: SILVERPINE } });
      await prisma.customer.update({ where: { id: SILVERPINE }, data: { email } });
      try {
        const response = await postNudge("inv_1047");
        expect(response.status).toBe(303);
        const account = await getAccount(SILVERPINE);
        expect(account?.activities[0]).toMatchObject({
          type: NUDGE_SENT,
          status: "failed",
          channel: "email",
          actorName: DEMO_OPERATOR.name,
          invoiceId: "inv_1047",
        });
        expect(account?.overdueBook[0]?.lastActivityOn).toEqual(DEMO_AS_OF);

        const markup = await renderAccount(SILVERPINE);
        expect(markup).toContain('data-activity-type="NUDGE_SENT"');
        expect(markup).toContain('data-activity-status="failed"');
        expect(markup).toContain(NUDGE_FAILED_DETAIL);
        expect(markup).toContain(" · failed");
        expect(markup).not.toContain('data-activity-status="sent"');
      } finally {
        await prisma.customer.update({
          where: { id: SILVERPINE },
          data: { email: customer.email },
        });
        await clearAccountActivity(SILVERPINE);
      }
    },
  );
});
