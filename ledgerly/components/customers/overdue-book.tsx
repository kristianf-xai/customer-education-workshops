import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NO_ACTIVITY, type OverdueBookRow } from "@/lib/accounts";
import { formatDate } from "@/lib/dates";
import { formatUsd } from "@/lib/money";

export function OverdueBook({ rows }: { rows: OverdueBookRow[] }) {
  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="px-5 pt-5">
        <CardTitle>Overdue Book</CardTitle>
        <CardDescription>
          OVERDUE invoices for this account, most days past due first.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {rows.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">
            No overdue invoices on this account.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-5">Invoice</TableHead>
                <TableHead>Invoice date</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Days past due</TableHead>
                <TableHead className="text-right">Outstanding balance</TableHead>
                <TableHead className="px-5">Last activity</TableHead>
                <TableHead className="px-5">Nudge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.invoiceId} className="relative" data-invoice-id={row.invoiceId}>
                  <TableCell className="px-5">
                    <Link
                      href={`/invoices/${row.invoiceId}`}
                      className="font-mono text-[13px] font-medium hover:underline after:absolute after:inset-0"
                    >
                      {row.number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.issuedOn)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.dueOn)}</TableCell>
                  <TableCell className="text-right">{row.daysPastDue}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatUsd(row.outstandingCents)}
                  </TableCell>
                  <TableCell className="px-5 text-muted-foreground">
                    {row.lastActivityOn ? formatDate(row.lastActivityOn) : NO_ACTIVITY}
                  </TableCell>
                  <TableCell className="relative z-10 px-5">
                    <form
                      data-nudge="invoice"
                      method="post"
                      action={`/api/invoices/${row.invoiceId}/nudge`}
                    >
                      <Button type="submit" size="sm" aria-label={`Send Nudge for ${row.number}`}>
                        Send Nudge
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
