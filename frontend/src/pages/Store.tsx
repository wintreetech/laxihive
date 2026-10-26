import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Coins,
  ArrowUpRight,
  ArrowRight,
  Check,
  ShieldCheck,
  Wallet as WalletIcon,
  ArrowDownLeft,
  ArrowUpRight as Spend,
  Layers3,
  LockKeyhole,
  RefreshCw,
  Clock3,
} from "lucide-react";
import { CoinSlider } from "../components/CoinSlider";
import { api, post, useAuth, useToast, money, number } from "../lib/api";
import {
  PageTitle,
  SectionTitle,
  Empty,
  ErrorState,
  Loading,
  Art,
  Badge,
} from "../components/UI";
import { games } from "../../../backend/shared/catalog";
export default function Store() {
  const config = useQuery({
    queryKey: ["pricing"],
    queryFn: () => api("/coins/config"),
    retry: 1,
  });
  return (
    <div className="page">
      <PageTitle
        eyebrow="THE LEXIHIVE COIN STORE"
        title="More curiosity. More possibility."
        description="Buy coins for clearly priced game sessions and permanent advanced expansions."
      />
      <div className="store-layout">
        <div className="store-story">
          <div className="coin-scene">
            <div className="coin-ring" />
            <span className="coin-illustration">
              <Coins size={68} />
            </span>
            <span className="coin-small coin-left">✦</span>
            <span className="coin-small coin-right">⬡</span>
            <span className="coin-spark">✧</span>
          </div>
          <h2>
            A little extra.
            <br />A whole new challenge.
          </h2>
          <p>
            Choose a session or a permanent expansion. Games labeled Free to
            play cost zero coins; paid access always asks for confirmation.
          </p>
          <div className="store-checks">
            {[
              "One-time purchase. No subscription.",
              "Permanent unlocks stay with your account.",
              "No paid advantages on leaderboards.",
            ].map((t) => (
              <span key={t}>
                <Check size={15} />
                {t}
              </span>
            ))}
          </div>
          <Link className="text-link" to="/expansions">
            See what you can unlock
            <ArrowUpRight size={15} />
          </Link>
        </div>
        {config.isPending ? (
          <Loading />
        ) : config.error ? (
          <ErrorState error={config.error} retry={() => config.refetch()} />
        ) : (
          <CoinSlider config={config.data} />
        )}
      </div>
      <div className="info-strip">
        <ShieldCheck />
        <div>
          <h3>Made for play. Kept simple.</h3>
          <p>
            Coins are non-transferable virtual items with no cash value. No
            cash-out, trading or gambling. Hive Quest stars are earned
            separately through play.
          </p>
          <Link to="/virtual-currency">
            Virtual currency policy
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
export function Wallet() {
  const { user } = useAuth();
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api("/wallet"),
    enabled: !!user,
  });
  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: () => api("/wallet/transactions"),
    enabled: !!user,
  });
  if (!user) return <GuestWallet />;
  return (
    <div className="page">
      <PageTitle
        eyebrow="YOUR SPACE / WALLET"
        title="Your next possibility, in one place."
        description="A clear view of every coin earned, purchased and spent."
        action={
          <Link to="/store" className="button primary">
            <Coins size={16} />
            Get coins
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      {wallet.error ? (
        <ErrorState error={wallet.error} />
      ) : (
        <>
          <div className="wallet-stats">
            <div className="balance-card">
              <span>
                <WalletIcon size={17} />
                Available balance
              </span>
              <h2>
                <Coins />
                {number(wallet.data?.balance)}
              </h2>
              <p>Virtual coins · For a little more adventure</p>
            </div>
            <div className="stat-card">
              <span>Purchased coins</span>
              <strong>
                {number(
                  wallet.data?.summary?.find((s: any) => s.kind === "purchased")
                    ?._sum.amount ?? 0,
                )}
              </strong>
              <p>Verified credits before reversals</p>
            </div>
            <div className="stat-card">
              <span>Net session spending</span>
              <strong>
                {number(
                  Math.max(
                    0,
                    -(
                      wallet.data?.summary
                        ?.filter((s: any) =>
                          [
                            "game_session_charge",
                            "game_session_refund",
                          ].includes(s.kind),
                        )
                        .reduce(
                          (sum: number, s: any) => sum + (s._sum.amount ?? 0),
                          0,
                        ) ?? 0
                    ),
                  ),
                )}
              </strong>
              <p>Session charges less coin refunds</p>
            </div>
            <div className="stat-card">
              <span>Earned through play</span>
              <strong>
                {number(
                  wallet.data?.summary?.find((s: any) => s.kind === "earned")
                    ?._sum.amount ?? 0,
                )}
              </strong>
              <p>From your achievements</p>
            </div>
            <div className="stat-card">
              <span>Permanent unlock spending</span>
              <strong>
                {number(
                  Math.abs(
                    wallet.data?.summary?.find((s: any) => s.kind === "spent")
                      ?._sum.amount ?? 0,
                  ),
                )}
              </strong>
              <p>One-time expansion purchases</p>
            </div>
          </div>
          {wallet.data?.debt > 0 && (
            <div className="error-state">
              A payment reversal left {number(wallet.data.debt)} coins to
              reconcile. New credits offset this amount first; spending and
              advanced access are paused. Contact support for review.
            </div>
          )}
        </>
      )}
      <SectionTitle
        title="Every little transaction"
        to="/purchase-history"
        label="Purchase history"
      />
      {transactions.isPending ? (
        <Loading />
      ) : transactions.error ? (
        <ErrorState error={transactions.error} />
      ) : transactions.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Date</th>
                <th>Coins</th>
                <th>Balance after</th>
              </tr>
            </thead>
            <tbody>
              {transactions.data.map((t: any) => (
                <tr key={t.id}>
                  <td>
                    <span
                      className={`transaction-icon ${t.amount > 0 ? "green" : "violet"}`}
                    >
                      {t.amount > 0 ? (
                        <ArrowDownLeft size={16} />
                      ) : (
                        <Spend size={16} />
                      )}
                    </span>
                    {t.description}
                    <small>{t.kind.replaceAll("_", " ")}</small>
                  </td>
                  <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className={t.amount > 0 ? "positive" : ""}>
                    {t.amount > 0 ? "+" : ""}
                    {number(t.amount)}
                  </td>
                  <td>
                    {number(t.balanceAfter)}
                    {t.debtAfter > 0 && (
                      <small>{t.debtAfter} pending reconciliation</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="A fresh wallet. A world to discover."
          description="Your first achievement earns 25 virtual coins. Play a free game and begin your collection."
          action={
            <Link className="button secondary" to="/games">
              Find a game
              <ArrowRight size={16} />
            </Link>
          }
        />
      )}
      <div className="info-strip">
        <Coins />
        <p>
          Coins have no cash value. They cannot be transferred or redeemed for
          money. Hive Quest stars are separate from your coin balance.
        </p>
      </div>
    </div>
  );
}
function GuestWallet() {
  return (
    <div className="page">
      <Empty
        title="Your little treasury awaits."
        description="Sign in to see your server-saved balance, transactions and expansion unlocks."
        action={
          <Link className="button primary" to="/login?redirect=/wallet">
            Sign in
            <ArrowUpRight size={16} />
          </Link>
        }
      />
    </div>
  );
}
export function Expansions() {
  const { user } = useAuth();
  const q = useQueryClient(),
    toast = useToast();
  const [busy, setBusy] = useState("");
  const data = useQuery({
    queryKey: ["expansions", user?.id],
    queryFn: () => api("/expansions"),
  });
  async function unlock(item: any) {
    if (
      !window.confirm(
        `Unlock ${item.name} for ${item.price} virtual coins? This spends coins from your wallet.`,
      )
    )
      return;
    setBusy(item.id);
    try {
      await post(`/expansions/${item.id}/unlock`);
      await q.invalidateQueries();
      toast("A new challenge is yours. Happy exploring.");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="page">
      <PageTitle
        eyebrow="FOR THE EXTRA-CURIOUS"
        title="Go a little further."
        description="Optional advanced modes. Fresh variations. The same love of a good challenge."
      />
      <div className="expansion-note">
        <Layers3 size={19} />
        <span>
          Permanent expansions are purchased once. Paid sessions and advanced
          scores stay off competitive leaderboards.
        </span>
        <Link to="/store">
          Get coins
          <ArrowUpRight size={14} />
        </Link>
      </div>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} />
      ) : (
        <div className="expansion-grid">
          {data.data.map((item: any) => (
            <article className="expansion-card" key={item.id}>
              <Art game={games.find((g) => g.slug === item.gameSlug)!} />
              <div>
                <Badge color={item.owned ? "green" : "violet"}>
                  {item.owned ? (
                    <>
                      <Check size={11} />
                      In your collection
                    </>
                  ) : (
                    <>
                      <LockKeyhole size={11} />
                      Optional expansion
                    </>
                  )}
                </Badge>
                <h2>{item.name}</h2>
                <p>
                  Permanently own the advanced variation of {item.game.name}.
                  Daily and campaign boards follow their own seed schedule.
                </p>
                <div className="expansion-bottom">
                  <strong>
                    <Coins size={17} />
                    {number(item.price)}
                  </strong>
                  {item.owned ? (
                    <Link
                      className="button secondary"
                      to={`/games/${item.gameSlug}?mode=advanced`}
                    >
                      Play advanced
                      <ArrowUpRight size={15} />
                    </Link>
                  ) : user ? (
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => unlock(item)}
                    >
                      {busy === item.id ? "Unlocking…" : "Unlock challenge"}
                      <ArrowUpRight size={15} />
                    </button>
                  ) : (
                    <Link
                      className="button primary"
                      to="/login?redirect=/expansions"
                    >
                      Sign in to unlock
                    </Link>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
export function PurchaseHistory() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["purchases"],
    queryFn: () => api("/payments"),
    enabled: !!user,
  });
  if (!user) return <GuestWallet />;
  return (
    <div className="page">
      <PageTitle
        eyebrow="YOUR SPACE / PURCHASES"
        title="Your purchase history."
        description="Every checkout has a clear, server-verified status."
      />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Order reference</th>
                <th>Coins</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((p: any) => (
                <tr key={p.id}>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                  <td>{money(p.cents, p.currency)}</td>
                  <td>
                    <Link to={`/purchase/success?payment=${p.id}`}>
                      <code>{p.id}</code>
                    </Link>
                  </td>
                  <td>{number(p.coins)}</td>
                  <td>
                    <Badge color={p.status === "paid" ? "green" : "amber"}>
                      {p.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No purchases yet."
          description="Free gameplay is always here. When you choose to purchase coins, the details will appear here."
          action={
            <Link to="/store" className="button secondary">
              Explore the store
            </Link>
          }
        />
      )}
    </div>
  );
}
export function PurchaseStatus({ cancelled = false }: { cancelled?: boolean }) {
  const [params] = useSearchParams(),
    { user, refresh } = useAuth();
  const id = params.get("payment");
  const q = useQuery({
    queryKey: ["payment", id],
    queryFn: () => api(`/payments/${id}/status`),
    enabled: !!id && !!user,
    refetchInterval: (query) =>
      query.state.data?.status === "pending"
        ? 3000
        : query.state.data?.status === "abandoned"
          ? 30000
          : false,
  });
  const status = q.data?.status;
  const failed = status === "failed" || status === "expired";
  const adjusted = ["refunded", "partially_refunded", "disputed"].includes(
    status,
  );
  useEffect(() => {
    if (status === "paid") refresh();
  }, [status, refresh]);
  return (
    <div className="page purchase-status">
      <span className="empty-icon">
        {status === "paid" ? (
          <Check size={32} />
        ) : cancelled ? (
          <RefreshCw size={32} />
        ) : (
          <Clock3 size={32} />
        )}
      </span>
      <h1>
        {status === "paid"
          ? "Your next adventure is funded."
          : adjusted
            ? "Your purchase has a payment adjustment."
            : status === "abandoned"
              ? "Payment confirmation is overdue."
              : failed
                ? "This payment was not completed."
                : cancelled
                  ? "A little pause. No problem."
                  : "Waiting for payment verification."}
      </h1>
      <p>
        {status === "paid"
          ? `${number(q.data.coins)} coins were credited after server-verified payment confirmation.`
          : adjusted
            ? "Open your wallet to see the recorded coin adjustment and any reconciliation amount. Contact support with this order reference for assistance."
            : status === "abandoned"
              ? "This order has no verified payment confirmation. Keep the order reference and contact support before paying again. A late verified capture can still update your wallet."
              : failed
                ? "No coins were added for this checkout. You can try again from the coin store."
                : cancelled
                  ? "Checkout was left before confirmation. You can return to the store whenever you’re ready."
                  : "This page never credits coins. Your wallet updates only after the server verifies the payment gateway notification and payment status."}
      </p>
      {q.error && <ErrorState error={q.error} />}
      <Badge color={status === "paid" ? "green" : failed ? "red" : "amber"}>
        {status || "No verified payment status available"}
      </Badge>
      {id && (
        <p>
          Order reference: <code>{id}</code> ·{" "}
          <Link to="/contact">Contact support</Link>
        </p>
      )}
      {q.data?.provider === "transactworld" &&
        q.data?.canReconcile &&
        status !== "paid" && (
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await post(`/payments/${id}/reconcile`);
                await q.refetch();
              } catch (e: any) {
                window.alert(e.message);
              }
            }}
          >
            Check with gateway
            <RefreshCw size={15} />
          </button>
        )}
      <div className="button-row">
        <Link
          className="button primary"
          to={status === "paid" ? "/wallet" : "/store"}
        >
          {status === "paid" ? "Open wallet" : "Back to coin store"}
          <ArrowRight size={16} />
        </Link>
        <Link className="button secondary" to="/games">
          Keep playing
        </Link>
      </div>
    </div>
  );
}
