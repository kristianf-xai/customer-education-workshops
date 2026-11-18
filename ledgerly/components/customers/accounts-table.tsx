import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { describePlan, displayAmount, type AccountSummary } from "@/lib/accounts";

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
            <TableCell className="text-right font-medium">
              {displayAmount(account.overdueCents, account.plan)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
