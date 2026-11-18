import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as customerNotesRoute from "@/app/api/customers/[id]/notes/route";
import * as noteByIdRoute from "@/app/api/notes/[id]/route";
import AccountDetailPage from "@/app/customers/[id]/page";
import CustomersPage from "@/app/customers/page";
import InvoiceDetailPage from "@/app/invoices/[id]/page";
import { NAV } from "@/components/app-chrome";
import { OverdueBook } from "@/components/customers/overdue-book";
import {
  NO_ACTIVITY,
  NOTE_ADDED,
  buildOverdueBook,
  describePlan,
  outstandingCents,
  type AccountActivity,
  type AccountInvoice,
} from "@/lib/accounts";
import { DEMO_AS_OF } from "@/lib/clock";
import { getAccount, getAccounts, getInvoice } from "@/lib/data";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { DEMO_OPERATOR } from "@/lib/demo-session";
import { formatUsd } from "@/lib/money";
import { NOTE_EDIT_WINDOW_MS } from "@/lib/notes";
import { PLAN_PRICE_CENTS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));

afterEach(async () => {
  await prisma.activity.deleteMany();
  await prisma.collectionNote.deleteMany();
});

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

  it("fills last activity when a note activity is on that invoice", () => {
    const occurredOn = new Date("2026-08-23T12:00:00.000Z");
    const earlier = new Date("2026-08-22T12:00:00.000Z");
    const activities: AccountActivity[] = [
      {
        invoiceId: "inv_b",
        type: NOTE_ADDED,
        occurredOn: earlier,
        createdAt: earlier,
      },
      {
        invoiceId: "inv_b",
        type: NOTE_ADDED,
        occurredOn,
        createdAt: occurredOn,
      },
      {
        invoiceId: null,
        type: NOTE_ADDED,
        occurredOn,
        createdAt: occurredOn,
      },
      {
        invoiceId: "inv_a",
        type: "PAYMENT_RECORDED",
        occurredOn,
        createdAt: occurredOn,
      },
    ];
    const withActivity = buildOverdueBook(
      [
        invoice({ id: "inv_a", dueOn: new Date("2026-08-20T12:00:00.000Z") }),
        invoice({ id: "inv_b", dueOn: new Date("2026-07-01T12:00:00.000Z") }),
      ],
      activities,
    );
    expect(withActivity.find((row) => row.invoiceId === "inv_b")?.lastActivityOn).toEqual(occurredOn);
    expect(withActivity.find((row) => row.invoiceId === "inv_a")?.lastActivityOn).toBeNull();
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
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>Save note<\/button>/);
  });
});

function noteRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function saveNote(customerId: string, body: unknown, invoiceId?: unknown) {
  const payload = invoiceId === undefined ? { body } : { body, invoiceId };
  return customerNotesRoute.POST(noteRequest(`http://127.0.0.1/api/customers/${customerId}/notes`, "POST", payload), {
    params: Promise.resolve({ id: customerId }),
  });
}

async function editNote(id: string, body: unknown) {
  return noteByIdRoute.PATCH(noteRequest(`http://127.0.0.1/api/notes/${id}`, "PATCH", { body }), {
    params: Promise.resolve({ id }),
  });
}

describe("Collection notes", () => {
  it("saves a non-blank note first in the activity feed, attributed to Avery, with a timestamp and NOTE_ADDED", async () => {
    const earlier = new Date(Date.now() - 2 * 60 * 1000);
    await prisma.collectionNote.create({
      data: {
        id: "note_earlier",
        customerId: COBALT,
        authorName: DEMO_OPERATOR.name,
        body: "Earlier promise.",
        createdAt: earlier,
        updatedAt: earlier,
      },
    });

    const response = await saveNote(COBALT, "  Latest promise.  ");
    expect(response.status).toBe(200);
    const stored = await prisma.collectionNote.findFirstOrThrow({
      where: { customerId: COBALT, body: "Latest promise." },
    });
    expect(stored.authorName).toBe(DEMO_OPERATOR.name);
    expect(stored.invoiceId).toBeNull();

    const activities = await prisma.activity.findMany({ where: { customerId: COBALT, type: NOTE_ADDED } });
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: NOTE_ADDED,
      actorName: DEMO_OPERATOR.name,
      invoiceId: null,
      occurredOn: DEMO_AS_OF,
    });
    expect(JSON.parse(activities[0]?.payload ?? "{}")).toEqual({
      noteId: stored.id,
      body: "Latest promise.",
    });

    const account = await getAccount(COBALT);
    expect(account?.notes.map((note) => note.body)).toEqual(["Latest promise.", "Earlier promise."]);
    expect(account?.overdueBook[0]?.lastActivityOn).toBeNull();

    const markup = await renderAccount(COBALT);
    expect(markup.indexOf("Latest promise.")).toBeGreaterThan(-1);
    expect(markup.indexOf("Latest promise.")).toBeLessThan(markup.indexOf("Earlier promise."));
    expect(markup).toContain(DEMO_OPERATOR.name);
    expect(markup).toContain(formatTimestamp(stored.createdAt));
  });

  it("rejects a blank note and leaves the feed unchanged", async () => {
    const created = await saveNote(COBALT, "Keep this note.");
    expect(created.status).toBe(200);
    const before = await prisma.collectionNote.findMany({ where: { customerId: COBALT } });
    const beforeActivities = await prisma.activity.count({ where: { customerId: COBALT } });

    const whitespace = await saveNote(COBALT, "   ");
    const empty = await saveNote(COBALT, "");
    expect(whitespace.status).toBe(400);
    expect(empty.status).toBe(400);

    const after = await prisma.collectionNote.findMany({ where: { customerId: COBALT } });
    expect(after.map((note) => note.body)).toEqual(before.map((note) => note.body));
    expect(await prisma.activity.count({ where: { customerId: COBALT } })).toBe(beforeActivities);

    const markup = await renderAccount(COBALT);
    expect(markup).toContain("Keep this note.");
    expect(markup).not.toContain("Original note:");
  });

  it("ties a note to the invoice when an invoice id is sent", async () => {
    const response = await saveNote(COBALT, "Called about the overdue invoice.", "inv_1043");
    expect(response.status).toBe(200);

    const stored = await prisma.collectionNote.findFirstOrThrow({ where: { customerId: COBALT } });
    expect(stored.invoiceId).toBe("inv_1043");
    const activity = await prisma.activity.findFirstOrThrow({ where: { customerId: COBALT, type: NOTE_ADDED } });
    expect(activity.invoiceId).toBe("inv_1043");
    expect(JSON.parse(activity.payload)).toMatchObject({ noteId: stored.id, body: stored.body });

    const account = await getAccount(COBALT);
    expect(account?.notes[0]).toMatchObject({ invoiceId: "inv_1043", invoiceNumber: "INV-1043" });
    expect(account?.overdueBook[0]).toMatchObject({
      invoiceId: "inv_1043",
      lastActivityOn: DEMO_AS_OF,
    });

    const markup = await renderAccount(COBALT);
    expect(markup).toContain("Invoice INV-1043");
    expect(markup).toContain(formatDate(DEMO_AS_OF));
  });

  it("rejects an invoice that is not on the account", async () => {
    const response = await saveNote(COBALT, "Wrong invoice.", "inv_1047");
    expect(response.status).toBe(400);
    expect(await prisma.collectionNote.count()).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
  });

  it("returns 404 when the account does not exist", async () => {
    const response = await saveNote("cus_missing", "No such account.");
    expect(response.status).toBe(404);
    expect(await prisma.collectionNote.count()).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
  });
});

