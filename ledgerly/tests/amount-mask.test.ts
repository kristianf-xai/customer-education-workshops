import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountDetailPage from "@/app/customers/[id]/page";
import CustomersPage from "@/app/customers/page";
import {
  NO_ACTIVITY,
  UPGRADE_TO_VIEW_AMOUNTS,
  displayAmount,
  outstandingCents,
  type AccountSummary,
  type OverdueBookRow,
} from "@/lib/accounts";
import { getAccount, getAccounts } from "@/lib/data";
import { formatUsd } from "@/lib/money";
import { PLAN_PRICE_CENTS } from "@/lib/plans";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/data", () => ({
  getAccount: vi.fn(),
  getAccounts: vi.fn(),
}));

const PILOT = "PILOT";
const COBALT = "cus_quarrypine";
const OAKIRON = "cus_oakiron";
const SILVERPINE = "cus_silverpine";
const CENTS = PLAN_PRICE_CENTS.SCALE;

function account(partial: Pick<AccountSummary, "id" | "name" | "plan" | "overdueCents"> & Partial<AccountSummary>): AccountSummary {
  return {
    overdueCount: partial.overdueCents > 0 ? 1 : 0,
    ...partial,
  };
}

function row(markup: string, accountId: string) {
  return markup.match(new RegExp(`data-account-id="${accountId}"[\\s\\S]*?</tr>`))?.[0] ?? "";
}

const overdueRow: OverdueBookRow = {
  invoiceId: "inv_1043",
  number: "INV-1043",
  issuedOn: new Date("2026-07-10T12:00:00.000Z"),
  dueOn: new Date("2026-08-09T12:00:00.000Z"),
  daysPastDue: 14,
  outstandingCents: CENTS,
  lastActivityOn: null,
};

describe("amount masking outside the catalog", () => {
  beforeEach(() => {
    vi.mocked(getAccounts).mockReset();
    vi.mocked(getAccount).mockReset();
  });

  it("masks dollar figures on the customers list, Overdue Book, and balance card, and still renders the invoice row", async () => {
    vi.mocked(getAccounts).mockResolvedValue([
      account({ id: COBALT, name: "Cobalt Goods", plan: PILOT, overdueCents: CENTS }),
      account({ id: OAKIRON, name: "Oakiron Supply", plan: PILOT, overdueCents: 0 }),
      account({
        id: SILVERPINE,
        name: "Silverpine Outfitters",
        plan: "GROWTH",
        overdueCents: PLAN_PRICE_CENTS.GROWTH,
      }),
    ]);

    const list = renderToStaticMarkup(await CustomersPage());
    const pilot = row(list, COBALT);
    const zero = row(list, OAKIRON);
    const growth = row(list, SILVERPINE);

    expect(pilot).toContain("Cobalt Goods");
    expect(pilot).toContain(`href="/customers/${COBALT}"`);
    expect(pilot).toContain(PILOT);
    expect(pilot).toContain(UPGRADE_TO_VIEW_AMOUNTS);
    expect(pilot).not.toContain(formatUsd(CENTS));
    expect(pilot).not.toContain("$");

    expect(zero).toContain("Oakiron Supply");
    expect(zero).toContain(UPGRADE_TO_VIEW_AMOUNTS);
    expect(zero).not.toContain(formatUsd(0));

    expect(growth).toContain(formatUsd(PLAN_PRICE_CENTS.GROWTH));
    expect(growth).not.toContain(UPGRADE_TO_VIEW_AMOUNTS);

    vi.mocked(getAccount).mockResolvedValue({
      customer: {
        id: COBALT,
        name: "Cobalt Goods",
        contactName: "Ellis Marlow",
        email: "accounts@cobaltgoods.example",
        plan: PILOT,
      },
      summary: account({ id: COBALT, name: "Cobalt Goods", plan: PILOT, overdueCents: CENTS }),
      overdueBook: [overdueRow],
    });

    const detail = renderToStaticMarkup(
      await AccountDetailPage({ params: Promise.resolve({ id: COBALT }) }),
    );
    expect(detail.match(new RegExp(UPGRADE_TO_VIEW_AMOUNTS, "g"))).toHaveLength(2);
    expect(detail).toContain("1 overdue invoice");
    expect(detail).toContain("Overdue Book");
    expect(detail).toContain("OVERDUE invoices");
    expect(detail).toContain(`href="/invoices/${overdueRow.invoiceId}"`);
    expect(detail).toContain(overdueRow.number);
    expect(detail).toContain("Jul 10, 2026");
    expect(detail).toContain("Aug 9, 2026");
    expect(detail).toContain(String(overdueRow.daysPastDue));
    expect(detail).toContain(NO_ACTIVITY);
    expect(detail).not.toContain(formatUsd(CENTS));
    expect(detail).not.toContain("$");
    expect(displayAmount(CENTS, PILOT)).toBe(UPGRADE_TO_VIEW_AMOUNTS);
    expect(displayAmount(0, PILOT)).toBe(UPGRADE_TO_VIEW_AMOUNTS);
  });

  it("shows the amount being recorded on payment confirmation and keeps the stored cents", () => {
    expect(outstandingCents({ totalCents: CENTS })).toBe(CENTS);
    expect(displayAmount(CENTS, PILOT, "payment-confirm")).toBe(formatUsd(CENTS));
    expect(displayAmount(CENTS, "STARTER", "payment-confirm")).toBe(formatUsd(CENTS));

    const markup = renderToStaticMarkup(
      createElement("p", null, displayAmount(CENTS, PILOT, "payment-confirm")),
    );
    expect(markup).toContain(formatUsd(CENTS));
    expect(markup).not.toContain(UPGRADE_TO_VIEW_AMOUNTS);
  });
});
