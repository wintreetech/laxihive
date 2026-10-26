import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Flame,
  Gamepad2,
  Timer,
  Coins,
  Trophy,
  Star,
  Compass,
  Brain,
  Sparkles,
  Check,
  ShieldCheck,
  LogOut,
  Trash2,
  Download,
  LockKeyhole,
} from "lucide-react";
import {
  api,
  post,
  useAuth,
  useToast,
  number,
  readLocal,
  writeLocal,
} from "../lib/api";
import {
  PageTitle,
  SectionTitle,
  Badge,
  Empty,
  ErrorState,
  Loading,
  Art,
} from "../components/UI";
import { games, achievements } from "../../../backend/shared/catalog";
import { LEVEL_XP } from "../../../backend/shared/rules";
import type { GuestRecord } from "./Play";
import { EmailVerification } from "../components/EmailVerification";
export function GuestGate({
  title = "Your next chapter starts here.",
}: {
  title?: string;
}) {
  const { loading } = useAuth();
  return loading ? (
    <Loading />
  ) : (
    <div className="page">
      <Empty
        title={title}
        description="Create a free account to save your games, celebrate your little wins and build a daily streak."
        action={
          <div className="button-row">
            <Link className="button primary" to="/signup">
              Join the hive
              <ArrowUpRight size={16} />
            </Link>
            <Link className="button secondary" to="/login">
              Sign in
            </Link>
          </div>
        }
      />
    </div>
  );
}
export default function Dashboard({ profile = false }: { profile?: boolean }) {
  const { user } = useAuth(),
    q = useQueryClient(),
    toast = useToast();
  const data = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api("/me/dashboard"),
    enabled: !!user,
  });
  const [importBusy, setImportBusy] = useState(false),
    [dismissed, setDismissed] = useState(false);
  if (!user) return <GuestGate />;
  if (data.isPending) return <Loading />;
  if (data.error)
    return <ErrorState error={data.error} retry={() => data.refetch()} />;
  const d = data.data,
    p = d.user.profile,
    xp = p?.xp ?? 0;
  const records = readLocal<GuestRecord[]>("lexi-progress", []);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      label: new Date(`${date}T12:00:00Z`).toLocaleDateString("en", {
        weekday: "short",
        timeZone: "UTC",
      }),
      plays: d.week.filter((w: any) => w.completedAt?.slice(0, 10) === date)
        .length,
    };
  });
  async function importProgress() {
    if (
      !window.confirm(
        "Import validated guest personal records? This will not award XP, coins, achievements or leaderboard scores.",
      )
    )
      return;
    setImportBusy(true);
    try {
      const r = await post("/me/import-progress", {
        records: records.map(({ slug, seed, actions, level }) => ({
          slug,
          seed,
          actions,
          level,
        })),
      });
      writeLocal("lexi-progress", []);
      await q.invalidateQueries();
      toast(r.message);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setImportBusy(false);
    }
  }
  return (
    <div className="page">
      <PageTitle
        eyebrow={
          profile ? "YOUR SPACE / PROFILE" : "A LITTLE PROGRESS, EVERY DAY"
        }
        title={
          profile
            ? `${user.displayName}’s little hive.`
            : `Good to see you, ${user.displayName}.`
        }
        description={
          profile
            ? "The games, connections and little wins that make your journey yours."
            : "You don’t have to be the best. Just a little better than yesterday."
        }
        action={
          <Link
            to={profile ? "/settings" : "/games"}
            className="button primary"
          >
            {profile ? "Edit profile" : "Find your next game"}
            <ArrowUpRight size={16} />
          </Link>
        }
      />
      {!dismissed && records.length > 0 && (
        <div className="import-banner">
          <span>
            <Download size={20} />
            <strong>{records.length} guest records are waiting.</strong>Bring
            your personal bests along.
          </span>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={importBusy}
              onClick={importProgress}
            >
              {importBusy ? "Checking records…" : "Import records"}
            </button>
            <button className="text-link" onClick={() => setDismissed(true)}>
              Later
            </button>
          </div>
        </div>
      )}
      {!user.verified && (
        <div className="verification-banner">
          <ShieldCheck size={17} />
          <p>
            Your gameplay is saved. Verify your email to enable purchases and
            unlocks.
          </p>
          <Link to="/settings">
            Account settings
            <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <section className="player-overview">
        <div className="player-level">
          <span className={`avatar large-avatar ${p?.avatar}`}>
            {user.displayName.slice(0, 1)}
          </span>
          <div>
            <Badge color="violet">
              LEVEL {Math.floor(xp / LEVEL_XP) + 1} · CURIOUS MIND
            </Badge>
            <h2>{user.displayName}</h2>
            <p>
              {number(xp)} XP earned · {LEVEL_XP - (xp % LEVEL_XP)} XP to your
              next level
            </p>
            <div
              className="xp-track"
              role="progressbar"
              aria-label="Level progress"
              aria-valuemin={0}
              aria-valuemax={LEVEL_XP}
              aria-valuenow={xp % LEVEL_XP}
            >
              <span
                style={{ width: `${((xp % LEVEL_XP) / LEVEL_XP) * 100}%` }}
              />
            </div>
          </div>
        </div>
        <div className="streak-box">
          <Flame size={29} />
          <strong>
            {p?.lastPlayDate &&
            new Date(p.lastPlayDate).getTime() <
              new Date(new Date().toISOString().slice(0, 10)).getTime() -
                86400000
              ? 0
              : (p?.streak ?? 0)}
            <small>day streak</small>
          </strong>
          <p>Longest: {p?.longestStreak ?? 0} days · UTC</p>
        </div>
      </section>
      <div className="stats-grid">
        {[
          [
            Gamepad2,
            d.progress.filter((g: any) => g.wins > 0).length,
            "Games explored",
            `${d.sessions} sessions started`,
          ],
          [
            Trophy,
            d.total,
            "Games completed",
            "Every attempt builds a connection",
          ],
          [
            Timer,
            `${Math.floor((p?.playSeconds ?? 0) / 60)}m`,
            "Time well played",
            "Your recorded playtime",
          ],
          [
            Coins,
            number(d.user.wallet?.balance),
            "Virtual coins",
            "Your next possibility",
          ],
        ].map(([Icon, value, label, sub]: any) => (
          <div className="stat-card" key={label}>
            <span>
              <Icon size={17} />
              {label}
            </span>
            <strong>{value}</strong>
            <p>{sub}</p>
          </div>
        ))}
      </div>
      <div className="dashboard-middle">
        <section className="panel">
          <SectionTitle title="A little, every day" />
          <p className="panel-subtitle">
            Completed games · Last seven UTC days
          </p>
          <div
            className="activity-chart"
            role="img"
            aria-label={days
              .map((day) => `${day.label}: ${day.plays} completed games`)
              .join(", ")}
          >
            {days.map((day) => (
              <div key={day.date}>
                <span>{day.plays}</span>
                <i
                  style={{
                    height: `${Math.max(4, (day.plays / Math.max(1, ...days.map((d) => d.plays))) * 110)}px`,
                  }}
                />
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="dashboard-daily">
          <Badge color="green">
            <Flame size={12} />
            YOUR DAILY MOMENT
          </Badge>
          <h2>
            A new day.
            <br />A fresh connection.
          </h2>
          <p>Today’s Daily Hive is ready. Take a little time for you.</p>
          <Link className="button light" to="/games/daily-hive">
            Play the daily hive
            <ArrowUpRight size={16} />
          </Link>
          <Art game={games[3]} />
        </section>
      </div>
      <SectionTitle
        title="Your personal bests"
        to="/games"
        label="Keep discovering"
      />
      {d.progress.length ? (
        <div className="personal-bests">
          {d.progress.map((r: any) => {
            const game = games.find((g) => g.slug === r.gameSlug)!;
            return (
              <Link
                className="personal-best"
                key={r.id}
                to={`/games/${r.gameSlug}`}
              >
                <span className={`tiny-icon ${game.color}`}>
                  <Star size={18} />
                </span>
                <div>
                  <strong>{game.name}</strong>
                  <p>
                    {r.wins} wins{r.stars ? ` · ${r.stars} hive stars` : ""}
                  </p>
                </div>
                <strong>{number(r.bestScore)}</strong>
                <ArrowUpRight size={15} />
              </Link>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Your first best is waiting."
          description="Complete a game and we’ll save the moment right here."
          action={
            <Link className="button secondary" to="/games/hive-quest">
              Try Hive Quest
              <ArrowUpRight size={15} />
            </Link>
          }
        />
      )}
      <SectionTitle
        title="Little badges. Big feelings."
        to="/achievements"
        label="Your collection"
      />
      <div className="achievement-preview">
        {achievements.slice(0, 3).map((a) => (
          <div
            className={
              d.achievements.some((u: any) => u.achievementSlug === a.slug)
                ? "unlocked"
                : ""
            }
            key={a.slug}
          >
            <span>
              <Trophy size={23} />
            </span>
            <div>
              <h3>{a.name}</h3>
              <p>{a.description}</p>
            </div>
            {d.achievements.some((u: any) => u.achievementSlug === a.slug) ? (
              <Check size={18} />
            ) : (
              <LockKeyhole size={16} />
            )}
          </div>
        ))}
      </div>
      <SectionTitle title="Your recent moments" />
      {d.history.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>When</th>
                <th>Result</th>
                <th>Score</th>
                <th>Play again</th>
              </tr>
            </thead>
            <tbody>
              {d.history.map((h: any) => (
                <tr key={h.id}>
                  <td>
                    {games.find((g) => g.slug === h.gameSlug)?.name}
                    <small>{h.difficulty}</small>
                  </td>
                  <td>{new Date(h.completedAt).toLocaleDateString()}</td>
                  <td>
                    <Badge color={h.outcome === "won" ? "green" : "amber"}>
                      {h.outcome === "won" ? "Completed" : "A learning moment"}
                    </Badge>
                  </td>
                  <td>{h.score?.score ?? 0}</td>
                  <td>
                    <Link to={`/games/${h.gameSlug}`} className="text-link">
                      Play
                      <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Your completed games will appear here.</p>
      )}
    </div>
  );
}
export function Achievements() {
  const { user } = useAuth();
  const data = useQuery({
    queryKey: ["achievements"],
    queryFn: () => api("/me/achievements"),
    enabled: !!user,
  });
  if (!user)
    return <GuestGate title="Good things deserve a little celebration." />;
  return (
    <div className="page">
      <PageTitle
        eyebrow="YOUR COLLECTION OF LITTLE WINS"
        title="Look how far you’ve come."
        description="Real moments, meaningfully earned. Every new achievement brings 25 virtual coins."
      />
      {data.error && <ErrorState error={data.error} />}
      <div className="achievement-grid">
        {achievements.map((a, i) => {
          const unlocked = data.data?.find(
            (u: any) => u.achievementSlug === a.slug,
          );
          const Icon = [Sparkles, Flame, Brain, Compass, Star, Trophy][i];
          return (
            <article
              className={`achievement-card ${unlocked ? "earned" : ""}`}
              key={a.slug}
            >
              <span className="achievement-medal">
                <Icon size={35} />
              </span>
              <Badge color={unlocked ? "green" : "violet"}>
                {unlocked
                  ? "Earned with a little brilliance"
                  : "Waiting for your moment"}
              </Badge>
              <h2>{a.name}</h2>
              <p>{a.description}</p>
              <small>
                {unlocked
                  ? `Earned ${new Date(unlocked.earnedAt).toLocaleDateString()} · 25 coins`
                  : "25 coins when earned"}
              </small>
            </article>
          );
        })}
      </div>
    </div>
  );
}
export function Settings() {
  const { user, logout, refresh } = useAuth(),
    toast = useToast();
  const [busy, setBusy] = useState(false);
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api("/me/sessions"),
    enabled: !!user,
  });
  if (!user) return <GuestGate title="A little space of your own." />;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/me", {
        method: "PATCH",
        body: JSON.stringify({ ...d, isPublic: d.isPublic === "on" }),
      });
      await refresh();
      toast("Your little space is up to date.");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function password(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await post("/me/change-password", Object.fromEntries(new FormData(form)));
      form.reset();
      toast("Password updated. Other sessions have been signed out.");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function removeAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !window.confirm(
        "Permanently remove your account and gameplay records? Required financial audit records will be retained.",
      )
    )
      return;
    const password = new FormData(e.currentTarget).get("password");
    setBusy(true);
    try {
      await api("/me", {
        method: "DELETE",
        body: JSON.stringify({ password }),
      });
      await refresh();
      toast("Account removed. Required financial records are retained.");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page settings-page">
      <PageTitle
        eyebrow="YOUR SPACE / SETTINGS"
        title="Make yourself at home."
        description="Your profile, your privacy, your peace of mind."
      />
      <div className="settings-layout">
        <section className="panel">
          <h2>A little about you</h2>
          <form
            className="form"
            onSubmit={save}
            key={user.displayName + user.profile?.isPublic}
          >
            <label>
              Display name
              <input
                name="displayName"
                required
                minLength={2}
                maxLength={32}
                defaultValue={user.displayName}
                autoComplete="nickname"
              />
            </label>
            <label>
              Avatar color
              <select
                name="avatar"
                defaultValue={user.profile?.avatar ?? "violet"}
              >
                {["violet", "cyan", "green", "amber"].map((v) => (
                  <option key={v} value={v}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="isPublic"
                defaultChecked={user.profile?.isPublic}
              />
              <span>
                Show my display name and validated scores on leaderboards. My
                email always stays private.
              </span>
            </label>
            <button className="button primary" disabled={busy}>
              Save my profile
              <Check size={16} />
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Account security</h2>
          <div className="account-email">
            <ShieldCheck size={18} />
            <div>
              <strong>{user.email}</strong>
              <p>
                {user.verified
                  ? "Email verified"
                  : "Verification is still waiting"}
              </p>
            </div>
          </div>
          <EmailVerification />
          <form className="form password-change" onSubmit={password}>
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Update password
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Your sessions</h2>
          <p className="muted">
            Remembered sessions expire after 30 days. You can revoke any session
            below.
          </p>
          <div className="session-list">
            {sessions.data?.map((s: any) => (
              <div key={s.id}>
                <span>
                  Started {new Date(s.createdAt).toLocaleDateString()}
                  <small>
                    Expires {new Date(s.expiresAt).toLocaleDateString()}
                  </small>
                </span>
                <button
                  className="text-link"
                  onClick={async () => {
                    try {
                      await api(`/me/sessions/${s.id}`, { method: "DELETE" });
                      await refresh();
                      toast("Session signed out.");
                    } catch (e: any) {
                      toast(e.message);
                    }
                  }}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
          <button className="button secondary" onClick={logout}>
            <LogOut size={15} />
            Sign out of this device
          </button>
        </section>
        <section className="panel danger-panel">
          <h2>Leave the hive</h2>
          <p>
            Account deletion removes your profile details and gameplay data.
            Required payment and audit records remain, linked to an anonymized
            account.
          </p>
          <form className="form" onSubmit={removeAccount}>
            <label>
              Confirm with your password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="button danger" disabled={busy}>
              <Trash2 size={15} />
              Delete my account
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
