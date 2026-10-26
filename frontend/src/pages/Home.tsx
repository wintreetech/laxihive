import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Play,
  Flame,
  Brain,
  Check,
  ShieldCheck,
  Infinity as InfinityIcon,
  Sparkles,
  Target,
  Hexagon,
  Trophy,
  ChevronRight,
  Coins,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { games } from "../../../backend/shared/catalog";
import { api, useAuth } from "../lib/api";
import {
  Art,
  GameCard,
  SectionTitle,
  Badge,
  CheckLine,
} from "../components/UI";
import { CoinSlider } from "../components/CoinSlider";
const faq = [
  [
    "Can I play without an account?",
    "Games labeled Free to play work as a guest. Sign in for saved rewards, eligible practice previews, paid sessions and permanent expansions. Every charge is shown before you confirm.",
  ],
  [
    "What are coins for?",
    "Coins buy clearly priced game sessions or optional permanent expansions. A session covers one attempt; a permanent unlock stays with your account. Coins have no cash value and cannot be transferred or redeemed.",
  ],
  [
    "How does my daily streak work?",
    "Save at least one winning full-game result each UTC day to maintain your streak. Practice previews do not count. Midnight UTC is 5:30 a.m. in India.",
  ],
  [
    "Are leaderboards fair?",
    "Only server-issued, replay-validated starter sessions appear on leaderboards. Premium modes and imported guest records do not compete. Enable a public profile to participate.",
  ],
];
export default function Home() {
  const { user } = useAuth();
  const [hexes, setHexes] = useState<number[]>([]);
  const config = useQuery({
    queryKey: ["pricing"],
    queryFn: () => api("/coins/config"),
    retry: 1,
  });
  const available = useQuery({
    queryKey: ["games"],
    queryFn: () => api("/games"),
    retry: 1,
  });
  const visible = available.data ?? [];
  const featured = games
    .slice(0, 4)
    .filter((g) => visible.some((v: any) => v.slug === g.slug))
    .map((g) => visible.find((v: any) => v.slug === g.slug) ?? g);
  return (
    <div className="page home-page">
      <div className="welcome-row">
        <span>
          <i className="live-dot" />
          {user
            ? `GOOD TO HAVE YOU BACK, ${user.displayName.toUpperCase()}`
            : "A LITTLE PLAY. A LOT OF POSSIBILITY."}
        </span>
        <Link to="/daily">
          <Flame size={14} />
          Your daily challenge is ready
          <ChevronRight size={13} />
        </Link>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-badge">
            <span>✦</span> YOUR MIND’S NEW FAVORITE PLACE
          </span>
          <h1>
            Train your mind.
            <br />
            Beat your{" "}
            <span>
              best.
              <svg viewBox="0 0 220 18" aria-hidden="true">
                <path d="M4 13 Q105 0 214 10" />
              </svg>
            </span>
          </h1>
          <p>
            20 addictive word, memory and logic games.
            <br className="desktop-only" />
            Build streaks, unlock challenges, and discover
            <br className="desktop-only" /> how far your mind can go.
          </p>
          <div className="hero-buttons">
            <Link className="button primary" to="/games/hive-quest">
              <Play size={16} fill="currentColor" />
              Start playing
              <ArrowUpRight size={17} />
            </Link>
            <Link className="button ghost" to="/games">
              Explore games
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-trust">
            <CheckLine>Free to play</CheckLine>
            <CheckLine>No download</CheckLine>
            <CheckLine>Made for your mind</CheckLine>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-orbit orbit-a" />
          <div className="hero-orbit orbit-b" />
          <span className="hero-star star-a">✦</span>
          <span className="hero-star star-b">+</span>
          <div className="floating-label top-label">
            <span className="tiny-icon">
              <Brain size={17} />
            </span>
            <div>
              <strong>Small plays. Big connections.</strong>
              <span>A little sharper, every day</span>
            </div>
            <span className="label-spark">✦</span>
          </div>
          <div className="hero-hive" aria-label="Interactive letter hive">
            {["B", "R", "A", "I", "N", "P", "L"].map((l, i) => (
              <button
                key={i}
                onClick={() =>
                  setHexes((old) =>
                    old.includes(i) ? old.filter((x) => x !== i) : [...old, i],
                  )
                }
                className={`hero-hex hh${i} ${hexes.includes(i) ? "chosen" : ""}`}
                aria-label={`Highlight letter ${l}`}
                aria-pressed={hexes.includes(i)}
              >
                {l}
                <span>{i === 3 ? "✦" : ""}</span>
              </button>
            ))}
          </div>
          <div className="floating-tile number-float">
            <span>FIND YOUR FLOW</span>
            <div>
              <i>3</i>
              <i>1</i>
              <i>2</i>
              <i>4</i>
            </div>
            <span>
              <span className="mini-dot" />
              Number Rush
            </span>
          </div>
          <div className="floating-label bottom-label">
            <span className="tiny-icon green">
              <Target size={17} />
            </span>
            <div>
              <strong>Your next “aha!” moment</strong>
              <span>is just one game away.</span>
            </div>
            <ArrowUpRight size={18} />
          </div>
          <span className="hero-caption">CURIOUS MINDS WELCOME.</span>
        </div>
      </section>
      <div className="benefit-strip">
        <div>
          <Hexagon />
          <span>
            <strong>20 ways to play</strong>Find your kind of challenge
          </span>
        </div>
        <div>
          <Brain />
          <span>
            <strong>A workout for your mind</strong>Words, memory, logic & more
          </span>
        </div>
        <div>
          <InfinityIcon />
          <span>
            <strong>Your pace. Your progress.</strong>No pressure. Just
            possibility.
          </span>
        </div>
        <div>
          <ShieldCheck />
          <span>
            <strong>Play free. Feel good.</strong>No downloads, no distractions
          </span>
        </div>
      </div>
      <section className="featured-section">
        <SectionTitle
          eyebrow="FIND YOUR NEXT FAVORITE"
          title="Good games. Great brain days."
          to="/games"
        />
        <div className="featured-grid">
          {featured.map((g) => (
            <GameCard key={g.slug} game={g} featured />
          ))}
        </div>
      </section>
      <section className="daily-banner">
        <div className="daily-banner-art">
          <Art game={games[3]} />
        </div>
        <div>
          <Badge color="green">
            <Flame size={11} /> A FRESH CHALLENGE. EVERY DAY.
          </Badge>
          <h2>A new day. A new hive.</h2>
          <p>
            Seven letters. One shared puzzle. Make a little time for your mind.
          </p>
          <span className="daily-reset">
            <span className="live-dot" />
            Resets at 00:00 UTC · Free for everyone
          </span>
        </div>
        <Link to="/daily" className="button light">
          Play today’s hive
          <ArrowUpRight size={17} />
        </Link>
      </section>
      <section className="discovery-section">
        <SectionTitle
          eyebrow="MAKE ROOM FOR DISCOVERY"
          title="What’s your kind of clever?"
          to="/games"
          label="Explore all 20"
        />
        <div className="category-tiles">
          {[
            ["Word", "Find the right words.", "Aa", "amber"],
            ["Memory", "Make it unforgettable.", "◈", "violet"],
            ["Logic", "Connect the dots.", "⌘", "cyan"],
            ["Numbers", "Get into your rhythm.", "123", "green"],
          ].map(([name, sub, symbol, color]) => (
            <Link
              to={`/games?category=${name}`}
              className={`category-tile ${color}`}
              key={name}
            >
              <span>{symbol}</span>
              <div>
                <h3>{name}</h3>
                <p>{sub}</p>
              </div>
              <ArrowUpRight size={17} />
            </Link>
          ))}
        </div>
      </section>
      <section className="grow-section">
        <div>
          <div className="eyebrow">TURN LITTLE WINS INTO SOMETHING BIGGER</div>
          <h2>
            Your progress.
            <br />A story worth playing.
          </h2>
          <p>
            Collect the moments that matter. Build a streak, earn achievements,
            and watch your personal best become your next starting line.
          </p>
          <Link to={user ? "/dashboard" : "/signup"} className="text-link">
            {user ? "See your progress" : "Start your free journey"}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="progress-preview">
          <div className="preview-top">
            <span className="tiny-icon">
              <Trophy size={20} />
            </span>
            <div>
              <strong>Every connection counts</strong>
              <span>Your next chapter starts with a game.</span>
            </div>
            <Sparkles size={18} />
          </div>
          <div className="preview-track">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="preview-features">
            <span>
              <Flame size={20} />
              Build a streak
            </span>
            <span>
              <Target size={20} />
              Beat your best
            </span>
            <span>
              <Trophy size={20} />
              Earn your badges
            </span>
          </div>
          <p>
            <Check size={13} />
            Your real progress. Saved with a free account.
          </p>
        </div>
      </section>
      <section className="home-store">
        <SectionTitle
          eyebrow="MORE WAYS TO CHALLENGE YOURSELF"
          title="A little extra for your next level."
          to="/store"
          label="Visit coin store"
        />
        <div className="home-store-inner">
          <div>
            <span className="coin-illustration small">
              <Coins size={44} />
            </span>
            <h3>
              Your curiosity.
              <br />
              More possibilities.
            </h3>
            <p>
              Choose clearly priced sessions or permanent advanced expansions.
              Free games remain labeled, and every coin charge needs your
              confirmation.
            </p>
            <Link to="/expansions" className="text-link">
              Explore expansions
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <CoinSlider config={config.data} compact />
        </div>
      </section>
      <section>
        <SectionTitle
          eyebrow="A LITTLE FRIENDLY COMPETITION"
          title="Find your place in the hive."
          to="/leaderboards"
          label="View leaderboards"
        />
        <div className="community-card">
          <div className="community-icons">
            <Trophy size={30} />
            <span>✦</span>
          </div>
          <div>
            <h3>A shared challenge. Your personal best.</h3>
            <p>
              Opt in with a public profile to see how your starter-game scores
              stack up. No paid boosts, just a little practice.
            </p>
          </div>
          <Link to="/leaderboards" className="button secondary">
            Meet the leaderboard
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="how-section">
        <SectionTitle
          eyebrow="YOUR NEXT GOOD HABIT"
          title="A brighter mind starts small."
        />
        <div className="how-grid">
          {[
            [
              "01",
              "Find your game",
              "Follow your curiosity through 20 word, memory and logic games.",
            ],
            [
              "02",
              "Find your rhythm",
              "Take a quick brain break. Play a daily challenge. Make it your own.",
            ],
            [
              "03",
              "Find your next best",
              "Create a free account to keep your records, streaks and achievements.",
            ],
          ].map(([n, t, d]) => (
            <div key={n}>
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="faq-section">
        <div>
          <div className="eyebrow">A FEW THINGS YOU MIGHT WONDER</div>
          <h2>
            Curiosity is
            <br />a good thing.
          </h2>
          <Link to="/help" className="text-link">
            Visit the help center
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div>
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="final-cta">
        <Sparkles size={25} />
        <h2>Your next best is one game away.</h2>
        <p>A few minutes. A fresh perspective. Let’s play.</p>
        <Link className="button primary" to="/games">
          Find your game
          <ArrowUpRight size={17} />
        </Link>
      </section>
    </div>
  );
}
