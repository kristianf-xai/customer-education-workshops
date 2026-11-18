import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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
import { getAccount, getAccounts, getInvoice } from "@/lib/data";
import { formatUsd } from "@/lib/money";
import { PLAN_PRICE_CENTS } from "@/lib/plans";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => {} }),
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

  it("subtracts recorded payments from the outstanding balance", () => {
    expect(
      outstandingCents({
        totalCents: PLAN_PRICE_CENTS.SCALE,
        payments: [{ amountCents: PLAN_PRICE_CENTS.SCALE }],
      }),
    ).toBe(0);
    expect(
      outstandingCents({
        totalCents: PLAN_PRICE_CENTS.SCALE,
        payments: [{ amountCents: PLAN_PRICE_CENTS.STARTER }],
      }),
    ).toBe(PLAN_PRICE_CENTS.SCALE - PLAN_PRICE_CENTS.STARTER);
    const withPayment = buildOverdueBook([
      invoice({
        id: "inv_paid_down",
        dueOn: new Date("2026-08-01T12:00:00.000Z"),
        totalCents: PLAN_PRICE_CENTS.GROWTH,
        payments: [{ amountCents: PLAN_PRICE_CENTS.STARTER }],
      }),
    ]);
    expect(withPayment[0]?.outstandingCents).toBe(PLAN_PRICE_CENTS.GROWTH - PLAN_PRICE_CENTS.STARTER);
  });

  it("has no last activity because no activity records exist yet", () => {
    expect(book.every((row) => row.lastActivityOn === null)).toBe(true);
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
    expect(cells).toEqual(["INV-1043", "Jul 10, 2026", "Aug 9, 2026", "14", formatUsd(24900), NO_ACTIVITY]);
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
  });
});
