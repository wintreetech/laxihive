import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  post,
  useToast,
  money,
  number,
  readLocal,
  writeLocal,
  api,
} from "../lib/api";
import { Badge } from "./UI";
import { accessTypes, accessLabel } from "../../../backend/shared/access";
import { walletChange } from "../../../backend/shared/rules";
export function Records({
  items,
  columns,
  action,
}: {
  items: any[];
  columns: [string, (r: any) => any][];
  action?: (r: any) => React.ReactNode;
}) {
  return items.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([l]) => (
              <th key={l}>{l}</th>
            ))}
            {action && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={r.id ?? r.gameSlug ?? i}>
              {columns.map(([l, value]) => (
                <td key={l}>{value(r)}</td>
              ))}
              {action && <td>{action(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="muted">No matching records yet.</p>
  );
}
const date = (v: any) => (v ? new Date(v).toLocaleString() : "—");
export const transactionColumns: [string, (r: any) => any][] = [
  ["Date", (r) => date(r.createdAt)],
  [
    "Activity",
    (r) => (
      <>
        {r.description}
        <small>{r.kind}</small>
      </>
    ),
  ],
  ["Coins", (r) => (r.amount > 0 ? "+" : "") + number(r.amount)],
  [
    "Balance / debt",
    (r) => number(r.balanceAfter) + " / " + number(r.debtAfter),
  ],
  ["Reference", (r) => <code>{r.reference}</code>],
];
export const paymentColumns: [string, (r: any) => any][] = [
  [
    "Order / reference",
    (r) => (
      <>
        {r.id}
        <small>{r.checkoutId || "No merchant reference"}</small>
        <small>{r.intentId || "No gateway payment ID"}</small>
      </>
    ),
  ],
  ["Customer", (r) => r.user?.email ?? r.userId],
  ["Amount", (r) => money(r.cents, r.currency)],
  ["Coins", (r) => number(r.coins)],
  [
    "Status",
    (r) => (
      <>
        {r.status}
        <small>{r.credited ? "Wallet fulfilled" : "Not credited"}</small>
        <small>
          {r.fulfillmentSource === "MANUAL_SETTLEMENT"
            ? "Independent settlement review"
            : r.gatewayVerifiedAt
              ? "Gateway verified"
              : "No verified source"}
        </small>
      </>
    ),
  ],
  ["Verified", (r) => date(r.gatewayVerifiedAt)],
  ["Created", (r) => date(r.createdAt)],
];
export function PricingEditor({ game, mode, busy, save }: any) {
  const initial = mode.draft ?? mode.live;
  const [config, setConfig] = useState({
      accessType: initial.accessType,
      coinPrice: initial.coinPrice,
      trialSeconds: initial.trialSeconds,
      sessionSeconds: initial.sessionSeconds,
      active: initial.active,
    }),
    [reason, setReason] = useState("");
  async function submit(publish: boolean) {
    if (
      publish &&
      !window.confirm(
        `Publish ${game.name} ${mode.mode}: ${accessLabel(config)}? Existing sessions retain their prices.`,
      )
    )
      return;
    await save(
      `/admin/game-pricing/${game.slug}/${mode.mode}`,
      { config, reason, publish, expectedVersion: mode.live.version },
      "PUT",
    );
  }
  return (
    <div className="pricing-mode">
      <h3>
        {mode.mode}{" "}
        <Badge color="green">
          Live: {accessLabel(mode.live)} · v{mode.live.version}
        </Badge>
      </h3>
      <p>
        {mode.draft
          ? "Unpublished draft — these values are not charged until you publish this mode."
          : "Edit this mode, then save a draft or explicitly publish the changes."}
      </p>
      <form
        className="form admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        <label>
          Access type
          <select
            value={config.accessType}
            onChange={(e) =>
              setConfig({
                ...config,
                accessType: e.target.value,
                coinPrice:
                  e.target.value === "FREE_FULL" ? 0 : config.coinPrice || 25,
              })
            }
          >
            {accessTypes
              .filter(
                (t) => mode.mode === "advanced" || t !== "PERMANENT_UNLOCK",
              )
              .map((t) => (
                <option key={t}>{t}</option>
              ))}
          </select>
        </label>
        <label>
          Coin price
          <input
            type="number"
            value={config.coinPrice}
            min={0}
            max={100000}
            disabled={config.accessType === "FREE_FULL"}
            onChange={(e) =>
              setConfig({ ...config, coinPrice: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Preview duration (seconds)
          <input
            type="number"
            min={5}
            max={120}
            value={config.trialSeconds}
            onChange={(e) =>
              setConfig({ ...config, trialSeconds: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Full attempt limit (seconds)
          <input
            type="number"
            min={30}
            max={game.slug === "word-blitz" ? 90 : 600}
            value={config.sessionSeconds}
            onChange={(e) =>
              setConfig({ ...config, sessionSeconds: Number(e.target.value) })
            }
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={config.active}
            onChange={(e) => setConfig({ ...config, active: e.target.checked })}
          />
          Mode active
        </label>
        <label>
          Reason
          <input
            minLength={10}
            maxLength={200}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="button secondary" disabled={busy}>
            Save unpublished draft
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || reason.trim().length < 10}
            onClick={() => submit(true)}
          >
            Publish this mode
          </button>
        </div>
      </form>
      <p>
        Billing unit:{" "}
        {config.accessType === "PERMANENT_UNLOCK"
          ? "permanent ownership"
          : "one completed, abandoned or timed-out attempt"}
        . No recurring charge. Paid scores do not enter competitive
        leaderboards.
      </p>
    </div>
  );
}
export function WalletEditor({ user, onSaved }: any) {
  const [mode, setMode] = useState("add"),
    [value, setValue] = useState(0),
    [reason, setReason] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    toast = useToast();
  const w = user.wallet,
    amount =
      mode === "target"
        ? value - w.balance
        : mode === "deduct"
          ? -value
          : value;
  const after = walletChange(w.balance, w.debt, amount),
    valid =
      Number.isSafeInteger(value) &&
      value >= 0 &&
      amount !== 0 &&
      (amount >= 0 || (w.debt === 0 && w.balance >= -amount)) &&
      (mode !== "target" || w.debt === 0);
  return (
    <section className="panel">
      <h2>{user.displayName}'s wallet</h2>
      <p>
        Current: {number(w.balance)} coins · {number(w.debt)} debt. Credits
        settle debt first.
      </p>
      <form
        className="form admin-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            !valid ||
            !window.confirm(
              `Confirm ${amount > 0 ? "+" : ""}${amount} coins for ${user.email}? Result: ${after.balance} available, ${after.debt} debt.`,
            )
          )
            return;
          setBusy(true);
          const payload = {
              userId: user.id,
              ...(mode === "target"
                ? {
                    targetBalance: value,
                    expectedBalance: w.balance,
                    expectedDebt: w.debt,
                  }
                : { amount }),
              reason,
            },
            fingerprint = JSON.stringify(payload),
            saved = readLocal<any>("lexi-admin-adjustment", null),
            requestId =
              saved?.fingerprint === fingerprint
                ? saved.requestId
                : crypto.randomUUID();
          writeLocal("lexi-admin-adjustment", { fingerprint, requestId });
          try {
            await post("/admin/wallet-adjustment", {
              ...payload,
              requestId,
              ...(password ? { password } : {}),
            });
            writeLocal("lexi-admin-adjustment", null);
            setValue(0);
            setReason("");
            setPassword("");
            await onSaved();
            toast("Audited adjustment recorded.");
          } catch (e: any) {
            toast(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Action
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="add">Add coins</option>
            <option value="deduct">Deduct coins</option>
            <option value="target">Set target available balance</option>
          </select>
        </label>
        <label>
          Coins
          <input
            type="number"
            min={0}
            max={100000}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </label>
        <p aria-live="polite">
          Preview: {number(after.balance)} available · {number(after.debt)}{" "}
          debt. Change: {amount > 0 ? "+" : ""}
          {number(amount)} coins.
        </p>
        {!valid && value > 0 && (
          <p className="form-error">
            Debits need sufficient available coins; target corrections require
            zero debt.
          </p>
        )}
        <label>
          Mandatory reason
          <input
            minLength={10}
            maxLength={200}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {Math.abs(amount) >= 10000 && (
          <label>
            Confirm administrator password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <button className="button primary" disabled={busy || !valid}>
          Confirm recorded adjustment
        </button>
      </form>
    </section>
  );
}
export function Analytics({ data }: any) {
  const categoryCoins = new Map<string, number>();
  for (const row of data.popularPaid) {
    const category =
      data.categoryUse.find((g: any) => g.gameSlug === row.gameSlug)
        ?.category || "Other";
    categoryCoins.set(
      category,
      (categoryCoins.get(category) || 0) + (row._sum.coinPrice ?? 0),
    );
  }
  const usage = data.popularPaid.reduce(
    (s: number, r: any) => s + (r._sum.coinPrice ?? 0),
    0,
  );
  return (
    <>
      <div className="admin-metrics">
        {[
          ["Previews started", data.trialStarted],
          ["Previews completed", data.completedPreviews],
          ["Preview purchases", data.trialConverted],
          ["Conversion rate", data.conversionPercent.toFixed(1) + "%"],
          ["Paid authorizations", data.paidSessions],
          ["Paying customers", data.payingUsers],
          ["Session coins consumed", number(usage)],
          [
            "Average coins spent per paying customer",
            number(Math.round(data.averageCoinsPerPayingUser)),
          ],
          [
            "Average completed-result seconds",
            Math.round(data.recordedAverageDuration ?? 0),
          ],
        ].map(([l, v]) => (
          <section className="panel" key={l}>
            <span>{l}</span>
            <strong>{v}</strong>
          </section>
        ))}
      </div>
      <p>{data.note}</p>
      <RevenueReport />
      <section className="panel">
        <h2>Category session coin usage</h2>
        <Records
          items={[...categoryCoins].map(([category, coins]) => ({
            category,
            coins,
          }))}
          columns={[
            ["Category", (r) => r.category],
            ["Coins", (r) => number(r.coins)],
          ]}
        />
        <p>
          Category profit is unavailable until payment fees, taxes and operating
          costs can be attributed. Coin usage is not money revenue.
        </p>
      </section>
      <section className="panel">
        <h2>Payment statuses</h2>
        <Records
          items={data.paymentStates}
          columns={[
            ["Status", (r) => r.status],
            ["Orders", (r) => r._count],
          ]}
        />
      </section>
      <section className="panel">
        <h2>Verified revenue after known reversals</h2>
        <Records
          items={data.netRevenue}
          columns={[
            ["Currency", (r) => r.currency.toUpperCase()],
            ["Net revenue", (r) => money(r.cents, r.currency)],
            ["Orders", (r) => r.orders],
          ]}
        />
      </section>
      <section className="panel">
        <h2>Payment revenue by currency</h2>
        <Records
          items={data.revenue}
          columns={[
            ["Currency", (r) => r.currency.toUpperCase()],
            ["Verified orders", (r) => r._count],
            ["Gross", (r) => money(r._sum.cents ?? 0, r.currency)],
            ["Refunds", (r) => money(r._sum.refundedCents ?? 0, r.currency)],
            ["Chargebacks", (r) => money(r._sum.disputeCents ?? 0, r.currency)],
            [
              "Average gross order",
              (r) => money(r._avg.cents ?? 0, r.currency),
            ],
          ]}
        />
      </section>
      <section className="panel">
        <h2>Coin ledger totals</h2>
        <Records
          items={data.coinKinds}
          columns={[
            ["Type", (r) => r.kind],
            ["Transactions", (r) => r._count],
            ["Net coins", (r) => number(r._sum.amount ?? 0)],
          ]}
        />
      </section>
      <section className="panel">
        <h2>Session activity</h2>
        <Records
          items={data.sessionStates}
          columns={[
            ["State", (r) => r.billingState],
            ["Count", (r) => r._count],
          ]}
        />
      </section>
      <section className="panel">
        <h2>Most purchased game sessions</h2>
        <Records
          items={data.popularPaid}
          columns={[
            ["Game", (r) => r.gameSlug],
            ["Sessions", (r) => r._count],
            ["Coins consumed", (r) => number(r._sum.coinPrice ?? 0)],
          ]}
        />
      </section>
      <section className="panel">
        <h2>Popular purchase amounts</h2>
        <Records
          items={data.amounts}
          columns={[
            ["Amount", (r) => money(r.cents, r.currency)],
            ["Purchases", (r) => r._count],
          ]}
        />
      </section>
      <section className="panel">
        <h2>Revenue over time</h2>
        <Records
          items={data.revenueSeries}
          columns={[
            ["UTC day", (r) => r._id.day],
            ["Currency", (r) => r._id.currency],
            ["Net revenue", (r) => money(r.cents, r._id.currency)],
          ]}
        />
      </section>
      <section className="panel">
        <h2>Coin usage · last 30 days</h2>
        <Records
          items={data.coinSeries}
          columns={[
            ["UTC day", (r) => r._id.day],
            ["Type", (r) => r._id.kind],
            ["Net coins", (r) => number(r.coins)],
          ]}
        />
      </section>
    </>
  );
}
export function RevenueReport() {
  const [range, setRange] = useState(() => ({
    from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  }));
  const query = useQuery({
    queryKey: ["admin-revenue-report", range],
    queryFn: () => api("/admin/revenue-report?" + new URLSearchParams(range)),
  });
  return (
    <section className="panel">
      <h2>Settlement and reporting-currency revenue</h2>
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          setRange({ from: String(d.get("from")), to: String(d.get("to")) });
        }}
      >
        <label>
          From (UTC)
          <input name="from" type="date" defaultValue={range.from} required />
        </label>
        <label>
          Through (UTC)
          <input name="to" type="date" defaultValue={range.to} required />
        </label>
        <button className="button secondary">Apply dates</button>
      </form>
      {query.isPending ? (
        <p role="status">Loading recorded revenue…</p>
      ) : query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        <>
          <p>
            {money(query.data.netBaseCents, query.data.baseCurrency)} net from{" "}
            {query.data.convertedOrders} orders with known conversion.{" "}
            {query.data.missingFxOrders} historical orders have no recorded rate
            and are excluded from this combined figure.
          </p>
          <Records
            items={query.data.sources}
            columns={[
              ["Verification source", (r) => r.source],
              ["Currency", (r) => r.currency.toUpperCase()],
              ["Orders", (r) => r.orders],
              ["Net amount", (r) => money(r.cents, r.currency)],
            ]}
          />
          <p>{query.data.note}</p>
        </>
      )}
    </section>
  );
}
