import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { formatUsd } from "@/lib/money";

export type AccountActivityItem = {
  id: string;
  type: string;
  status: string;
  actorName: string;
  amountCents: number | null;
  method: string | null;
  occurredOn: Date;
};

export function AccountActivity({ activities }: { activities: AccountActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account activity</CardTitle>
        <CardDescription>Collections history for this account, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No account activity yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {activities.map((activity) => (
              <li key={activity.id} data-activity-type={activity.type} data-method={activity.method ?? undefined}>
                <p className="font-medium">{activity.type}</p>
                <p className="text-muted-foreground">
                  {activity.amountCents != null ? formatUsd(activity.amountCents) : "—"}
                  {activity.method ? ` · ${activity.method}` : ""}
                  {` · ${activity.actorName}`}
                  {` · ${formatDate(activity.occurredOn)}`}
                  {` · ${activity.status}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
