import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Play as PlayIcon,
  RotateCcw,
  Volume2,
  VolumeX,
  Info,
  Timer,
  Target,
  Star,
  Check,
  Trophy,
  Flag,
  Send,
  Lightbulb,
  LockKeyhole,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { games } from "../../../backend/shared/catalog";
import {
  act,
  createGame,
  feedback,
  hexCoords,
  dailySeed,
  timeLimit,
  scoreFor,
  campaignSeed,
  replay,
  type State,
  type Action,
} from "../../../backend/shared/engine";
import {
  api,
  post,
  useAuth,
  useToast,
  readLocal,
  writeLocal,
} from "../lib/api";
import { Art, Badge, Empty } from "../components/UI";
import { useGameSession } from "../lib/gameSession";
import { accessLabel } from "../../../backend/shared/access";
import { EmailVerification } from "../components/EmailVerification";
const numberCoins = (value: number) => value.toLocaleString();
const instructions: Record<string, string> = {
  "hive-quest":
    "Spell the target word by selecting adjacent hexagons in order. Each tile can be used once. Select “Check path” when you’re ready. Earn up to 3 stars, separately from coins.",
  "orbit-recall":
    "Watch the glowing tiles, then repeat their order. Each round adds one tile to remember. Complete five rounds in starter mode. A wrong tile ends the run.",
  "number-rush":
    "Select every number from 1 to 16 in ascending order. Race your own clock, keep a steady rhythm, and see how quickly you can clear the board.",
  "daily-hive":
    "Make five different common words from today’s seven letters. Every word must contain the highlighted center letter and have at least three letters. Letters can repeat. The hive resets at midnight UTC.",
  "word-scramble":
    "Rearrange all five letters to reveal the hidden word. The clue can give you a nudge. You have five attempts.",
  "word-guess":
    "Find a five-letter word in six guesses. Green means a letter is in the correct position. Amber means it belongs somewhere else. Gray means it is absent.",
  "memory-match":
    "Flip two cards at a time to find matching symbols. Unmatched cards turn over when you start the next pair. Match them all to complete the board.",
  "word-search":
    "Find HIVE, MIND and PLAY. Select their letters in order along one straight, unbroken line, then check your selection. Words may run in either direction.",
  "letter-rescue":
    "Guess letters to reveal the hidden five-letter word. You can make six incorrect guesses. The clue gives you a starting point.",
  "word-ladder":
    "Turn CAT into DOG by changing just one letter at a time. Each step must be a common three-letter word. Complete the ladder in fewer than 12 steps.",
  "missing-letters":
    "Fill in the missing letters. Submit the complete five-letter word. Use the clue if you need a little help. You have five attempts.",
  "synonym-match":
    "Select two words that mean the same thing. There are four pairs to discover. An incorrect pair clears when you select the next word.",
  "odd-one-out":
    "Three items share a category. Pick the fourth that doesn’t belong. Complete five rounds, with up to three mistakes.",
  "category-shuffle":
    "Choose three words that share a category, then check your group. Find all four groups. Four incorrect groups end the challenge.",
  "number-trail":
    "Trace a trail through the shuffled numbers by selecting 1, then 2, then 3, until the board is complete. Keep your mistakes low.",
  "code-breaker":
    "Discover a secret four-digit code using digits 1–6. Digits can repeat. Green clues count exact placements; amber clues count correct digits elsewhere. Ten guesses.",
  "word-blitz":
    "Find six words before 90 seconds run out. Use only today’s seven letters. Include the highlighted center letter in every word, with at least three letters. Letters can repeat.",
  "sequence-surge":
    "Read the four numbers, discover their pattern, and enter the next number. Patterns use addition or multiplication. Complete five sequences before three mistakes.",
  "hive-lock":
    "Light every cell. Selecting a cell toggles it and its horizontal and vertical neighbors. Every starting board is generated from a solved board.",
  "slide-rush":
    "Slide a numbered tile into the empty adjacent space. Put 1–8 in order, with the empty space at the bottom right. Every board starts with legal moves.",
};
export type GuestRecord = {
  slug: string;
  seed: number;
  actions: Action[];
  score: number;
  at: string;
  stars?: number;
  level?: number;
};
export default function Play() {
  const { slug = "daily-hive" } = useParams();
  const game = games.find((g) => g.slug === slug);
  const { user } = useAuth(),
    q = useQueryClient(),
    toast = useToast();
  const [params] = useSearchParams();
  const mode = params.get("mode") === "advanced" ? "advanced" : "starter";
  const [selectedLevel, setSelectedLevel] = useState(1);
  const accessSession = useGameSession(slug, mode, selectedLevel);
  const access = accessSession.game.data?.access;
  const howToPlay =
    slug === "word-blitz" && mode === "advanced"
      ? instructions[slug].replace("six words", "twelve words")
      : slug === "sequence-surge" && mode === "advanced"
        ? instructions[slug].replace("five sequences", "eight sequences")
        : instructions[slug];
  const campaignQuery = useQuery({
    queryKey: ["campaign", slug, user?.id],
    queryFn: () => api(`/games/${slug}`),
    enabled: slug === "hive-quest" && !!user,
  });
  const campaign: Record<string, number> = user
    ? (campaignQuery.data?.campaign ?? {})
    : readLocal<GuestRecord[]>("lexi-progress", [])
        .filter((r) => r.slug === "hive-quest" && r.level)
        .reduce(
          (levels, record) => {
            const key = `starter:${record.level}`;
            levels[key] = Math.max(levels[key] ?? 0, record.stars ?? 1);
            return levels;
          },
          {} as Record<string, number>,
        );
  const [state, setState] = useState<State | null>(null),
    [actions, setActions] = useState<Action[]>([]),
    [session, setSession] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [guess, setGuess] = useState(""),
    [started, setStarted] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [sound, setSound] = useState(() => readLocal("lexi-sound", false)),
    [help, setHelp] = useState(false),
    [showResult, setShowResult] = useState(true),
    [saveStatus, setSaveStatus] = useState(""),
    [result, setResult] = useState<any>(null),
    [watch, setWatch] = useState(-1),
    [observing, setObserving] = useState(false),
    [clue, setClue] = useState(false);
  const saving = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    audio = useRef<AudioContext | null>(null);
  const audioPing = useCallback(() => {
    if (!sound) return;
    try {
      audio.current ??= new AudioContext();
      const oscillator = audio.current.createOscillator(),
        gain = audio.current.createGain();
      oscillator.connect(gain);
      gain.connect(audio.current.destination);
      oscillator.frequency.value = 523.25;
      gain.gain.setValueAtTime(0.025, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.12,
      );
      oscillator.start();
      oscillator.stop(audio.current.currentTime + 0.12);
    } catch {
      /* Browser may require audio activation. */
    }
  }, [sound]);
  const send = useCallback(
    (action: Action) => {
      if (accessSession.blocked) return;
      setState((old) => (old ? act(old, action) : null));
      setActions((old) => [...old, action]);
      audioPing();
    },
    [audioPing, accessSession.blocked],
  );
  function install(record: any, restoredActions: Action[] = []) {
    if (record.seed === undefined) return;
    setSession(record.id);
    setSelectedLevel(record.level ?? selectedLevel);
    setState(replay(slug, record.seed, mode, restoredActions));
    setActions(restoredActions);
    setStarted(Date.now() - accessSession.elapsed * 1000);
    setElapsed(0);
    setSaveStatus("");
    setResult(null);
    setShowResult(true);
    setGuess("");
    setClue(false);
    saving.current = false;
  }
  useEffect(() => {
    if (
      !state &&
      accessSession.record?.seed !== undefined &&
      ["ACTIVE", "TRIAL_ACTIVE"].includes(accessSession.billingState)
    ) {
      const saved = readLocal<any>(accessSession.cacheKey, null);
      install(accessSession.record, saved?.actions ?? []);
    }
  }, [accessSession.record?.id, accessSession.record?.billingState]);
  useEffect(() => {
    if (session && state)
      writeLocal(accessSession.cacheKey, { id: session, actions });
  }, [session, actions, accessSession.cacheKey]);
  async function start(intent: "preview" | "full" = "full") {
    if (
      state?.status === "playing" &&
      !window.confirm("Start a fresh challenge? Your current attempt will end.")
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (!accessSession.game.data || accessSession.game.error)
        throw new Error(
          "Game availability could not be checked. Refresh before playing.",
        );
      if (!access?.active)
        throw new Error("This game mode is currently unavailable.");
      if (access.accessType !== "FREE_FULL" && !user)
        throw new Error(
          "Sign in to start a preview or purchase a game session.",
        );
      if (user) {
        const charge =
          intent === "full" &&
          !["FREE_FULL", "PERMANENT_UNLOCK"].includes(access.accessType)
            ? access.coinPrice
            : 0;
        if (
          charge &&
          !window.confirm(
            `Start one full ${game?.name} session for ${charge} coins? A preview restarts as a fresh attempt. No automatic renewal.`,
          )
        )
          return;
        const record = await accessSession.start(intent, charge);
        install(
          record,
          readLocal<any>(accessSession.cacheKey, null)?.actions ?? [],
        );
        writeLocal(
          "lexi-recent",
          [
            slug,
            ...readLocal<string[]>("lexi-recent", []).filter((x) => x !== slug),
          ].slice(0, 20),
        );
        return;
      }
      let seed =
        slug === "hive-quest"
          ? campaignSeed(selectedLevel, mode)
          : ["daily-hive", "word-blitz"].includes(slug)
            ? dailySeed()
            : (crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646) + 1;
      let id = null;
      if (user) {
        const record = await post(`/games/${slug}/sessions`, {
          difficulty: mode,
          level: selectedLevel,
        });
        seed = record.seed;
        id = record.id;
      } else if (mode === "advanced")
        throw new Error(
          "Sign in and unlock this expansion to play advanced mode.",
        );
      setSession(id);
      setState(createGame(slug, seed, mode));
      setActions([]);
      setStarted(Date.now());
      setElapsed(0);
      setSaveStatus("");
      setResult(null);
      setShowResult(true);
      setGuess("");
      setClue(false);
      saving.current = false;
      writeLocal(
        "lexi-recent",
        [
          slug,
          ...readLocal<string[]>("lexi-recent", []).filter((x) => x !== slug),
        ].slice(0, 20),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (state?.status !== "playing") return;
    const id = setInterval(() => {
      if (accessSession.blocked) return;
      const seconds =
        user && session
          ? accessSession.elapsed
          : Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (
        !accessSession.preview &&
        seconds >=
          (accessSession.record?.sessionSeconds ??
            access?.sessionSeconds ??
            timeLimit(slug))
      )
        send({ type: "timeout" });
    }, 500);
    return () => clearInterval(id);
  }, [
    state?.status,
    started,
    slug,
    send,
    accessSession.blocked,
    accessSession.elapsed,
    user,
    session,
  ]);
  const round = state?.round ?? 0,
    status = state?.status;
  useEffect(() => {
    if (slug !== "orbit-recall" || status !== "playing" || !state) return;
    setObserving(true);
    setWatch(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    state.sequence.slice(0, round).forEach((tile, i) => {
      timers.push(
        setTimeout(() => setWatch(tile), 700 + i * 850),
        setTimeout(() => setWatch(-1), 1250 + i * 850),
      );
    });
    timers.push(setTimeout(() => setObserving(false), 700 + round * 850));
    return () => timers.forEach(clearTimeout);
  }, [round, status, slug]);
  async function save() {
    if (!state || state.status === "playing" || saving.current) return;
    saving.current = true;
    if (!user || !session) {
      if (state.status === "won") {
        const records = readLocal<GuestRecord[]>("lexi-progress", []);
        writeLocal(
          "lexi-progress",
          [
            {
              slug,
              seed: state.seed,
              actions,
              score: scoreFor(state, elapsed),
              level: selectedLevel,
              stars: state.mistakes === 0 ? 3 : state.mistakes < 3 ? 2 : 1,
              at: new Date().toISOString(),
            },
            ...records,
          ].slice(0, 100),
        );
      }
      setSaveStatus(
        "Saved on this device. Create an account to keep your records.",
      );
      return;
    }
    setSaveStatus("Saving your little win…");
    try {
      const r = await post(`/games/${slug}/complete`, {
        sessionId: session,
        actions,
      });
      setResult(r);
      setSaveStatus(
        r.practice
          ? "Practice preview saved. Previews award no points, XP, achievements or coins."
          : "Your progress is saved to your account.",
      );
      writeLocal(accessSession.cacheKey, null);
      await q.invalidateQueries();
      if (r.achievements?.length)
        toast(
          `Achievement unlocked! ${r.achievements.length * 25} virtual coins earned.`,
        );
    } catch (e: any) {
      setSaveStatus(`Could not save: ${e.message}`);
      saving.current = false;
    }
  }
  useEffect(() => {
    if (state && state.status !== "playing") void save();
  }, [state?.status]);
  useEffect(() => {
    if (
      state &&
      state.status !== "playing" &&
      showResult &&
      !dialog.current?.open
    )
      dialog.current?.showModal();
  }, [state?.status, showResult]);
  if (!game)
    return (
      <Empty
        title="A game waiting to be discovered?"
        description="We couldn’t find that game. There are 20 others to explore."
        action={
          <Link to="/games" className="button primary">
            Browse games
          </Link>
        }
      />
    );
  function submit(e: React.FormEvent) {
    e.preventDefault();
    send({ type: "submit", value: guess });
    setGuess("");
  }
  const best = user
    ? undefined
    : Math.max(
        0,
        ...readLocal<GuestRecord[]>("lexi-progress", [])
          .filter((r) => r.slug === slug)
          .map((r) => r.score),
      );
  const isGrid =
    state &&
    [
      "number-rush",
      "number-trail",
      "memory-match",
      "synonym-match",
      "odd-one-out",
      "hive-lock",
      "slide-rush",
      "word-search",
      "category-shuffle",
      "orbit-recall",
    ].includes(slug);
  const inputGame = [
    "word-scramble",
    "word-guess",
    "word-ladder",
    "missing-letters",
    "code-breaker",
    "sequence-surge",
    "daily-hive",
    "word-blitz",
  ].includes(slug);
  return (
    <div className={`page game-page ${game.color}`}>
      <Link to="/games" className="back-link">
        <ArrowLeft size={15} />
        Back to all games
      </Link>
      <div className="game-page-heading">
        <div>
          <div className="eyebrow">
            A LITTLE {game.category.toUpperCase()} ADVENTURE
          </div>
          <h1>
            {game.name}
            <Badge color={game.color}>
              {mode === "advanced" && accessSession.game.data?.owned
                ? "Already unlocked"
                : accessLabel(access)}
            </Badge>
          </h1>
          <p>{game.description}</p>
        </div>
        <div className="game-tools">
          <button
            className="icon-button"
            aria-label={sound ? "Mute game sounds" : "Enable game sounds"}
            aria-pressed={sound}
            onClick={() => {
              setSound(!sound);
              writeLocal("lexi-sound", !sound);
            }}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="icon-button"
            aria-label="Game instructions"
            onClick={() => setHelp(!help)}
          >
            <Info size={18} />
          </button>
        </div>
      </div>
      <div className="access-explainer panel">
        <strong>{accessLabel(access)}</strong>
        <span>
          Wallet:{" "}
          {user
            ? `${numberCoins(user.wallet?.balance ?? 0)} coins`
            : "Sign in for saved progress and paid access"}
          .
        </span>
        {access?.accessType === "FREE_TRIAL_THEN_PAID" && (
          <p>
            One {access.trialSeconds}-second practice preview per mode each UTC
            day. No preview rewards. Continuing starts one fresh full attempt
            for {access.coinPrice} coins; confirm before any charge.
          </p>
        )}
        <p>
          Score measures performance. Eligible wins earn 40 XP (up to 20 per UTC
          day). Six one-time achievements award 25 coins each. A saved win
          maintains your streak.
        </p>
        <EmailVerification returnTo={location.pathname + location.search} />
        {!user && access?.accessType !== "FREE_FULL" && (
          <Link
            className="button primary"
            to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
          >
            Sign in to play
          </Link>
        )}
        {(accessSession.game.error || accessSession.recoveryError) && (
          <p role="alert">
            {accessSession.game.error?.message || accessSession.recoveryError}
          </p>
        )}
      </div>
      {slug === "hive-quest" && (
        <section className="campaign-section" aria-label="Hive Quest levels">
          <div>
            <span className="eyebrow">
              {mode === "advanced"
                ? "AFTER HOURS · EXPANSION LEVELS"
                : "YOUR HIVE QUEST · FREE CAMPAIGN"}
            </span>
            <span>Stars stay separate from coins.</span>
          </div>
          <div className="campaign-levels">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((level) => {
              const stars = campaign[`${mode}:${level}`] ?? 0,
                locked = level > 1 && !campaign[`${mode}:${level - 1}`];
              return (
                <button
                  key={level}
                  disabled={locked}
                  aria-label={`Hive level ${level}${locked ? ", locked" : `, ${stars} stars`}`}
                  className={selectedLevel === level ? "active" : ""}
                  onClick={() => {
                    if (
                      state?.status === "playing" &&
                      !window.confirm(
                        "Leave this attempt and choose another hive level?",
                      )
                    )
                      return;
                    setSelectedLevel(level);
                    setState(null);
                    setActions([]);
                    setError("");
                  }}
                >
                  <strong>{locked ? <LockKeyhole size={15} /> : level}</strong>
                  <span>{stars ? "★".repeat(stars) : "· · ·"}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className="play-layout">
        <section className="play-area">
          {accessSession.blocked && (
            <div
              className="session-gate"
              role="dialog"
              aria-label="Game session access"
            >
              <h2>
                {accessSession.billingState === "TRIAL_EXPIRED"
                  ? "Your free trial has ended."
                  : accessSession.record?.refundable
                    ? "Your purchased session is ready."
                    : "Review your game access."}
              </h2>
              <p>
                {game.name} · {accessSession.record?.coinPrice} coins for one
                full attempt. Wallet: {user?.wallet?.balance ?? 0} coins.
              </p>
              <p>
                A preview restarts as a fresh full attempt. Refreshing an active
                paid session does not charge again.
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {accessSession.record?.refundable ||
              accessSession.billingState === "CREATED" ? (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      install(await accessSession.resume());
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Resume without another charge
                </button>
              ) : (
                ["TRIAL_EXPIRED", "PAYMENT_REQUIRED"].includes(
                  accessSession.billingState,
                ) && (
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      (user?.wallet?.balance ?? 0) <
                        accessSession.record.coinPrice
                    }
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Confirm ${accessSession.record.coinPrice} coins for one full ${game.name} session?`,
                        )
                      )
                        return;
                      setBusy(true);
                      setError("");
                      try {
                        install(await accessSession.purchase());
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Continue for {accessSession.record.coinPrice} coins
                  </button>
                )
              )}
              <div className="button-row">
                <Link className="button secondary" to="/store">
                  Buy coins
                </Link>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await accessSession.cancel();
                      window.location.assign("/games");
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  {accessSession.record?.refundable
                    ? "Cancel and refund unstarted session"
                    : "Exit game"}
                </button>
              </div>
            </div>
          )}
          <div inert={accessSession.blocked || undefined}>
            {!state ? (
              <div className="game-intro">
                <Art game={game} large />
                <div>
                  <Badge color={game.color}>YOUR NEXT “AHA!” MOMENT</Badge>
                  <h2>Ready when you are.</h2>
                  <p>{howToPlay}</p>
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    className="button primary"
                    onClick={() => start("full")}
                    disabled={
                      busy ||
                      accessSession.game.isPending ||
                      !!accessSession.game.error ||
                      !access?.active
                    }
                  >
                    {busy ? (
                      "Preparing your challenge…"
                    ) : (
                      <>
                        <PlayIcon size={16} fill="currentColor" />
                        {access &&
                        !["FREE_FULL", "PERMANENT_UNLOCK"].includes(
                          access.accessType,
                        )
                          ? `Start full game — ${access.coinPrice} coins`
                          : "Let’s play"}
                        <ArrowUpRight size={16} />
                      </>
                    )}
                  </button>
                  {access?.accessType === "FREE_TRIAL_THEN_PAID" && (
                    <button
                      className="button secondary"
                      disabled={busy || !user}
                      onClick={() => start("preview")}
                    >
                      Try free for {access.trialSeconds} seconds
                    </button>
                  )}
                  {!user && (
                    <span className="guest-play-note">
                      <Check size={13} />
                      No account needed. Just a little curiosity.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="game-scorebar">
                  {accessSession.preview && (
                    <Badge color="amber">
                      Practice preview ·{" "}
                      {Math.max(
                        0,
                        (accessSession.record?.trialSeconds ?? 0) -
                          accessSession.elapsed,
                      )}
                      s remaining
                    </Badge>
                  )}
                  <span>
                    <Timer size={16} />
                    <strong>
                      {slug === "word-blitz"
                        ? `${Math.max(0, 90 - elapsed)}s`
                        : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
                    </strong>
                    <small>
                      {slug === "word-blitz" ? "remaining" : "time"}
                    </small>
                  </span>
                  <span>
                    <Target size={16} />
                    <strong>{state.moves}</strong>
                    <small>moves</small>
                  </span>
                  <span>
                    <Star size={16} />
                    <strong>{state.mistakes}</strong>
                    <small>mistakes</small>
                  </span>
                  <button
                    className="icon-button"
                    onClick={() => start("full")}
                    disabled={busy}
                    aria-label="Restart game"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <div className="game-board-wrap">
                  <div className="game-prompt">
                    {slug === "hive-quest"
                      ? `Connect the letters: ${state.target}`
                      : slug === "orbit-recall"
                        ? `${observing ? "Watch the sequence" : "Your turn"} · Round ${Math.min(state.round, state.sequence.length)} of ${state.sequence.length}`
                        : slug === "number-rush" || slug === "number-trail"
                          ? `Next up: ${state.found.length + 1} of ${state.board.length}`
                          : slug === "odd-one-out"
                            ? `Which one doesn’t belong? · ${state.round + 1} / 5`
                            : slug === "sequence-surge"
                              ? `What comes next? · ${state.round + 1} / ${state.extra.questions.length}`
                              : slug === "hive-lock"
                                ? "Light up every cell."
                                : slug === "slide-rush"
                                  ? "A little order from the shuffle."
                                  : slug === "daily-hive" ||
                                      slug === "word-blitz"
                                    ? `${state.found.length} / ${state.extra.goal} words found · Always include ${state.board[0]}`
                                    : slug === "category-shuffle"
                                      ? `${state.found.length} of 4 groups discovered`
                                      : slug === "memory-match" ||
                                          slug === "synonym-match"
                                        ? `${state.found.length / 2} pairs found`
                                        : slug === "word-search"
                                          ? `Find ${state.targets.join(" · ")}`
                                          : slug === "letter-rescue"
                                            ? `${6 - state.mistakes} chances left`
                                            : slug === "code-breaker"
                                              ? `Four digits. ${10 - state.guesses.length} chances left.`
                                              : slug === "word-ladder"
                                                ? "CAT → … → DOG"
                                                : "Trust your next thought."}
                  </div>
                  {slug === "hive-quest" && (
                    <div className="hex-board">
                      {hexCoords.map(([x, y], i) => (
                        <button
                          key={i}
                          style={{
                            left: `${50 + (x + y / 2) * 19}%`,
                            top: `${50 + y * 18}%`,
                          }}
                          className={
                            state.selected.includes(i) ? "selected" : ""
                          }
                          onClick={() => send({ type: "select", value: i })}
                          disabled={status !== "playing"}
                          aria-label={`Letter ${state.board[i]}, tile ${i + 1}`}
                          aria-pressed={state.selected.includes(i)}
                        >
                          {state.board[i]}
                        </button>
                      ))}
                    </div>
                  )}
                  {isGrid && (
                    <div
                      className={`game-grid grid-${slug}`}
                      style={{
                        gridTemplateColumns: `repeat(${slug === "word-search" ? 6 : slug === "number-rush" || slug === "number-trail" ? Math.sqrt(state.board.length) : ["hive-lock", "slide-rush", "orbit-recall", "category-shuffle"].includes(slug) ? 3 : slug === "memory-match" ? 4 : 2},minmax(0,1fr))`,
                      }}
                    >
                      {state.board.map((cell, i) => {
                        const found =
                          state.found.includes(
                            ["number-rush", "number-trail"].includes(slug)
                              ? cell
                              : String(i),
                          ) ||
                          (state.extra.foundCells ?? []).includes(i) ||
                          (slug === "category-shuffle" &&
                            state.found.some((x) =>
                              x.split("|").includes(cell),
                            ));
                        const hidden =
                          slug === "memory-match" &&
                          !found &&
                          !state.selected.includes(i);
                        return (
                          <button
                            key={i}
                            disabled={
                              status !== "playing" ||
                              observing ||
                              found ||
                              cell === ""
                            }
                            className={`${found ? "found" : ""} ${state.selected.includes(i) ? "selected" : ""} ${slug === "hive-lock" && cell === "1" ? "lit" : ""} ${slug === "orbit-recall" && watch === i ? "orbit-lit" : ""} ${cell === "" ? "empty-tile" : ""}`}
                            aria-label={
                              hidden
                                ? `Reveal card ${i + 1}`
                                : slug === "hive-lock"
                                  ? `Toggle light ${i + 1}, ${cell === "1" ? "on" : "off"}`
                                  : slug === "orbit-recall"
                                    ? `Sequence tile ${i + 1}`
                                    : cell || "Empty space"
                            }
                            onClick={() => send({ type: "select", value: i })}
                          >
                            {hidden
                              ? "✦"
                              : slug === "hive-lock"
                                ? cell === "1"
                                  ? "✦"
                                  : "·"
                                : slug === "orbit-recall"
                                  ? ""
                                  : cell}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {["daily-hive", "word-blitz"].includes(slug) && (
                    <div className="hive-letter-flower">
                      {state.board.map((l, i) => (
                        <button
                          key={i}
                          className={`hive-letter hl${i} ${i === 0 ? "center" : ""}`}
                          onClick={() => setGuess(guess + l)}
                          disabled={status !== "playing"}
                          aria-label={`Add ${l}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                  {[
                    "word-scramble",
                    "missing-letters",
                    "sequence-surge",
                  ].includes(slug) && (
                    <div className="letter-tiles">
                      {state.board.map((l, i) => (
                        <span key={i}>{l}</span>
                      ))}
                      {slug === "sequence-surge" && (
                        <span className="unknown">?</span>
                      )}
                    </div>
                  )}
                  {slug === "word-guess" && (
                    <div className="guess-board">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i}>
                          {Array.from({ length: 5 }, (_, j) => (
                            <span
                              key={j}
                              className={
                                state.guesses[i]
                                  ? feedback(state.guesses[i], state.target)[j]
                                  : ""
                              }
                            >
                              {state.guesses[i]?.[j] ??
                                (i === state.guesses.length ? guess[j] : "")}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {slug === "code-breaker" && (
                    <div className="code-history">
                      {state.guesses.map((g, i) => {
                        const f = feedback(g, state.target);
                        return (
                          <div key={i}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <strong>{g.split("").join(" ")}</strong>
                            <span className="code-pegs">
                              {f.sort().map((c, j) => (
                                <i key={j} className={c} />
                              ))}
                            </span>
                            <small>
                              {f.filter((c) => c === "correct").length} exact ·{" "}
                              {f.filter((c) => c === "present").length}{" "}
                              elsewhere
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {slug === "letter-rescue" && (
                    <>
                      <div className="rescue-chances">
                        {Array.from({ length: 6 }, (_, i) => (
                          <span
                            key={i}
                            className={i < state.mistakes ? "used" : ""}
                          >
                            ♡
                          </span>
                        ))}
                      </div>
                      <div className="letter-tiles">
                        {state.target.split("").map((l, i) => (
                          <span key={i}>
                            {state.guesses.includes(l) || status === "lost"
                              ? l
                              : "_"}
                          </span>
                        ))}
                      </div>
                      <div className="keyboard">
                        {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => (
                          <button
                            key={l}
                            disabled={
                              state.guesses.includes(l) || status !== "playing"
                            }
                            className={
                              state.guesses.includes(l)
                                ? state.target.includes(l)
                                  ? "correct"
                                  : "absent"
                                : ""
                            }
                            onClick={() => send({ type: "submit", value: l })}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {slug === "word-ladder" && (
                    <div className="ladder-history">
                      {state.guesses.map((g, i) => (
                        <span key={i}>
                          {g}
                          {i < state.guesses.length - 1 && (
                            <ArrowRight size={14} />
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  {[
                    "word-search",
                    "daily-hive",
                    "word-blitz",
                    "category-shuffle",
                  ].includes(slug) &&
                    state.found.length > 0 && (
                      <div className="found-words">
                        {state.found.map((w) => (
                          <Badge key={w} color="green">
                            <Check size={11} />
                            {w.replaceAll("|", " · ")}
                          </Badge>
                        ))}
                      </div>
                    )}
                  {["hive-quest", "word-search", "category-shuffle"].includes(
                    slug,
                  ) && (
                    <div className="selection-controls">
                      <strong>
                        {state.selected
                          .map((i) => state.board[i])
                          .join(slug === "category-shuffle" ? " · " : "") ||
                          "Select your tiles"}
                      </strong>
                      <div className="button-row">
                        <button
                          className="button secondary"
                          onClick={() => send({ type: "clear" })}
                          disabled={!state.selected.length}
                        >
                          Clear
                        </button>
                        <button
                          className="button primary"
                          onClick={() => send({ type: "submit" })}
                          disabled={
                            !state.selected.length || status !== "playing"
                          }
                        >
                          Check{" "}
                          {slug === "hive-quest"
                            ? "path"
                            : slug === "category-shuffle"
                              ? "group"
                              : "word"}
                          <Check size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                  {inputGame && (
                    <form className="game-input-form" onSubmit={submit}>
                      <label className="sr-only" htmlFor="game-answer">
                        {slug === "code-breaker"
                          ? "Four digit code"
                          : "Your answer"}
                      </label>
                      <input
                        id="game-answer"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        value={guess}
                        maxLength={
                          slug === "word-guess"
                            ? 5
                            : slug === "code-breaker"
                              ? 4
                              : 20
                        }
                        inputMode={
                          ["code-breaker", "sequence-surge"].includes(slug)
                            ? "numeric"
                            : "text"
                        }
                        onChange={(e) => setGuess(e.target.value.toUpperCase())}
                        placeholder={
                          slug === "sequence-surge"
                            ? "Next number…"
                            : slug === "code-breaker"
                              ? "Digits 1–6…"
                              : "Your next word…"
                        }
                        disabled={status !== "playing"}
                      />
                      <button
                        className="button primary"
                        disabled={!guess || status !== "playing"}
                        aria-label="Submit answer"
                      >
                        <Send size={17} />
                      </button>
                    </form>
                  )}
                  {state.message && (
                    <p className="game-feedback" role="status">
                      {state.message}
                    </p>
                  )}
                  {status !== "playing" && (
                    <button
                      className="button secondary"
                      onClick={() => setShowResult(true)}
                    >
                      View result
                      <Trophy size={15} />
                    </button>
                  )}
                </div>
                <div className="game-bottom">
                  <span>
                    <span className="live-dot" />
                    {user
                      ? "Progress saves to your account"
                      : "Guest play · Device records only"}
                  </span>
                  {status === "playing" && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            "End this attempt? You can start a new game right away.",
                          )
                        )
                          send({ type: "timeout" });
                      }}
                    >
                      <Flag size={13} />
                      End attempt
                    </button>
                  )}
                </div>
              </>
            )}
            {error && state && <p className="form-error">{error}</p>}
          </div>
        </section>
        <aside className="game-side">
          <section>
            <span className="eyebrow">
              <Info size={13} /> A LITTLE KNOW-HOW
            </span>
            <h3>How to play</h3>
            <p>{howToPlay}</p>
            {help && (
              <p>
                Use Tab to move between controls and Enter or Space to select.
                Touch works on every board. Sound is optional. Free-mode scores
                are calculated on the server from your moves.
              </p>
            )}
            <button className="text-link" onClick={() => setHelp(!help)}>
              {help ? "Less detail" : "Keyboard & scoring details"}
              <ArrowUpRight size={13} />
            </button>
          </section>
          <section className="game-personal">
            <span className="tiny-icon amber">
              <Trophy size={19} />
            </span>
            <h3>Your next personal best</h3>
            <p>
              {user
                ? "Every completed challenge adds to your journey. Your dashboard keeps the record."
                : best
                  ? `Your device best: ${best} points. A little practice goes a long way.`
                  : "The first game is the start of something good."}
            </p>
            <Link to={user ? "/dashboard" : "/signup"} className="text-link">
              {user ? "View your progress" : "Save your journey"}
              <ArrowRight size={14} />
            </Link>
          </section>
          {["word-scramble", "missing-letters", "letter-rescue"].includes(
            slug,
          ) &&
            state && (
              <section>
                <button className="text-link" onClick={() => setClue(!clue)}>
                  <Lightbulb size={16} />
                  {clue ? "Hide clue" : "A little nudge?"}
                </button>
                {clue && <p>{state.extra.clue}</p>}
              </section>
            )}
          <section className="free-note">
            <LockKeyhole size={16} />
            <p>
              Free games, priced sessions and permanent expansions are labeled
              before you start. No automatic coin deductions.
            </p>
            <Link to="/expansions">
              Explore a little more
              <ArrowUpRight size={13} />
            </Link>
          </section>
        </aside>
      </div>
      {state && status !== "playing" && showResult && (
        <dialog
          aria-labelledby="game-result-title"
          className="result-dialog"
          ref={dialog}
          onCancel={() => setShowResult(false)}
        >
          <div className="result-symbol">
            {status === "won" ? <Trophy size={36} /> : <RotateCcw size={36} />}
          </div>
          <Badge color={status === "won" ? "green" : "amber"}>
            {status === "won"
              ? "A LITTLE WIN. A NEW CONNECTION."
              : "EVERY ATTEMPT COUNTS."}
          </Badge>
          <h2 id="game-result-title">
            {status === "won"
              ? "Look at you go."
              : "Your next best is waiting."}
          </h2>
          <p>
            {status === "won"
              ? "Take a breath. You made something click."
              : "A fresh attempt brings a fresh perspective."}
          </p>
          <div className="result-stats">
            <span>
              <strong>{result?.score ?? scoreFor(state, elapsed)}</strong>points
            </span>
            <span>
              <strong>
                {Math.floor(elapsed / 60)}:
                {String(elapsed % 60).padStart(2, "0")}
              </strong>
              time
            </span>
            <span>
              <strong>{result?.xp ?? 0}</strong>XP saved
            </span>
          </div>
          {slug === "hive-quest" && status === "won" && (
            <div className="result-stars">
              {"★".repeat(
                state.mistakes === 0 ? 3 : state.mistakes < 3 ? 2 : 1,
              )}
              <small>Hive stars · separate from wallet coins</small>
            </div>
          )}
          <p className="save-status" role="status">
            {saveStatus}
          </p>
          {saveStatus.startsWith("Could not") && (
            <button className="text-link" onClick={save}>
              Retry saving
              <RotateCcw size={13} />
            </button>
          )}
          <div className="button-row">
            <button
              className="button primary"
              onClick={() => {
                dialog.current?.close();
                setShowResult(false);
                void start();
              }}
            >
              <RotateCcw size={16} />
              Play again
            </button>
            <Link className="button secondary" to="/games">
              Explore games
              <ArrowRight size={16} />
            </Link>
          </div>
          <button
            className="text-link result-close"
            onClick={() => {
              dialog.current?.close();
              setShowResult(false);
            }}
          >
            Back to my board
          </button>
        </dialog>
      )}
    </div>
  );
}
export function Daily() {
  return (
    <div className="page daily-page">
      <div className="daily-landing">
        <Badge color="green">
          <span className="live-dot" />
          ONE HIVE. A FRESH START EVERY DAY.
        </Badge>
        <h1>
          A little ritual
          <br />
          for your <span>curiosity.</span>
        </h1>
        <p>
          Seven letters. One center. How many connections can you make?
          <br />
          Today’s Daily Hive is ready whenever you are.
        </p>
        <Art game={games[3]} large />
        <Link to="/games/daily-hive" className="button primary">
          Play today’s hive
          <ArrowUpRight size={17} />
        </Link>
        <p className="daily-reset">Free for everyone · Resets at 00:00 UTC</p>
      </div>
    </div>
  );
}