describe("Collection note edits", () => {
  it("saves a new body within 15 minutes and keeps the original on the activity", async () => {
    const created = await saveNote(COBALT, "Will pay on Friday.", "inv_1043");
    expect(created.status).toBe(200);
    const before = await prisma.collectionNote.findFirstOrThrow({ where: { customerId: COBALT } });
    expect(Date.now() - before.createdAt.getTime()).toBeLessThan(NOTE_EDIT_WINDOW_MS);

    const activityBefore = await prisma.activity.findFirstOrThrow({ where: { type: NOTE_ADDED } });
    expect(activityBefore.occurredOn).toEqual(DEMO_AS_OF);

    const response = await editNote(before.id, "  Will pay on Monday.  ");
    expect(response.status).toBe(200);

    const after = await prisma.collectionNote.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.body).toBe("Will pay on Monday.");
    expect(after.authorName).toBe(before.authorName);
    expect(after.invoiceId).toBe(before.invoiceId);
    expect(after.createdAt.toISOString()).toBe(before.createdAt.toISOString());

    const activities = await prisma.activity.findMany({ where: { type: NOTE_ADDED } });
    expect(activities).toHaveLength(1);
    expect(activities[0]?.payload).toBe(activityBefore.payload);
    expect(JSON.parse(activities[0]?.payload ?? "{}").body).toBe("Will pay on Friday.");

    const markup = await renderAccount(COBALT);
    expect(markup).toContain("Will pay on Monday.");
    expect(markup).toContain("Original note: Will pay on Friday.");
  });

  it("rejects an edit when the note is older than 15 minutes", async () => {
    const createdAt = new Date(Date.now() - NOTE_EDIT_WINDOW_MS - 1000);
    const note = await prisma.collectionNote.create({
      data: {
        id: "note_old",
        customerId: COBALT,
        authorName: DEMO_OPERATOR.name,
        body: "Original promise.",
        createdAt,
        updatedAt: createdAt,
      },
    });

    const response = await editNote(note.id, "Changed.");
    expect(response.status).toBe(403);
    const stored = await prisma.collectionNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(stored.body).toBe("Original promise.");
    expect(stored.updatedAt.toISOString()).toBe(createdAt.toISOString());
    const markup = await renderAccount(COBALT);
    expect(markup).toContain("Original promise.");
    expect(markup).not.toContain("Save changes");
  });

  it("rejects an edit when the author is not Avery Quinn", async () => {
    const createdAt = new Date();
    const note = await prisma.collectionNote.create({
      data: {
        id: "note_other",
        customerId: COBALT,
        authorName: "Ellis Marlow",
        body: "Ellis left a note.",
        createdAt,
        updatedAt: createdAt,
      },
    });

    const response = await editNote(note.id, "Avery rewrites it.");
    expect(response.status).toBe(403);
    const stored = await prisma.collectionNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(stored.body).toBe("Ellis left a note.");
    const markup = await renderAccount(COBALT);
    expect(markup).toContain("Ellis left a note.");
    expect(markup).not.toContain("Save changes");
  });

  it("shows no delete control for a saved note", async () => {
    const response = await saveNote(COBALT, "Promise stands.");
    expect(response.status).toBe(200);
    const markup = await renderAccount(COBALT);
    expect(markup).toContain("Promise stands.");
    expect(markup).toContain("Save changes");
    expect(markup.toLowerCase()).not.toContain("delete");
    expect(customerNotesRoute).not.toHaveProperty("DELETE");
    expect(noteByIdRoute).not.toHaveProperty("DELETE");
  });

  it("returns 404 when the note does not exist", async () => {
    const response = await editNote("note_missing", "Nobody saved this.");
    expect(response.status).toBe(404);
    expect(await prisma.collectionNote.count()).toBe(0);
  });
});
