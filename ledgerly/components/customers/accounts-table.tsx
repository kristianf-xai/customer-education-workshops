import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describePlan, type AccountSummary } from "@/lib/accounts";
import { formatUsd } from "@/lib/money";

export function AccountsTable({ accounts }: { accounts: AccountSummary[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead className="text-right">Overdue invoices</TableHead>
          <TableHead className="text-right">Overdue balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id} data-account-id={account.id}>
            <TableCell>
              <Link href={`/customers/${account.id}`} className="font-medium hover:underline">
                {account.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{describePlan(account.plan)}</TableCell>
            <TableCell className="text-right">{account.overdueCount}</TableCell>
            <TableCell className="text-right font-medium">{formatUsd(account.overdueCents)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
