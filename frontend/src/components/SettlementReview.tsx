import { useState } from "react";
import { post, useToast, money, number } from "../lib/api";

export function SettlementProposal({
  payment,
  onSaved,
}: {
  payment: any;
  onSaved: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toast = useToast();
  if (payment.credited) return null;
  if (payment.settlementReviews?.some((r: any) => r.status === "PENDING"))
    return <p>A settlement review is waiting for independent approval.</p>;
  return (
    <details className="settlement-details">
      <summary>Review external settlement</summary>
      <form
        className="form settlement-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = Object.fromEntries(new FormData(form));
          setBusy(true);
          setError("");
          try {
            await post(`/admin/payments/${payment.id}/settlement-reviews`, {
              requestId,
              externalReference: data.externalReference,
              evidenceReference: data.evidenceReference,
              explanation: data.explanation,
              password: data.password,
              confirmed: data.confirmed === "on",
            });
            form.reset();
            toast(
              "Evidence recorded. A different verified administrator must review it.",
            );
            onSaved();
          } catch (error: any) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Use an individual merchant/bank settlement record proving{" "}
          {money(payment.cents, payment.currency)} was received for this order.
          A browser success screen is not evidence. This does not mark the
          gateway successful.
        </p>
        <label>
          External transaction / settlement reference
          <input
            name="externalReference"
            minLength={8}
            maxLength={160}
            required
          />
        </label>
        <label>
          Evidence document reference
          <input
            name="evidenceReference"
            minLength={10}
            maxLength={500}
            placeholder="Merchant statement ID or protected evidence location"
            required
          />
        </label>
        <label>
          Evidence and order matching explanation
          <textarea
            name="explanation"
            minLength={20}
            maxLength={1500}
            required
          />
        </label>
        <label>
          Administrator password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="checkbox-label">
          <input name="confirmed" type="checkbox" required />I checked
          authoritative settlement evidence and the exact order, amount and
          currency.
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button secondary" disabled={busy}>
          {busy ? "Recording review…" : "Submit for independent review"}
        </button>
      </form>
    </details>
  );
}
export function SettlementDecision({
  review,
  userId,
  onSaved,
}: {
  review: any;
  userId: string;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toast = useToast();
  if (review.status !== "PENDING")
    return (
      <p>
        {review.status} · {review.decisionReason}
      </p>
    );
  if (review.initiatedBy === userId)
    return (
      <p>
        Waiting for a different verified administrator. You cannot approve your
        own review.
      </p>
    );
  return (
    <details className="settlement-details">
      <summary>Independently review evidence</summary>
      <form
        className="form settlement-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = Object.fromEntries(new FormData(form));
          setBusy(true);
          setError("");
          try {
            const result = await post(
              `/admin/settlement-reviews/${review.id}/decision`,
              {
                decision: data.decision,
                reason: data.reason,
                password: data.password,
                confirmed: data.confirmed === "on",
              },
            );
            form.reset();
            toast(`Review ${result.status.toLowerCase()}.`);
            onSaved();
          } catch (error: any) {
            setError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          {money(review.payment.cents, review.payment.currency)} ·{" "}
          {number(review.payment.coins)} coins · {review.payment.user?.email}
        </p>
        <p>
          External reference: <code>{review.externalReference}</code>
        </p>
        <p>
          Evidence: <code>{review.evidenceReference}</code>
        </p>
        <p>
          Initiator: <code>{review.initiatedBy}</code>
        </p>
        <p>{review.explanation}</p>
        <label>
          Decision
          <select name="decision">
            <option value="APPROVE">Approve evidenced settlement</option>
            <option value="REJECT">Reject insufficient evidence</option>
          </select>
        </label>
        <label>
          Independent review explanation
          <textarea name="reason" minLength={20} maxLength={1000} required />
        </label>
        <label>
          Administrator password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="checkbox-label">
          <input name="confirmed" type="checkbox" required />I independently
          examined the evidence and verified my decision.
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Recording decision…" : "Confirm independent decision"}
        </button>
      </form>
    </details>
  );
}
export function GatewayVerification({
  payment,
  configured,
  onSaved,
}: {
  payment: any;
  configured: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form settlement-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          await post(
            `/admin/payments/${payment.id}/reconcile`,
            payment.intentId
              ? {}
              : { gatewayPaymentId: data.get("gatewayPaymentId") },
          );
          onSaved();
        } catch (error: any) {
          setError(error.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!payment.intentId && (
        <label>
          Gateway payment ID from merchant records
          <input
            name="gatewayPaymentId"
            maxLength={128}
            required
            disabled={!configured}
          />
        </label>
      )}
      <button
        className="button secondary"
        disabled={busy || !configured || payment.provider !== "transactworld"}
      >
        {busy ? "Checking provider…" : "Verify with gateway"}
      </button>
      {!configured && (
        <p>Inquiry credentials must be configured on the backend.</p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
