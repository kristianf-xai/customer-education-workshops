import { PageHeader } from "@/components/page-header";
import { AccountsTable } from "@/components/customers/accounts-table";
import { Card, CardContent } from "@/components/ui/card";
import { getAccounts } from "@/lib/data";

export const metadata = {
  title: "Customers",
};

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const accounts = await getAccounts();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        eyebrow="Accounts"
        title="Customers"
        description="Every account in the book with its overdue invoices and balance, against the frozen 23 Aug 2026 clock."
      />
      <Card className="overflow-hidden py-0">
        <CardContent className="px-0 py-2">
          <AccountsTable accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
}
