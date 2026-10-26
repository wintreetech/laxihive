import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  Star,
  Heart,
  Hexagon,
  Clock3,
  Check,
  Sparkles,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import type { Game } from "../../../backend/shared/catalog";
import { accessLabel } from "../../../backend/shared/access";
import { readLocal, writeLocal } from "../lib/api";
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="LexiHive home">
      <span className="logo-icon">
        <Hexagon size={30} strokeWidth={2.2} />
        <span />
      </span>
      lexi<span>hive</span>
      <i />
    </Link>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  to,
  label = "View all games",
}: {
  eyebrow?: string;
  title: string;
  to?: string;
  label?: string;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {label}
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function Badge({
  children,
  color = "violet",
}: {
  children: ReactNode;
  color?: string;
}) {
  return <span className={`badge ${color}`}>{children}</span>;
}
export function Art({ game, large = false }: { game: Game; large?: boolean }) {
  const letters =
    game.slug === "hive-quest"
      ? ["B", "R", "A", "I", "N", "P", "L", "A", "Y"]
      : ["A", "M", "I", "N", "D", "E", "T", "S", "R"];
  return (
    <div
      className={`game-art ${game.color} art-${game.art} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      <div className="art-grid" />
      <div className="art-halo" />
      {game.art === "orbit" ? (
        <div className="orbit-drawing">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="orbit-core">✦</div>
          <i />
          <i />
          <i />
        </div>
      ) : game.art === "hex" || game.art === "flower" ? (
        <div className={`hex-drawing ${game.art === "flower" ? "flower" : ""}`}>
          {letters.slice(0, 7).map((l, i) => (
            <span key={i} className={`hex h${i}`}>
              {l}
            </span>
          ))}
        </div>
      ) : game.art === "numbers" ? (
        <div className="number-drawing">
          {[3, 1, 8, 6, 5, 2, 7, 4, 9].map((v, i) => (
            <span key={i} className={i === 4 ? "lit" : ""}>
              {v}
            </span>
          ))}
        </div>
      ) : game.art === "cards" ? (
        <div className="card-drawing">
          <span>✦</span>
          <span>✦</span>
          <span>?</span>
        </div>
      ) : (
        <div className="letter-drawing">
          {["M", "I", "N", "D"].map((v, i) => (
            <span key={i}>{v}</span>
          ))}
        </div>
      )}
      <span className="art-spark spark-one">+</span>
      <span className="art-spark spark-two">✦</span>
    </div>
  );
}
export function GameCard({
  game,
  best,
  featured = false,
}: {
  game: Game;
  best?: number;
  featured?: boolean;
}) {
  const [favorite, setFavorite] = useState(() =>
    readLocal<string[]>("lexi-favorites", []).includes(game.slug),
  );
  function toggle() {
    const old = readLocal<string[]>("lexi-favorites", []);
    writeLocal(
      "lexi-favorites",
      favorite ? old.filter((x) => x !== game.slug) : [...old, game.slug],
    );
    setFavorite(!favorite);
    window.dispatchEvent(new Event("lexi-favorites"));
  }
  return (
    <article className={`game-card ${featured ? "featured" : ""}`}>
      <Link to={`/games/${game.slug}`} tabIndex={-1}>
        <Art game={game} />
      </Link>
      <button
        className={`favorite ${favorite ? "active" : ""}`}
        onClick={toggle}
        aria-label={`${favorite ? "Remove" : "Add"} ${game.name} ${favorite ? "from" : "to"} favorites`}
        aria-pressed={favorite}
      >
        <Heart size={16} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="game-card-body">
        <div className="card-tags">
          <Badge color={game.color}>{game.category}</Badge>
          <span className={`difficulty ${game.difficulty.toLowerCase()}`}>
            <i />
            {game.difficulty}
          </span>
        </div>
        <Link to={`/games/${game.slug}`} className="game-name">
          {game.name}
          <ArrowUpRight size={17} />
        </Link>
        <p>{game.description}</p>
        <span className="access-label">
          {game.access ? accessLabel(game.access) : "Check game availability"}
        </span>
        <div className="card-bottom">
          <span>
            {best ? (
              <>
                <Star size={12} /> Best {best}
              </>
            ) : (
              <>
                <Clock3 size={12} /> A little daily challenge
              </>
            )}
          </span>
          <Link
            to={`/games/${game.slug}`}
            aria-label={`Play ${game.name}`}
            className="play-mini"
          >
            <Play size={14} fill="currentColor" />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Sparkles size={29} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      <span>Connecting the dots…</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <h3>A small interruption</h3>
      <p>{error.message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function SecureNote({
  provider = "payment provider",
  currency = "USD",
}: {
  provider?: string;
  currency?: string;
}) {
  return (
    <p className="secure-note">
      <ShieldCheck size={15} /> Secure checkout by {provider} · {currency}{" "}
      pricing · No cash value
    </p>
  );
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <Empty
          title="The hive hit a snag"
          description="Reload to get back to your next challenge."
          action={
            <button className="button" onClick={() => window.location.reload()}>
              Reload LexiHive
            </button>
          }
        />
      </main>
    ) : (
      this.props.children
    );
  }
}
export function CheckLine({ children }: { children: ReactNode }) {
  return (
    <span className="check-line">
      <Check size={14} />
      {children}
    </span>
  );
}
