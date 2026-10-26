import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, Heart, Clock3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { categories } from "../../../backend/shared/catalog";
import { api, readLocal, useAuth } from "../lib/api";
import { PageTitle, GameCard, Empty, ErrorState } from "../components/UI";
export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(""),
    [difficulty, setDifficulty] = useState("All levels"),
    [tab, setTab] = useState("all");
  const { user } = useAuth();
  const searchField = useRef<HTMLInputElement>(null);
  const [, setFavoritesVersion] = useState(0);
  useEffect(() => {
    const update = () => setFavoritesVersion((version) => version + 1);
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchField.current?.focus();
      }
    };
    window.addEventListener("lexi-favorites", update);
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("lexi-favorites", update);
      window.removeEventListener("keydown", shortcut);
    };
  }, []);
  const category = params.get("category") || "All games";
  const available = useQuery({
    queryKey: ["games"],
    queryFn: () => api("/games"),
    retry: 1,
  });
  const progress = useQuery({
    queryKey: ["progress"],
    queryFn: () => api("/me/progress"),
    enabled: !!user,
  });
  const favorites = readLocal<string[]>("lexi-favorites", []),
    recent = readLocal<string[]>("lexi-recent", []);
  let filtered = (available.data ?? []).filter(
    (g: any) =>
      (category === "All games" || g.category === category) &&
      (difficulty === "All levels" || g.difficulty === difficulty) &&
      `${g.name} ${g.description}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (tab === "all" ||
        (tab === "favorites" ? favorites : recent).includes(g.slug)),
  );
  if (tab === "recent")
    filtered = filtered.sort(
      (a: any, b: any) => recent.indexOf(a.slug) - recent.indexOf(b.slug),
    );
  return (
    <div className="page">
      <PageTitle
        eyebrow="LET CURIOSITY LEAD THE WAY"
        title="Find your kind of clever."
        description="Twenty little adventures for your mind. Pick one and surprise yourself."
      />
      <div className="onboarding-strip">
        <span>
          <strong>1. Choose your access</strong>Free game, practice preview,
          priced session or permanent expansion.
        </span>
        <span>
          <strong>2. Confirm any coin charge</strong>The exact price and wallet
          balance appear before you spend.
        </span>
        <span>
          <strong>3. Save a full-game win</strong>Build XP and a UTC streak.
          Achievements can award coins; score does not convert to coins.
        </span>
      </div>
      <div className="catalog-toolbar">
        <div className="catalog-tabs">
          {[
            ["all", "All games"],
            ["favorites", "Favorites"],
            ["recent", "Recently played"],
          ].map(([v, l]) => (
            <button
              className={tab === v ? "active" : ""}
              key={v}
              onClick={() => setTab(v)}
            >
              {v === "favorites" ? (
                <Heart size={15} />
              ) : v === "recent" ? (
                <Clock3 size={15} />
              ) : null}
              {l}
            </button>
          ))}
        </div>
        <label className="search-input">
          <Search size={16} />
          <input
            ref={searchField}
            aria-label="Search games"
            placeholder="Find your next game…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>/</kbd>
        </label>
      </div>
      <div className="catalog-filters">
        <div className="category-filters">
          {categories.map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              onClick={() =>
                setParams(c === "All games" ? {} : { category: c })
              }
            >
              {c}
            </button>
          ))}
        </div>
        <label className="difficulty-filter">
          <SlidersHorizontal size={14} />
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            aria-label="Filter difficulty"
          >
            {["All levels", "Easy", "Medium", "Hard"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="results-label">
        <span>{filtered.length} games to get you thinking</span>
        <span>
          Prices shown before play <span className="live-dot" />
        </span>
      </div>
      {available.error && (
        <ErrorState error={available.error} retry={() => available.refetch()} />
      )}
      <div className="catalog-grid">
        {filtered.map((g: any) => (
          <GameCard
            key={`${g.slug}-${tab}`}
            game={g}
            best={
              progress.data?.find((p: any) => p.gameSlug === g.slug)?.bestScore
            }
          />
        ))}
      </div>
      {!filtered.length && (
        <Empty
          title="A different kind of discovery"
          description={
            tab === "favorites"
              ? "Tap a heart on any game to keep it here."
              : "Try a different search or category to find your next challenge."
          }
        />
      )}
      <div className="catalog-bottom-note">
        ✦ No downloads. No pressure. Just you and your next personal best.
      </div>
    </div>
  );
}
