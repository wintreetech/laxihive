import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Coins, ShieldCheck } from "lucide-react";
import { post, useAuth, money, number } from "../lib/api";
import { submitGatewayForm } from "../lib/checkout";
import { SecureNote } from "./UI";
import { EmailVerification } from "./EmailVerification";
import type { Pricing, PurchaseCurrency } from "../../../backend/shared/rules";
type StoreConfig = Pricing & {
  paymentsAvailable: boolean;
  testMode: boolean;
  provider?: string;
  currencies?: PurchaseCurrency[];
  sessionExamples?: { name: string; mode: string; coinPrice: number }[];
};
export function CoinSlider({
  config,
  compact = false,
}: {
  config?: StoreConfig;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [selection, setCurrency] = useState<PurchaseCurrency | undefined>(
    params.get("currency") === "EUR"
      ? "EUR"
      : params.get("currency") === "USD"
        ? "USD"
        : undefined,
  );
  const currencies = config?.currencies ?? ["USD", "EUR"];
  const currency: PurchaseCurrency =
    selection ?? (currencies.includes("USD") ? "USD" : currencies[0] || "EUR");
  const currencyAvailable = currencies.includes(currency);
  const [cents, setCents] = useState(Number(params.get("amount")) || 2500),
    [quote, setQuote] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const min = config?.minCents ?? 500,
    max = config?.maxCents ?? 50000,
    step = config?.stepCents ?? 500;
  const amount = Math.max(
    min,
    Math.min(max, min + Math.round((cents - min) / step) * step),
  );
  const rate =
    currency === "EUR" ? config?.coinsPerEuro : config?.coinsPerDollar;
  const coins = config?.enabled && rate ? (amount * rate) / 100 : null;
  function select(v: number) {
    setCents(v);
    setQuote(null);
    setError("");
  }
  async function purchase() {
    if (compact) {
      navigate(`/store?amount=${amount}&currency=${currency}`);
      return;
    }
    if (!currencyAvailable) {
      setError(
        `${currency} checkout is unavailable. Choose ${currencies.join(" or ")}.`,
      );
      return;
    }
    if (!user) {
      navigate(
        `/login?redirect=${encodeURIComponent(`/store?amount=${amount}&currency=${currency}`)}`,
      );
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (!quote) {
        setQuote(await post("/coins/quote", { cents: amount, currency }));
      } else {
        const data = await post("/payments/checkout", { quoteId: quote.id });
        if (data.provider === "transactworld") submitGatewayForm(data);
        else if (data.url) window.location.assign(data.url);
        else
          throw new Error(
            "The payment provider returned an incomplete checkout.",
          );
      }
    } catch (e: any) {
      setError(e.message);
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`coin-slider-panel ${compact ? "compact" : ""}`}>
      <div className="slider-top">
        <div>
          <span className="eyebrow">A LITTLE MORE POSSIBILITY</span>
          <h3>Choose your next adventure.</h3>
        </div>
        <span className="store-safe">
          <ShieldCheck size={13} />
          {compact
            ? "YOUR CHOICE"
            : config?.provider === "transactworld"
              ? "TRANSACTWORLD"
              : config?.testMode
                ? "STRIPE TEST MODE"
                : "SECURE CHECKOUT"}
        </span>
      </div>
      <label className="currency-picker">
        Payment currency
        <select
          value={currency}
          disabled={busy}
          onChange={(e) => {
            setCurrency(e.target.value as PurchaseCurrency);
            setQuote(null);
            setError("");
          }}
        >
          <option value="USD">USD - US dollar</option>
          <option value="EUR">EUR - Euro</option>
        </select>
      </label>
      <div className="slider-amounts">
        <div>
          <span>You choose</span>
          <strong key={amount} className="amount-pop">
            {money(amount, currency)}
            <small>{currency}</small>
          </strong>
        </div>
        <span className="slider-convert">
          <ArrowRight size={20} />
        </span>
        <div className="coin-count">
          <span>You receive</span>
          <strong>
            <Coins size={25} />
            {coins === null ? <small>Pricing opens soon</small> : number(coins)}
          </strong>
          <span>virtual coins</span>
        </div>
      </div>
      <label
        htmlFor={compact ? "home-amount" : "store-amount"}
        className="sr-only"
      >
        Purchase amount in {currency === "EUR" ? "euros" : "US dollars"}
      </label>
      <input
        className="coin-range"
        id={compact ? "home-amount" : "store-amount"}
        type="range"
        min={min}
        max={max}
        step={step}
        value={amount}
        disabled={busy}
        onChange={(e) => select(Number(e.target.value))}
        aria-valuetext={`${money(amount, currency)}${coins === null ? "" : `, ${coins} virtual coins`}`}
        style={
          {
            "--range-progress": `${max === min ? 0 : ((amount - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
      <div className="slider-labels">
        <span>{money(min, currency)}</span>
        <span>Slide to find your amount</span>
        <span>{money(max, currency)}</span>
      </div>
      <div className="quick-amounts">
        {[500, 1000, 2500, 5000, 10000, 25000, 50000]
          .filter((v) => v >= min && v <= max && (v - min) % step === 0)
          .map((v) => (
            <button
              key={v}
              disabled={busy}
              onClick={() => select(v)}
              className={amount === v ? "active" : ""}
            >
              {money(v, currency).replace(".00", "")}
            </button>
          ))}
      </div>
      <div className="slider-summary">
        <span>
          {coins === null
            ? "Your choice. No commitments."
            : `${number(rate!)} coins per ${money(100, currency)} ${currency}`}
        </span>
        <span>
          {quote ? "Quote valid for 10 minutes" : "No recurring charges"}
        </span>
      </div>
      {coins !== null && config?.sessionExamples?.length ? (
        <div className="coin-value">
          <strong>At current published session prices:</strong>
          {config.sessionExamples.slice(0, 3).map((item) => (
            <p key={item.name + item.mode}>
              {number(coins)} coins cover {Math.floor(coins / item.coinPrice)}{" "}
              {item.name} {item.mode} sessions at {item.coinPrice} coins each.
            </p>
          ))}
          <p>
            Each session covers one attempt. Permanent expansions are priced
            separately.
          </p>
        </div>
      ) : (
        <p className="coin-value">
          Check each game’s access label. A session covers one attempt; a
          permanent expansion stays with your account.
        </p>
      )}
      {!compact && (
        <EmailVerification
          returnTo={`/store?amount=${amount}&currency=${currency}`}
        />
      )}
      {!compact && !currencyAvailable && (
        <p className="availability-note" role="status">
          {currency} checkout is currently unavailable. Choose{" "}
          {currencies.join(" or ")} to continue.
        </p>
      )}
      {quote && (
        <div className="quote-summary" role="status">
          <strong>Review your purchase</strong>
          <p>
            {number(quote.coins)} virtual coins for{" "}
            {money(quote.cents, quote.currency)} before any applicable tax. The
            payment gateway displays the final total before you confirm payment.
          </p>
          <p>
            Coins have no cash value.{" "}
            <Link to="/virtual-currency">Read the currency policy.</Link>
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button
        className="button primary full"
        onClick={purchase}
        disabled={
          busy ||
          (!compact && !currencyAvailable) ||
          (!compact && user && !user.verified) ||
          (!compact &&
            user &&
            (!config?.enabled || !rate || !config?.paymentsAvailable))
        }
      >
        {busy
          ? "Connecting securely…"
          : compact
            ? "Explore the coin store"
            : quote
              ? `Continue to ${config?.provider === "transactworld" ? "Transactworld" : "Stripe"} — ${money(amount, currency)}`
              : user
                ? `Review coins — ${money(amount, currency)}`
                : "Sign in to buy coins"}
        <ArrowUpRight size={17} />
      </button>
      {!compact && (!config?.paymentsAvailable || !config?.enabled) && (
        <p className="availability-note">
          Checkout is temporarily unavailable. You can browse prices in USD and
          EUR while payments are being set up.
        </p>
      )}
      <SecureNote
        currency={currency}
        provider={
          config?.provider === "transactworld"
            ? "Transactworld"
            : "payment provider"
        }
      />
    </div>
  );
}
