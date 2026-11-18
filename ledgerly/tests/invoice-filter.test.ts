import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/invoices",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/data", () => ({
  async getInvoices(filters?: { status?: string; q?: string }) {
    const invoices = [
      {
        id: "inv_1044",
        number: "INV-1044",
        plan: "SCALE",
        status: "OVERDUE",
        issuedOn: new Date("2026-07-10"),
        dueOn: new Date("2026-08-09"),
        totalCents: 24900,
        customer: { name: "Cobalt Goods" },
        disputes: [],
      },
      {
        id: "inv_1045",
        number: "INV-1045",
        plan: "STARTER",
        status: "OPEN",
        issuedOn: new Date("2026-07-12"),
        dueOn: new Date("2026-08-11"),
        totalCents: 4900,
        customer: { name: "Cobalt Goods" },
        disputes: [],
      },
      {
        id: "inv_1002",
        number: "INV-1002",
        plan: "GROWTH",
        status: "PAID",
        issuedOn: new Date("2026-06-01"),
        dueOn: new Date("2026-07-01"),
        totalCents: 9900,
        customer: { name: "Acme North" },
        disputes: [],
      },
    ];
    return invoices.filter((invoice) => {
      if (filters?.status && filters.status !== "ALL" && invoice.status !== filters.status) return false;
      if (filters?.q) {
        const haystack = `${invoice.number} ${invoice.customer.name} ${invoice.plan}`.toLowerCase();
        if (!haystack.includes(filters.q.toLowerCase().trim())) return false;
      }
      return true;
    });
  },
  async getDisputes(filters?: { status?: string }) {
    const disputes = [
      {
        id: "dsp_1044",
        status: "NEEDS_REVIEW",
        reason: "Scale renewal billed twice.",
        openedOn: new Date("2026-08-01"),
        disputedAmountCents: 24900,
        invoice: { number: "INV-1044", plan: "SCALE", customer: { name: "Cobalt Goods" } },
      },
      {
        id: "dsp_1002",
        status: "OPEN",
        reason: "Growth seat count.",
        openedOn: new Date("2026-08-02"),
        disputedAmountCents: 9900,
        invoice: { number: "INV-1002", plan: "GROWTH", customer: { name: "Acme North" } },
      },
    ];
    if (!filters?.status || filters.status === "ALL") return disputes;
    return disputes.filter((dispute) => dispute.status === filters.status);
  },
}));

const { FilterPills } = await import("@/components/filter-pills");
const InvoicesPage = (await import("@/app/invoices/page")).default;
const DisputesPage = (await import("@/app/disputes/page")).default;

const INVOICE_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "OPEN", label: "Open" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "PAID", label: "Paid" },
  { id: "DRAFT", label: "Draft" },
  { id: "VOID", label: "Void" },
];

const DISPUTE_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "NEEDS_REVIEW", label: "Needs review" },
  { id: "OPEN", label: "Open" },
  { id: "ACCEPTED", label: "Accepted" },
  { id: "DECLINED", label: "Declined" },
];

function anchors(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => {
    const attrs = match[1] ?? "";
    return {
      href: (/href="([^"]*)"/.exec(attrs)?.[1] ?? "").replaceAll("&amp;", "&"),
      className: /class="([^"]*)"/.exec(attrs)?.[1] ?? "",
      label: (match[2] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    };
  });
}

function pillHref(
  pathname: string,
  items: { id: string; label: string }[],
  label: string,
  extra?: { q?: string },
) {
  const html = renderToStaticMarkup(
    createElement(FilterPills, { pathname, value: "ALL", extra, items }),
  );
  const pill = anchors(html).find((anchor) => anchor.label === label);
  if (!pill) throw new Error(`Missing ${label} pill`);
  return pill.href;
}

function queryFromHref(href: string) {
  const url = new URL(href, "http://127.0.0.1:43173");
  return {
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  };
}

function activePillLabels(html: string) {
  return anchors(html)
    .filter((anchor) => anchor.className.split(/\s+/).includes("bg-indigo"))
    .map((anchor) => anchor.label);
}

describe("invoice and dispute filters", () => {
  it("lists only OVERDUE invoices when the Overdue pill is selected", async () => {
    const query = queryFromHref(pillHref("/invoices", INVOICE_FILTERS, "Overdue"));
    const html = renderToStaticMarkup(
      await InvoicesPage({ searchParams: Promise.resolve(query) }),
    );

    expect(query.status).toBe("OVERDUE");
    expect(html).toContain("INV-1044");
    expect(html).not.toContain("INV-1045");
    expect(html).not.toContain("INV-1002");
    expect(activePillLabels(html)).toEqual(["Overdue"]);
  });

  it("keeps the Overdue filter when the invoice search is filled", async () => {
    const query = queryFromHref(
      pillHref("/invoices", INVOICE_FILTERS, "Overdue", { q: "Cobalt" }),
    );
    const html = renderToStaticMarkup(
      await InvoicesPage({ searchParams: Promise.resolve(query) }),
    );

    expect(query).toEqual({ status: "OVERDUE", q: "Cobalt" });
    expect(html).toContain("INV-1044");
    expect(html).not.toContain("INV-1045");
    expect(html).not.toContain("INV-1002");
  });

  it("lists the full book when All is selected", async () => {
    const query = queryFromHref(pillHref("/invoices", INVOICE_FILTERS, "All"));
    const html = renderToStaticMarkup(
      await InvoicesPage({ searchParams: Promise.resolve(query) }),
    );

    expect(query.status).toBeUndefined();
    expect(html).toContain("INV-1044");
    expect(html).toContain("INV-1045");
    expect(html).toContain("INV-1002");
    expect(activePillLabels(html)).toEqual(["All"]);
  });

  it("lists only NEEDS_REVIEW disputes when Needs review is selected", async () => {
    const query = queryFromHref(pillHref("/disputes", DISPUTE_FILTERS, "Needs review"));
    const html = renderToStaticMarkup(
      await DisputesPage({ searchParams: Promise.resolve({ status: query.status }) }),
    );

    expect(query.status).toBe("NEEDS_REVIEW");
    expect(html).toContain("dsp_1044");
    expect(html).not.toContain("dsp_1002");
    expect(activePillLabels(html)).toEqual(["Needs review"]);
  });
});
