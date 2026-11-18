"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatUsd } from "@/lib/money";
import {
  PAYMENT_METHODS,
  isPaymentMethod,
  paymentConfirmQuestion,
  paymentMethodLabel,
  type PaymentMethod,
} from "@/lib/payments";

export function RecordPayment({
  invoiceId,
  invoiceNumber,
  outstandingCents,
  initialStep = "choose",
  initialMethod = "check",
}: {
  invoiceId: string;
  invoiceNumber: string;
  outstandingCents: number;
  initialStep?: "choose" | "confirm";
  initialMethod?: PaymentMethod;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"choose" | "confirm">(initialStep);
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (outstandingCents <= 0) {
    return <p className="text-sm text-muted-foreground">This invoice has no outstanding balance.</p>;
  }

  async function confirmPayment() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Payment was not recorded.");
        return;
      }
      setStep("choose");
      router.refresh();
    } catch {
      setError("Payment was not recorded.");
    } finally {
      setPending(false);
    }
  }

  if (step === "confirm") {
    return (
      <div className="space-y-3">
        <p className="text-sm">{paymentConfirmQuestion(outstandingCents, invoiceNumber)}</p>
        <p className="text-sm text-muted-foreground">Method: {paymentMethodLabel(method)}</p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={confirmPayment} disabled={pending}>
            Confirm payment
          </Button>
          <Button type="button" variant="outline" onClick={() => setStep("choose")} disabled={pending}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setStep("confirm");
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="payment-method">Payment method</Label>
        <select
          id="payment-method"
          name="method"
          value={method}
          onChange={(event) => {
            const next = event.target.value;
            if (isPaymentMethod(next)) setMethod(next);
          }}
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {PAYMENT_METHODS.map((option) => (
            <option key={option} value={option}>
              {paymentMethodLabel(option)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">Outstanding balance {formatUsd(outstandingCents)}</p>
      <Button type="submit">Record payment</Button>
    </form>
  );
}
