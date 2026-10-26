import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, useAuth, useToast, money, number } from "../lib/api";
import { PageTitle, Loading, ErrorState, Empty } from "../components/UI";
import {
  PricingEditor,
  WalletEditor,
  Records,
  transactionColumns,
  paymentColumns,
  Analytics,
} from "../components/AdminTools";
const sections = [
  ["overview", "Dashboard"],
  ["users", "Users"],
  ["wallet", "Wallets & coins"],
  ["transactions", "Wallet transactions"],
  ["games", "Games"],
  ["game-pricing", "Game pricing"],
  ["sessions", "Trials & sessions"],
  ["expansions", "Premium expansions"],
  ["store", "Coin store settings"],
  ["payments", "Payments"],
  ["analytics", "Analytics"],
  ["audit-logs", "Audit logs"],
  ["admins", "Admin users & permissions"],
  ["settings", "Site settings"],
];
export default function Admin() {
  const { user, loading } = useAuth(),
    q = useQueryClient(),
    toast = useToast();
  const [params, setParams] = useSearchParams(),
    tab = params.get("tab") || "overview";
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false);
  const allowed = user?.role === "ADMIN";
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api("/admin/overview"),
    enabled: allowed,
  });
  const analytics = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => api("/admin/analytics"),
    enabled: allowed,
  });
  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => api("/coins/config"),
    enabled: allowed,
  });
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api("/admin/settings"),
    enabled: allowed,
  });
  const detail = useQuery({
    queryKey: ["admin-user", selected],
    queryFn: () => api("/admin/users/" + selected),
    enabled: allowed && !!selected,
  });
  const endpoint =
    tab === "admins" ? "users" : tab === "expansions" ? "games" : tab;
  const paginated = [
    "users",
    "admins",
    "transactions",
    "sessions",
    "payments",
    "audit-logs",
  ].includes(tab);
  const list = useQuery({
    queryKey: ["admin-list", tab, search, status, page],
    queryFn: () =>
      api(
        "/admin/" +
          endpoint +
          "?" +
          new URLSearchParams({
            search,
            status,
            page: String(page),
            ...(tab === "admins" ? { role: "ADMIN" } : {}),
          }),
      ),
    enabled:
      allowed &&
      [
        "users",
        "admins",
        "transactions",
        "sessions",
        "payments",
        "audit-logs",
        "games",
        "expansions",
        "game-pricing",
      ].includes(tab),
  });
  async function save(path: string, body: any, method = "PATCH") {
    setBusy(true);
    try {
      const result = await api(path, { method, body: JSON.stringify(body) });
      await q.invalidateQueries();
      toast(result.message || "Saved and recorded in the audit log.");
      return true;
    } catch (e: any) {
      toast(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function go(value: string) {
    setParams({ tab: value });
    setSearch("");
    setStatus("");
    setPage(1);
  }
  if (loading) return <Loading />;
  if (!allowed)
    return (
      <div className="page">
        <Empty
          title="Administrator access required"
          description="Sign in with a provisioned administrator account. Public signup cannot grant this role."
        />
      </div>
    );
  const rows = Array.isArray(list.data) ? list.data : (list.data?.items ?? []);
  const date = (v: any) => (v ? new Date(v).toLocaleString() : "—");
  return (
    <div className="page admin-page">
      <PageTitle
        eyebrow="LEXIHIVE ADMINISTRATION"
        title="Manage your platform."
        description="Published pricing, wallet accounting and customer activity from your database."
      />
      <div className="admin-workspace">
        <nav className="admin-navigation" aria-label="Administration sections">
          {sections.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => go(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-content">
          {paginated && (
            <div className="admin-filters">
              <label>
                Search
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={
                    tab === "payments"
                      ? "Order, transaction reference or email"
                      : "Search records"
                  }
                />
              </label>
              {tab !== "audit-logs" && (
                <label>
                  Status / type
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All</option>
                    {(tab === "users" || tab === "admins"
                      ? ["ACTIVE", "SUSPENDED"]
                      : tab === "payments"
                        ? [
                            "pending",
                            "paid",
                            "failed",
                            "expired",
                            "abandoned",
                            "refunded",
                            "disputed",
                          ]
                        : tab === "sessions"
                          ? [
                              "CREATED",
                              "TRIAL_ACTIVE",
                              "PAYMENT_REQUIRED",
                              "PAYMENT_AUTHORIZED",
                              "ACTIVE",
                              "COMPLETED",
                              "REFUNDED",
                              "ABANDONED",
                            ]
                          : [
                              "purchased",
                              "earned",
                              "spent",
                              "game_session_charge",
                              "game_session_refund",
                              "admin",
                              "refund",
                            ]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {list.error && (
            <ErrorState error={list.error} retry={() => list.refetch()} />
          )}
          {list.isFetching && paginated && (
            <p role="status">Refreshing records…</p>
          )}
          {tab === "overview" &&
            (overview.isPending ? (
              <Loading />
            ) : overview.error ? (
              <ErrorState error={overview.error} />
            ) : (
              <>
                <div className="admin-metrics">
                  {[
                    ["Registered users", overview.data.users],
                    ["Active in 7 days", overview.data.activeUsers],
                    ["Game launches", overview.data.sessions],
                    ["Completed games", overview.data.completed],
                    ["Verified purchases", overview.data.purchases],
                    [
                      "Available wallet coins",
                      overview.data.liability?.balance ?? 0,
                    ],
                    ["Wallet debt", overview.data.liability?.debt ?? 0],
                    ["Failed / disputed orders", overview.data.failed],
                  ].map(([label, value]) => (
                    <section className="panel" key={label}>
                      <span>{label}</span>
                      <strong>{number(value)}</strong>
                    </section>
                  ))}
                </div>
                <section className="panel">
                  <h2>Verified payment revenue after refunds</h2>
                  {overview.data.revenueByCurrency.length ? (
                    overview.data.revenueByCurrency.map((r: any) => (
                      <p key={r.currency}>
                        {money(r.cents, r.currency)} {r.currency.toUpperCase()}
                      </p>
                    ))
                  ) : (
                    <p>No verified payment revenue recorded.</p>
                  )}
                </section>
                <section className="panel">
                  <h2>Recent wallet activity</h2>
                  <Records
                    items={overview.data.transactions}
                    columns={transactionColumns}
                  />
                </section>
              </>
            ))}
          {["users", "admins"].includes(tab) && (
            <Records
              items={rows}
              columns={[
                [
                  "Player",
                  (r) => (
                    <>
                      {r.displayName}
                      <small>{r.id}</small>
                    </>
                  ),
                ],
                ["Email", (r) => r.email],
                ["Role", (r) => r.role],
                ["Status", (r) => r.status],
                [
                  "Coins / debt",
                  (r) =>
                    number(r.wallet?.balance) + " / " + number(r.wallet?.debt),
                ],
              ]}
              action={(r) => (
                <button
                  className="button secondary"
                  onClick={() => setSelected(r.id)}
                >
                  View user
                </button>
              )}
            />
          )}
          {selected && detail.isPending && <Loading />}
          {selected && detail.error && <ErrorState error={detail.error} />}
          {selected && detail.data && ["users", "admins"].includes(tab) && (
            <section className="panel user-detail" key={selected}>
              <div className="button-row">
                <h2>{detail.data.displayName}</h2>
                <button className="text-link" onClick={() => setSelected("")}>
                  Close details
                </button>
                <button
                  className="button secondary"
                  onClick={() => go("wallet")}
                >
                  Adjust coins
                </button>
              </div>
              <p>
                {detail.data.email} · {detail.data.role} · {detail.data.status}
              </p>
              <p>
                {number(detail.data.profile?.xp)} XP ·{" "}
                {detail.data.profile?.streak ?? 0} day streak ·{" "}
                {number(detail.data.wallet?.balance)} coins ·{" "}
                {number(detail.data.wallet?.debt)} debt
              </p>
              <details>
                <summary>Achievements and permanent access</summary>
                {detail.data.achievements.map((a: any) => (
                  <p key={a.id}>
                    {a.achievement.name} · {date(a.earnedAt)}
                  </p>
                ))}
                {detail.data.entitlements.map((a: any) => (
                  <p key={a.id}>
                    {a.unlock.name} · owned since {date(a.createdAt)}
                  </p>
                ))}
              </details>
              <details>
                <summary>Recent payments</summary>
                <Records
                  items={detail.data.payments}
                  columns={paymentColumns}
                />
              </details>
              <details>
                <summary>Recent games</summary>
                <Records
                  items={detail.data.gameSessions}
                  columns={[
                    ["Game", (r) => r.gameSlug],
                    ["Mode", (r) => r.difficulty],
                    ["State", (r) => r.billingState],
                    ["Outcome", (r) => r.outcome || "Not completed"],
                    [
                      "Score / XP",
                      (r) => (r.score?.score ?? 0) + " / " + (r.score?.xp ?? 0),
                    ],
                    ["Coins", (r) => r.coinPrice],
                  ]}
                />
              </details>
              <details>
                <summary>Recent wallet activity</summary>
                <Records
                  items={detail.data.transactions}
                  columns={transactionColumns}
                />
              </details>
              <form
                className="form admin-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = e.currentTarget,
                    d = Object.fromEntries(new FormData(f));
                  if (
                    window.confirm(
                      "Apply these account status and role changes?",
                    )
                  )
                    if (await save("/admin/users/" + selected, d)) f.reset();
                }}
              >
                <h3>Permissions and status</h3>
                <label>
                  Role
                  <select name="role" defaultValue={detail.data.role}>
                    <option>USER</option>
                    <option>ADMIN</option>
                  </select>
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={detail.data.status}>
                    <option>ACTIVE</option>
                    <option>SUSPENDED</option>
                  </select>
                </label>
                <label>
                  Reason
                  <input name="reason" minLength={10} required />
                </label>
                <label>
                  Your administrator password
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  Confirm account changes
                </button>
              </form>
            </section>
          )}
          {tab === "wallet" && (
            <>
              <section className="panel">
                <h2>Find a wallet</h2>
                <p>
                  Select a player from Users or enter their ID. Adjustments
                  remain separate from gateway purchases.
                </p>
                <label>
                  Player ID
                  <input
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  />
                </label>
              </section>
              {detail.data && (
                <WalletEditor
                  key={selected}
                  user={detail.data}
                  onSaved={() => q.invalidateQueries()}
                />
              )}
            </>
          )}
          {tab === "transactions" && (
            <Records
              items={rows}
              columns={[
                ["User", (r) => r.wallet?.userId],
                ...transactionColumns,
              ]}
            />
          )}
          {tab === "sessions" && (
            <>
              <p>
                Each price is a session snapshot. Unstarted charged sessions can
                be recovered or refunded.
              </p>
              <Records
                items={rows}
                columns={[
                  [
                    "Session",
                    (r) => (
                      <>
                        {r.id}
                        <small>{r.userId}</small>
                      </>
                    ),
                  ],
                  ["Game / mode", (r) => r.gameSlug + " / " + r.difficulty],
                  ["State", (r) => r.billingState],
                  [
                    "Coins / version",
                    (r) => r.coinPrice + " / v" + r.pricingVersion,
                  ],
                  ["Preview", (r) => r.trialSeconds + "s"],
                  ["Started", (r) => date(r.readyAt)],
                  ["Completed", (r) => date(r.completedAt)],
                  ["Outcome", (r) => r.outcome ?? "—"],
                ]}
              />
            </>
          )}
          {tab === "game-pricing" && (
            <>
              <div className="info-strip">
                <p>
                  Initial paid recommendations are unpublished. Saving a draft
                  never changes customer pricing. Publish each mode explicitly
                  after review. Existing sessions keep their agreed prices;
                  advanced owners retain access.
                </p>
              </div>
              {rows.map((g: any) => (
                <section className="panel" key={g.slug}>
                  <h2>{g.name}</h2>
                  <p>
                    {g.category} · {g.proposalReason}
                  </p>
                  {g.modes.map((m: any) => (
                    <PricingEditor
                      key={
                        g.slug +
                        ":" +
                        m.mode +
                        ":" +
                        m.live.version +
                        ":" +
                        JSON.stringify(m.draft)
                      }
                      game={g}
                      mode={m}
                      busy={busy}
                      save={save}
                    />
                  ))}
                </section>
              ))}
            </>
          )}
          {["games", "expansions"].includes(tab) &&
            rows
              .filter((g: any) => tab !== "expansions" || g.unlock)
              .map((g: any) => (
                <section className="panel" key={g.slug}>
                  <h2>{g.name}</h2>
                  <p>
                    {g.category} ·{" "}
                    {analytics.data?.categoryUse?.find(
                      (x: any) => x.gameSlug === g.slug,
                    )?._count ?? 0}{" "}
                    launches ·{" "}
                    {number(
                      analytics.data?.popularPaid?.find(
                        (x: any) => x.gameSlug === g.slug,
                      )?._sum.coinPrice ?? 0,
                    )}{" "}
                    session coins consumed
                  </p>
                  <form
                    className="form admin-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      void save("/admin/games/" + g.slug, {
                        visible: d.visible === "on",
                        ...(g.unlock
                          ? {
                              price: Number(d.price),
                              expansionActive: d.expansionActive === "on",
                            }
                          : {}),
                      });
                    }}
                  >
                    <label className="checkbox-label">
                      <input
                        name="visible"
                        type="checkbox"
                        defaultChecked={g.visible}
                      />
                      Published game
                    </label>
                    {g.unlock && (
                      <>
                        <label>
                          Permanent expansion coins
                          <input
                            name="price"
                            type="number"
                            min={1}
                            max={100000}
                            defaultValue={g.unlock.price}
                          />
                        </label>
                        <label className="checkbox-label">
                          <input
                            name="expansionActive"
                            type="checkbox"
                            defaultChecked={g.unlock.active}
                          />
                          Offer expansion
                        </label>
                      </>
                    )}
                    <button className="button primary" disabled={busy}>
                      Save game settings
                    </button>
                  </form>
                  <button
                    className="text-link"
                    onClick={() => go("game-pricing")}
                  >
                    Review trial and session pricing
                  </button>
                </section>
              ))}
          {tab === "store" && pricing.data && (
            <section className="panel">
              <h2>Coin store settings</h2>
              <p>
                Independent USD/EUR rates. Merchant-enabled currencies:{" "}
                {pricing.data.currencies.join(", ")}. Purchase limits below use
                cents.
              </p>
              <form
                className="form admin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = Object.fromEntries(new FormData(e.currentTarget));
                  void save("/admin/coin-pricing", {
                    minCents: Number(d.minCents),
                    maxCents: Number(d.maxCents),
                    stepCents: Number(d.stepCents),
                    coinsPerDollar: Number(d.coinsPerDollar),
                    coinsPerEuro: Number(d.coinsPerEuro),
                    enabled: d.enabled === "on",
                  });
                }}
              >
                {[
                  ["minCents", "Minimum in cents"],
                  ["maxCents", "Maximum in cents"],
                  ["stepCents", "Slider step in cents"],
                  ["coinsPerDollar", "Coins per USD"],
                  ["coinsPerEuro", "Coins per EUR"],
                ].map(([k, l]) => (
                  <label key={k}>
                    {l}
                    <input
                      name={k}
                      type="number"
                      min={1}
                      required
                      defaultValue={pricing.data[k]}
                    />
                  </label>
                ))}
                <label className="checkbox-label">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={pricing.data.enabled}
                  />
                  Enable quoting
                </label>
                <button className="button primary" disabled={busy}>
                  Save store pricing
                </button>
              </form>
            </section>
          )}
          {tab === "payments" && (
            <>
              <p>
                Verification queries the provider. It never manually marks an
                order paid.
              </p>
              <Records
                items={rows}
                columns={paymentColumns}
                action={(r) => (
                  <>
                    <button
                      className="button secondary"
                      disabled={
                        busy ||
                        !list.data?.inquiryConfigured ||
                        !r.intentId ||
                        r.provider !== "transactworld"
                      }
                      onClick={() =>
                        save(
                          "/admin/payments/" + r.id + "/reconcile",
                          {},
                          "POST",
                        )
                      }
                    >
                      Verify with gateway
                    </button>
                    <details>
                      <summary>Sanitized callbacks</summary>
                      <pre>{JSON.stringify(r.notifications, null, 2)}</pre>
                    </details>
                  </>
                )}
              />
            </>
          )}
          {tab === "analytics" &&
            (analytics.isPending ? (
              <Loading />
            ) : analytics.error ? (
              <ErrorState error={analytics.error} />
            ) : (
              <Analytics data={analytics.data} />
            ))}
          {tab === "audit-logs" && (
            <Records
              items={rows}
              columns={[
                ["Date", (r) => date(r.createdAt)],
                ["Acting admin", (r) => r.actorId],
                ["Action", (r) => r.action],
                [
                  "Details",
                  (r) => (
                    <details>
                      <summary>Inspect record</summary>
                      <pre>{JSON.stringify(r.detail, null, 2)}</pre>
                    </details>
                  ),
                ],
              ]}
            />
          )}
          {tab === "settings" &&
            (settings.isPending ? (
              <Loading />
            ) : settings.error ? (
              <ErrorState error={settings.error} />
            ) : (
              <section className="panel">
                <h2>Public support settings</h2>
                <p>
                  Supply a complete email address. Account-verification SMTP is
                  configured separately.
                </p>
                <form
                  className="form admin-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = Object.fromEntries(new FormData(e.currentTarget));
                    void save("/admin/settings", {
                      supportEmail: d.supportEmail,
                      supportReplyAim: d.supportReplyAim === "on",
                    });
                  }}
                >
                  <label>
                    Support email
                    <input
                      type="email"
                      name="supportEmail"
                      defaultValue={
                        settings.data.settings?.supportEmail ||
                        settings.data.environmentSupportEmail ||
                        ""
                      }
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="supportReplyAim"
                      defaultChecked={settings.data.settings?.supportReplyAim}
                    />
                    Our support operation can aim to reply within two hours
                  </label>
                  <button className="button primary" disabled={busy}>
                    Save public settings
                  </button>
                </form>
                <h3>Integration readiness</h3>
                <p>
                  SMTP:{" "}
                  {settings.data.smtpConfigured ? "Configured" : "Missing"} ·
                  Inquiry:{" "}
                  {settings.data.inquiryConfigured ? "Configured" : "Missing"} ·
                  Reconciliation:{" "}
                  {settings.data.reconciliationEnabled
                    ? "Enabled when credentials are ready"
                    : "Disabled"}
                </p>
                {settings.data.paymentIssues.map((s: string) => (
                  <p key={s}>{s}</p>
                ))}
              </section>
            ))}
          {paginated && (
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page === 1 || list.isFetching}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} · {list.data?.total ?? 0} records
              </span>
              <button
                className="button secondary"
                disabled={
                  page * 25 >= (list.data?.total ?? 0) || list.isFetching
                }
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
