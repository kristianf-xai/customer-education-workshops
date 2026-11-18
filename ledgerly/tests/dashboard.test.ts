import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClipboardList, TrendingUp } from "lucide-react";
import { describe, expect, it } from "vitest";
import DashboardPage, { dynamic as dashboardDynamic } from "@/app/page";
import { KpiCard } from "@/components/kpi-card";
import { buildOverdueBook, outstandingCents, type AccountInvoice } from "@/lib/accounts";
import { DEMO_AS_OF } from "@/lib/clock";
import { getDashboard } from "@/lib/data";
import {
  activitiesFromLastActivity,
  catalogMrrCents,
  collectionsCardHint,
  collectionsForInvoices,
  collectionsTotals,
  percentChange,
} from "@/lib/dashboard";
import { formatUsd, sumCents } from "@/lib/money";
import { PLAN_PRICE_CENTS } from "@/lib/plans";

describe("catalogMrrCents", () => {
  it("sums only catalog plan prices", () => {
    expect(
      catalogMrrCents([{ plan: "STARTER" }, { plan: "GROWTH" }, { plan: "SCALE" }]),
    ).toBe(4900 + 9900 + 24900);
  });
});

describe("percentChange", () => {
  it("returns null when the prior period is empty and current is not", () => {
    expect(percentChange(9900, 0)).toBeNull();
  });

  it("computes a real lift without inventing a baseline", () => {
    expect(percentChange(19800, 9900)).toBe(100);
  });
});

