import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ArrowUpRight, ShieldCheck } from "lucide-react";
import { api, useAuth, number } from "../lib/api";
import { PageTitle, Empty, ErrorState, Loading, Badge } from "../components/UI";
import { games } from "../../../backend/shared/catalog";
export default function Leaderboards() {
  const [period, setPeriod] = useState("weekly"),
    [game, setGame] = useState("all");
  const { user } = useAuth();
  const data = useQuery({
    queryKey: ["leaderboards", period, game],
    queryFn: () => api(`/leaderboards?period=${period}&game=${game}`),
  });
  return (
    <div className="page">
      <PageTitle
        eyebrow="A LITTLE FRIENDLY COMPETITION"
        title="Great minds. Good company."
        description="Your best starter-game score. A shared love of discovery. See where your next win takes you."
      />
      <div className="leaderboard-toolbar">
        <div className="segmented-control">
          <button
            className={period === "weekly" ? "active" : ""}
            onClick={() => setPeriod("weekly")}
          >
            Last 7 days
          </button>
          <button
            className={period === "all" ? "active" : ""}
            onClick={() => setPeriod("all")}
          >
            All time
          </button>
        </div>
        <label>
          <span className="sr-only">Game leaderboard</span>
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="all">All games · best single score</option>
            {games.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="leaderboard-note">
        <ShieldCheck size={17} />
        <span>
          Server-issued, replay-validated starter scores only. No premium
          boosts. Public profiles opt in.
        </span>
      </div>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} retry={() => data.refetch()} />
      ) : !data.data.length ? (
        <Empty
          title="A fresh board. A place for you."
          description="There are no public scores in this view yet. Enable a public profile, complete a starter challenge, and start the story."
          action={
            <div className="button-row">
              <Link to="/games" className="button primary">
                Play a challenge
                <ArrowUpRight size={15} />
              </Link>
              <Link
                to={user ? "/settings" : "/signup"}
                className="button secondary"
              >
                {user ? "Profile settings" : "Create account"}
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="podium">
            {data.data.slice(0, 3).map((r: any) => (
              <div key={r.userId} className={r.rank === 1 ? "first" : ""}>
                <span className="podium-rank">
                  <Trophy size={18} />
                  {r.rank}
                </span>
                <span className={`avatar large-avatar ${r.avatar}`}>
                  {r.displayName.slice(0, 1)}
                </span>
                <h2>{r.displayName}</h2>
                <strong>
                  {number(r.score)}
                  <small>points</small>
                </strong>
                <span>{games.find((g) => g.slug === r.gameSlug)?.name}</span>
              </div>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Game</th>
                  <th>Best score</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r: any) => (
                  <tr
                    className={r.userId === user?.id ? "your-row" : ""}
                    key={r.userId}
                  >
                    <td>#{r.rank}</td>
                    <td>
                      <span className={`avatar ${r.avatar}`}>
                        {r.displayName.slice(0, 1)}
                      </span>
                      {r.displayName}
                      {r.userId === user?.id && <Badge>You</Badge>}
                    </td>
                    <td>{games.find((g) => g.slug === r.gameSlug)?.name}</td>
                    <td>{number(r.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {user &&
        data.data?.length > 0 &&
        !data.data.some((r: any) => r.userId === user.id) && (
          <p className="leaderboard-footer">
            Your score is not in this view’s top 100. Complete a starter game
            and enable your public profile to participate.
          </p>
        )}
    </div>
  );
}