function day(isoDate: string) {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

function bookInvoice(
  partial: Partial<AccountInvoice> & Pick<AccountInvoice, "id" | "status" | "totalCents">,
): AccountInvoice {
  return {
    number: partial.id.toUpperCase(),
    issuedOn: day("2026-07-01"),
    dueOn: day("2026-08-01"),
    ...partial,
  };
}

const overdueBook = [
  { status: "OVERDUE", totalCents: PLAN_PRICE_CENTS.SCALE },
  { status: "OVERDUE", totalCents: PLAN_PRICE_CENTS.GROWTH },
  { status: "OPEN", totalCents: PLAN_PRICE_CENTS.STARTER },
  { status: "PAID", totalCents: PLAN_PRICE_CENTS.SCALE },
  { status: "DRAFT", totalCents: PLAN_PRICE_CENTS.STARTER },
  { status: "VOID", totalCents: PLAN_PRICE_CENTS.GROWTH },
];

describe("collections totals", () => {
  it("sums outstandingCents for OVERDUE invoices only", () => {
    const totals = collectionsTotals(overdueBook, []);
    expect(totals.overdueCount).toBe(2);
    expect(totals.overdueCents).toBe(PLAN_PRICE_CENTS.SCALE + PLAN_PRICE_CENTS.GROWTH);
    expect(totals.overdueCents).toBe(
      outstandingCents({ totalCents: PLAN_PRICE_CENTS.SCALE }) +
        outstandingCents({ totalCents: PLAN_PRICE_CENTS.GROWTH }),
    );
    expect(formatUsd(totals.overdueCents)).toBe("$348.00");
  });

  it("counts the demo day inside the 7 days ending that day", () => {
    const totals = collectionsTotals([], [
      { occurredOn: day("2026-08-16") },
      { occurredOn: new Date("2026-08-17T00:00:00.000Z") },
      { occurredOn: day("2026-08-20") },
      { occurredOn: new Date("2026-08-23T00:00:00.000Z") },
      { occurredOn: DEMO_AS_OF },
      { occurredOn: new Date("2026-08-23T23:59:00.000Z") },
      { occurredOn: new Date("2026-08-24T00:00:00.000Z") },
    ]);
    expect(totals.workedToday).toBe(3);
    expect(totals.workedLast7Days).toBe(5);
  });

  it("includes a note, nudge, or payment on the next totals", () => {
    const before = collectionsTotals(overdueBook, []);
    expect(before.workedToday).toBe(0);
    expect(before.workedLast7Days).toBe(0);

    for (const kind of ["note", "nudge", "payment"] as const) {
      const recorded = [{ kind, occurredOn: DEMO_AS_OF }];
      const next = collectionsTotals(
        overdueBook,
        recorded.map((activity) => ({ occurredOn: activity.occurredOn })),
      );
      expect(next.workedToday).toBe(before.workedToday + 1);
      expect(next.workedLast7Days).toBe(before.workedLast7Days + 1);
      expect(next.overdueCents).toBe(before.overdueCents);
    }

    const recorded = [
      { kind: "note", occurredOn: DEMO_AS_OF },
      { kind: "nudge", occurredOn: DEMO_AS_OF },
      { kind: "payment", occurredOn: DEMO_AS_OF },
    ];
    const afterPayment = collectionsTotals(
      overdueBook.map((invoice) =>
        invoice.status === "OVERDUE" && invoice.totalCents === PLAN_PRICE_CENTS.SCALE
          ? { ...invoice, status: "PAID" }
          : invoice,
      ),
      recorded.map((activity) => ({ occurredOn: activity.occurredOn })),
    );
    expect(afterPayment.overdueCents).toBe(PLAN_PRICE_CENTS.GROWTH);
    expect(afterPayment.overdueCount).toBe(1);
    expect(afterPayment.workedToday).toBe(3);
    expect(afterPayment.workedLast7Days).toBe(3);
  });

  it("counts lastActivityOn and ignores rows with none", () => {
    const activities = activitiesFromLastActivity([
      { lastActivityOn: DEMO_AS_OF },
      { lastActivityOn: day("2026-08-18") },
      { lastActivityOn: null },
    ]);
    expect(activities).toEqual([{ occurredOn: DEMO_AS_OF }, { occurredOn: day("2026-08-18") }]);
    expect(
      collectionsTotals([{ status: "OVERDUE", totalCents: PLAN_PRICE_CENTS.STARTER }], activities),
    ).toMatchObject({ workedToday: 1, workedLast7Days: 2, overdueCents: PLAN_PRICE_CENTS.STARTER });
  });

  it("reads the current book, which has no activity yet", () => {
    const invoices = [
      bookInvoice({ id: "inv_overdue", status: "OVERDUE", totalCents: PLAN_PRICE_CENTS.SCALE }),
      bookInvoice({ id: "inv_open", status: "OPEN", totalCents: PLAN_PRICE_CENTS.STARTER }),
    ];
    expect(buildOverdueBook(invoices).every((row) => row.lastActivityOn === null)).toBe(true);
    expect(collectionsForInvoices(invoices)).toEqual({
      overdueCents: PLAN_PRICE_CENTS.SCALE,
      overdueCount: 1,
      workedToday: 0,
      workedLast7Days: 0,
    });
  });

  it("phrases the overdue count, today, and the last 7 days", () => {
    expect(
      collectionsCardHint({
        overdueCents: PLAN_PRICE_CENTS.STARTER,
        overdueCount: 1,
        workedToday: 2,
        workedLast7Days: 3,
      }),
    ).toBe("1 overdue invoice · 2 worked today · 3 in the last 7 days");
    expect(
      collectionsCardHint({
        overdueCents: 0,
        overdueCount: 0,
        workedToday: 0,
        workedLast7Days: 0,
      }),
    ).toBe("0 overdue invoices · 0 worked today · 0 in the last 7 days");
  });
});

describe("collections card", () => {
  it("reports the seeded overdue book in catalog cents and no worked activity", async () => {
    const dashboard = await getDashboard();
    const overdue = dashboard.invoices.filter((invoice) => invoice.status === "OVERDUE");
    expect(overdue.map((invoice) => invoice.totalCents).sort((a, b) => a - b)).toEqual([
      PLAN_PRICE_CENTS.GROWTH,
      PLAN_PRICE_CENTS.SCALE,
      PLAN_PRICE_CENTS.SCALE,
      PLAN_PRICE_CENTS.SCALE,
    ]);
    expect(dashboard.kpis.collections).toEqual({
      overdueCents: sumCents(overdue.map((invoice) => outstandingCents(invoice))),
      overdueCount: overdue.length,
      workedToday: 0,
      workedLast7Days: 0,
    });
    expect(dashboard.kpis.collections.overdueCents).toBe(
      PLAN_PRICE_CENTS.SCALE * 3 + PLAN_PRICE_CENTS.GROWTH,
    );
  });

  it("renders one collections card and refreshes from getDashboard on the next load", async () => {
    expect(dashboardDynamic).toBe("force-dynamic");
    const dashboard = await getDashboard();
    const markup = renderToStaticMarkup(await DashboardPage());
    expect(markup.match(/Collections/g)).toHaveLength(1);
    expect(markup).toContain(formatUsd(dashboard.kpis.collections.overdueCents));
    expect(markup).toContain(collectionsCardHint(dashboard.kpis.collections));
    expect(markup).toContain("bg-indigo-soft");
    expect(markup).toContain("text-indigo");
    expect(markup).toContain("text-danger");
    expect(markup).not.toContain("Upgrade to view amounts");
    expect(markup).toContain("Monthly Recurring Revenue");
    expect(markup).toContain("Open Invoices");
    expect(markup).toContain("Disputes");
    expect(markup).toContain("Collected This Month");
  });

  it("colors the overdue amount with the danger tone and leaves other figures alone", () => {
    const collections = renderToStaticMarkup(
      createElement(KpiCard, {
        label: "Collections",
        value: formatUsd(PLAN_PRICE_CENTS.SCALE),
        hint: "1 overdue invoice · 0 worked today · 0 in the last 7 days",
        icon: ClipboardList,
        tone: "indigo",
        valueTone: "danger",
      }),
    );
    expect(collections).toContain("bg-indigo-soft text-indigo");
    expect(collections).toContain("text-[26px] leading-none font-semibold tracking-tight text-danger");
    expect(collections).toContain(formatUsd(PLAN_PRICE_CENTS.SCALE));

    const revenue = renderToStaticMarkup(
      createElement(KpiCard, {
        label: "Monthly Recurring Revenue",
        value: formatUsd(PLAN_PRICE_CENTS.GROWTH),
        hint: "seeded plans",
        icon: TrendingUp,
        tone: "indigo",
      }),
    );
    expect(revenue).toContain("text-[26px] leading-none font-semibold tracking-tight");
    expect(revenue).not.toContain("text-danger");
  });
});
