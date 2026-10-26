export type Action = { type: string; value?: string | number | number[] };
export type State = {
  slug: string;
  seed: number;
  difficulty: string;
  board: string[];
  target: string;
  targets: string[];
  selected: number[];
  found: string[];
  guesses: string[];
  moves: number;
  mistakes: number;
  score: number;
  round: number;
  sequence: number[];
  input: number[];
  status: "playing" | "won" | "lost";
  message: string;
  extra: Record<string, any>;
};
export function random(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const words = [
  "BLOOM",
  "HONEY",
  "BRAVE",
  "LIGHT",
  "SPARK",
  "ORBIT",
  "FOCUS",
  "DREAM",
  "PLANT",
  "CLOUD",
  "RIVER",
  "TRAIL",
  "STONE",
  "SHINE",
  "GRAIN",
  "FLAME",
];
const clues = [
  "A flower opens",
  "Bees make this",
  "Showing courage",
  "The opposite of dark",
  "A small flash",
  "A circular journey",
  "Pay close attention",
  "A sleeping story",
  "A living green thing",
  "A shape in the sky",
  "Flowing water",
  "A path to follow",
  "A small rock",
  "Give off brightness",
  "A tiny seed",
  "A dancing fire",
];
export const hiveWords = [
  "ACE",
  "ACT",
  "ANT",
  "APE",
  "ATE",
  "CAN",
  "CAP",
  "CAT",
  "EAT",
  "LAP",
  "NAP",
  "NET",
  "PAL",
  "PAN",
  "PAT",
  "PEA",
  "TAN",
  "TAP",
  "TEA",
  "LACE",
  "LANE",
  "LATE",
  "LEAN",
  "LEAP",
  "NEAT",
  "PACE",
  "PALE",
  "PANE",
  "PANT",
  "PATE",
  "PEAL",
  "PEAT",
  "PLAN",
  "PLAT",
  "TALE",
  "TAPE",
  "TEAL",
  "CLEAN",
  "CLEAT",
  "PANEL",
  "PENAL",
  "PETAL",
  "PLANE",
  "PLANT",
  "PLATE",
  "PLEAT",
  "PLANET",
];
const ladderWords = [
  "CAT",
  "COT",
  "COG",
  "DOG",
  "DOT",
  "DAT",
  "BAT",
  "BOT",
  "BAG",
  "BIG",
  "BUG",
  "BOG",
  "LOG",
  "LOT",
  "LAG",
  "LIT",
  "LIP",
  "TIP",
  "TOP",
  "TAP",
  "MAP",
  "MAT",
  "MET",
  "PET",
  "PIT",
  "POT",
  "HOT",
  "HAT",
  "HIT",
];
const dailyHives = [
  { letters: "ACELNPT", words: hiveWords },
  {
    letters: "ANGLERS",
    words: [
      "AGE",
      "ARE",
      "EAR",
      "ERA",
      "RAG",
      "RAN",
      "SAG",
      "SEA",
      "ANGEL",
      "ANGELS",
      "ANGLE",
      "ANGLES",
      "ANGER",
      "ANGLER",
      "ANGLERS",
      "EAGLE",
      "EAGLES",
      "LARGE",
      "LAGER",
      "LAGERS",
      "RANGE",
      "RANGES",
      "SNARE",
      "SNARL",
      "LEARN",
      "LEARNS",
      "GEAR",
      "GEARS",
      "GALE",
      "GALES",
      "REAL",
      "SEAL",
      "SALE",
      "SANE",
      "SANG",
    ],
  },
  {
    letters: "ORESTAP",
    words: [
      "OAR",
      "OARS",
      "ORE",
      "ORES",
      "ROE",
      "ROSE",
      "ROSES",
      "ROTE",
      "TORE",
      "STORE",
      "STORES",
      "STOOP",
      "STOP",
      "STOPS",
      "POST",
      "POSTS",
      "PORT",
      "PORTS",
      "PORE",
      "PORES",
      "PROSE",
      "ROAST",
      "ROASTS",
      "TOAST",
      "TOASTS",
      "TROOP",
      "TROOPS",
      "ROOT",
      "ROOTS",
      "SOAP",
      "SOAPS",
      "SOAR",
      "SOARS",
      "SPORT",
      "SPORTS",
      "SPORE",
      "SPORES",
      "OPERATE",
    ],
  },
  {
    letters: "ILNTERS",
    words: [
      "LIE",
      "LIES",
      "LIT",
      "TIE",
      "TIES",
      "TIN",
      "TINS",
      "SIN",
      "SINS",
      "SIT",
      "SITE",
      "SITES",
      "TIRE",
      "TIRES",
      "TIER",
      "TIERS",
      "RITE",
      "RITES",
      "RISE",
      "RISES",
      "LINE",
      "LINES",
      "LINT",
      "LIST",
      "LISTS",
      "ISLE",
      "ISLES",
      "NINE",
      "NINES",
      "INNER",
      "INLET",
      "INLETS",
      "INSERT",
      "LISTEN",
      "SILENT",
      "TINSEL",
      "ENTIRE",
    ],
  },
  {
    letters: "EACDRST",
    words: [
      "ACE",
      "ACES",
      "ARE",
      "EAR",
      "EARS",
      "ATE",
      "EAT",
      "EATS",
      "TEA",
      "TEAS",
      "RED",
      "REDS",
      "READ",
      "READS",
      "DEAR",
      "DEARS",
      "DARE",
      "DARES",
      "DATE",
      "DATES",
      "TEAR",
      "TEARS",
      "RATE",
      "RATES",
      "CARE",
      "CARES",
      "RACE",
      "RACES",
      "TRACE",
      "TRACES",
      "TRADE",
      "TRADES",
      "TREAD",
      "TREADS",
      "CATER",
      "CATERED",
      "CREATE",
      "CREATED",
      "EASTER",
      "STARE",
      "STARRED",
      "SACRED",
    ],
  },
  {
    letters: "UMOSETC",
    words: [
      "CUE",
      "CUES",
      "CUT",
      "CUTS",
      "CUTE",
      "COSTUME",
      "COSTUMES",
      "MUTE",
      "MUTES",
      "MOUSE",
      "MOUSES",
      "MUSE",
      "MUSES",
      "MUST",
      "OUT",
      "OUTS",
      "OUST",
      "OUSTS",
      "SCOUT",
      "SCOUTS",
      "SCUM",
      "SUM",
      "SUMS",
      "SUE",
      "SUET",
      "USE",
      "USES",
      "CUSTOM",
      "CUSTOMS",
    ],
  },
  {
    letters: "BREAINT",
    words: [
      "BAR",
      "BAT",
      "BET",
      "BIN",
      "BIT",
      "RIB",
      "TAB",
      "BAN",
      "BANE",
      "BARN",
      "BARE",
      "BEAR",
      "BEAT",
      "BEEN",
      "BEER",
      "BITE",
      "BRAN",
      "BRAT",
      "BRIBE",
      "BRAIN",
      "BRINE",
      "BRIAR",
      "BRIER",
      "TRIBE",
      "RABBI",
      "RABBIT",
      "BANNER",
      "BERET",
      "BRIBER",
      "BANTER",
    ],
  },
];
export const hexCoords: [number, number][] = [];
for (let r = -2; r <= 2; r++)
  for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++)
    hexCoords.push([q, r]);
export function hexAdjacent(a: number, b: number) {
  const p = hexCoords[a],
    q = hexCoords[b];
  if (!p || !q) return false;
  const x = p[0] - q[0],
    y = p[1] - q[1];
  return Math.max(Math.abs(x), Math.abs(y), Math.abs(x + y)) === 1;
}
export function feedback(guess: string, target: string) {
  const out = Array(guess.length).fill("absent"),
    letters = target.split("");
  guess.split("").forEach((l, i) => {
    if (l === letters[i]) {
      out[i] = "correct";
      letters[i] = "_";
    }
  });
  guess.split("").forEach((l, i) => {
    if (out[i] === "correct") return;
    const j = letters.indexOf(l);
    if (j >= 0) {
      out[i] = "present";
      letters[j] = "_";
    }
  });
  return out;
}
export function toggleLights(board: string[], i: number) {
  return board.map((v, j) =>
    [i, i % 3 > 0 ? i - 1 : -1, i % 3 < 2 ? i + 1 : -1, i - 3, i + 3].includes(
      j,
    )
      ? v === "1"
        ? "0"
        : "1"
      : v,
  );
}
export function createGame(
  slug: string,
  seed: number,
  difficulty = "starter",
): State {
  const rng = random(seed || 1),
    wi = Math.floor(rng() * words.length),
    word = words[wi];
  const s: State = {
    slug,
    seed,
    difficulty,
    board: [],
    target: word,
    targets: [],
    selected: [],
    found: [],
    guesses: [],
    moves: 0,
    mistakes: 0,
    score: 0,
    round: 0,
    sequence: [],
    input: [],
    status: "playing",
    message: "",
    extra: { clue: clues[wi] },
  };
  switch (slug) {
    case "hive-quest": {
      s.target = (
        difficulty === "advanced"
          ? ["MEMORY", "PUZZLE", "BRIGHT", "FLOWER", "LETTER"]
          : ["BEE", "HIVE", "MIND", "PLAY", "WORD"]
      )[wi % 5];
      s.board = Array.from(
        { length: 19 },
        () => "AEIOUBHLMNPRST"[Math.floor(rng() * 13)],
      );
      let path = [Math.floor(rng() * 19)];
      while (path.length < s.target.length) {
        const next = shuffle(
          hexCoords
            .map((_, i) => i)
            .filter((i) => !path.includes(i) && hexAdjacent(path.at(-1)!, i)),
          rng,
        );
        if (!next.length) {
          path = [0];
          continue;
        }
        path.push(next[0]);
      }
      path.forEach((p, i) => (s.board[p] = s.target[i]));
      s.extra.path = path;
      s.extra.clue = `Find ${s.target} by connecting neighboring hexagons.`;
      break;
    }
    case "orbit-recall":
      s.board = Array.from({ length: 9 }, (_, i) => String(i + 1));
      s.sequence = Array.from(
        { length: difficulty === "advanced" ? 8 : 5 },
        () => Math.floor(rng() * 9),
      );
      s.round = 1;
      break;
    case "number-rush":
    case "number-trail":
      s.board = shuffle(
        Array.from({ length: difficulty === "advanced" ? 25 : 16 }, (_, i) =>
          String(i + 1),
        ),
        rng,
      );
      break;
    case "daily-hive":
    case "word-blitz": {
      const hive = dailyHives[Math.abs(seed) % dailyHives.length];
      s.board = [
        hive.letters[0],
        ...shuffle(hive.letters.slice(1).split(""), rng),
      ];
      s.targets = [
        ...new Set(
          hive.words.filter(
            (w) =>
              w.length >= 3 &&
              w.includes(hive.letters[0]) &&
              w.split("").every((l) => hive.letters.includes(l)),
          ),
        ),
      ];
      s.extra.goal =
        slug === "word-blitz" ? (difficulty === "advanced" ? 12 : 6) : 5;
      break;
    }
    case "word-scramble":
      s.board = shuffle(word.split(""), rng);
      if (s.board.join("") === word) s.board.reverse();
      break;
    case "word-guess":
      s.extra.clue =
        "Guess any five-letter word. Green is placed correctly; amber belongs elsewhere.";
      break;
    case "memory-match":
      s.board = shuffle(
        [
          "✦",
          "✿",
          "◈",
          "☾",
          "⬡",
          "♧",
          ...(difficulty === "advanced" ? ["△", "◎"] : []),
        ].flatMap((x) => [x, x]),
        rng,
      );
      break;
    case "word-search": {
      s.targets = ["HIVE", "MIND", "PLAY"];
      s.board = Array.from(
        { length: 36 },
        () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(rng() * 26)],
      );
      const rows = shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, 3);
      s.targets.forEach((w, i) => {
        const start = rows[i] * 6 + Math.floor(rng() * 3);
        w.split("").forEach((l, j) => (s.board[start + j] = l));
      });
      break;
    }
    case "letter-rescue":
      s.extra.clue = clues[wi];
      break;
    case "word-ladder":
      s.target = "DOG";
      s.guesses = ["CAT"];
      s.extra.clue =
        "Change CAT into DOG. Change exactly one letter per step; use a common three-letter word.";
      break;
    case "missing-letters":
      s.board = word.split("").map((l, i) => (i % 2 ? "_" : l));
      break;
    case "synonym-match": {
      s.extra.pairs = [
        ["BRAVE", "BOLD"],
        ["QUICK", "FAST"],
        ["CALM", "PEACEFUL"],
        ["HAPPY", "JOYFUL"],
      ];
      s.board = shuffle(s.extra.pairs.flat(), rng);
      break;
    }
    case "odd-one-out": {
      const sets = [
        ["MERCURY", "VENUS", "MARS", "MOON"],
        ["APPLE", "PEAR", "PEACH", "CARROT"],
        ["TRIANGLE", "SQUARE", "PENTAGON", "CIRCLE"],
        ["ROBIN", "SPARROW", "EAGLE", "BAT"],
        ["IRON", "COPPER", "GOLD", "WOOD"],
      ];
      s.extra.sets = shuffle(sets, rng);
      s.board = shuffle(s.extra.sets[0], rng);
      break;
    }
    case "category-shuffle":
      s.extra.groups = [
        ["MERCURY", "VENUS", "MARS"],
        ["RED", "BLUE", "GREEN"],
        ["OAK", "PINE", "BIRCH"],
        ["DOG", "CAT", "FOX"],
      ];
      s.extra.labels = ["Planets", "Colors", "Trees", "Mammals"];
      s.board = shuffle(s.extra.groups.flat(), rng);
      break;
    case "code-breaker":
      s.target = Array.from({ length: 4 }, () =>
        String(1 + Math.floor(rng() * 6)),
      ).join("");
      s.extra.clue =
        "Find four digits, each from 1–6. Digits may repeat. Green = right place; amber = right digit, wrong place.";
      break;
    case "sequence-surge": {
      s.extra.questions = Array.from(
        { length: difficulty === "advanced" ? 8 : 5 },
        (_, i) => {
          const a = 2 + Math.floor(rng() * 8),
            step = 2 + Math.floor(rng() * 6),
            mult = i % 2 === 1;
          return {
            values: Array.from({ length: 4 }, (_, j) =>
              mult ? a * 2 ** j : a + j * step,
            ),
            answer: mult ? a * 16 : a + 4 * step,
          };
        },
      );
      s.board = s.extra.questions[0].values.map(String);
      break;
    }
    case "hive-lock":
      s.board = Array(9).fill("1");
      for (const i of shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], rng).slice(
        0,
        difficulty === "advanced" ? 7 : 3,
      ))
        s.board = toggleLights(s.board, i);
      if (s.board.every((x) => x === "1")) s.board = toggleLights(s.board, 0);
      break;
    case "slide-rush": {
      s.board = Array.from({ length: 9 }, (_, i) =>
        i === 8 ? "" : String(i + 1),
      );
      let previous = -1;
      for (let j = 0; j < (difficulty === "advanced" ? 80 : 16); j++) {
        const empty = s.board.indexOf("");
        const options = [
          empty - 3,
          empty + 3,
          ...(empty % 3 > 0 ? [empty - 1] : []),
          ...(empty % 3 < 2 ? [empty + 1] : []),
        ].filter((x) => x >= 0 && x < 9 && x !== previous);
        const next = options[Math.floor(rng() * options.length)];
        [s.board[empty], s.board[next]] = [s.board[next], s.board[empty]];
        previous = empty;
      }
      if (
        s.board.every(
          (value, index) => value === (index === 8 ? "" : String(index + 1)),
        )
      )
        [s.board[7], s.board[8]] = [s.board[8], s.board[7]];
      break;
    }
    default:
      throw new Error("Unknown game");
  }
  return s;
}
function win(s: State) {
  s.status = "won";
  s.score =
    Math.max(100, 1000 - s.mistakes * 75 - Math.max(0, s.moves - 5) * 5) +
    (s.difficulty === "advanced" ? 200 : 0);
  s.message = "Beautifully played. Another best in the making.";
}
function lose(s: State) {
  s.status = "lost";
  s.message = "Every attempt makes a connection. Give it another go.";
}
export function act(state: State, action: Action): State {
  const s: State = structuredClone(state);
  if (s.status !== "playing") return s;
  s.message = "";
  const v = String(action.value ?? "")
      .trim()
      .toUpperCase(),
    i = Number(action.value);
  if (action.type === "timeout") {
    lose(s);
    return s;
  }
  if (action.type === "clear") {
    s.selected = [];
    return s;
  }
  if (action.type === "select") {
    if (!Number.isInteger(i) || i < 0 || i >= s.board.length) return s;
    if (["hive-quest", "word-search", "category-shuffle"].includes(s.slug)) {
      if (s.selected.includes(i)) {
        s.selected = s.selected.filter((x) => x !== i);
        return s;
      }
      if (
        s.slug === "hive-quest" &&
        s.selected.length &&
        !hexAdjacent(s.selected.at(-1)!, i)
      ) {
        s.message = "Connect a neighboring hexagon.";
        return s;
      }
      if (
        s.slug === "category-shuffle" &&
        s.found.some((x) => x.split("|").includes(s.board[i]))
      )
        return s;
      s.selected.push(i);
      return s;
    }
    s.moves++;
    switch (s.slug) {
      case "number-rush":
      case "number-trail":
        if (s.board[i] === String(s.found.length + 1)) {
          s.found.push(s.board[i]);
          if (s.found.length === s.board.length) win(s);
        } else {
          s.mistakes++;
          s.message = `Find ${s.found.length + 1} next.`;
        }
        break;
      case "orbit-recall":
        if (i !== s.sequence[s.input.length]) {
          s.mistakes++;
          lose(s);
        } else {
          s.input.push(i);
          if (s.input.length === s.round) {
            s.input = [];
            s.round++;
            if (s.round > s.sequence.length) win(s);
            else s.message = "Sequence complete. Watch the next round.";
          }
        }
        break;
      case "memory-match":
      case "synonym-match": {
        if (s.found.includes(String(i)) || s.selected.includes(i)) return state;
        if (s.selected.length === 2) s.selected = [];
        s.selected.push(i);
        if (s.selected.length === 2) {
          const [a, b] = s.selected;
          const matched =
            s.slug === "memory-match"
              ? s.board[a] === s.board[b]
              : s.extra.pairs.some(
                  (p: string[]) =>
                    p.includes(s.board[a]) && p.includes(s.board[b]),
                );
          if (matched) {
            s.found.push(String(a), String(b));
            s.selected = [];
            if (s.found.length === s.board.length) win(s);
          } else s.mistakes++;
        }
        break;
      }
      case "odd-one-out":
        if (s.board[i] === s.extra.sets[s.round][3]) {
          s.round++;
          if (s.round === s.extra.sets.length) win(s);
          else
            s.board = shuffle(s.extra.sets[s.round], random(s.seed + s.round));
        } else {
          s.mistakes++;
          s.message = "Look for the item with a different category.";
          if (s.mistakes >= 3) lose(s);
        }
        break;
      case "hive-lock":
        s.board = toggleLights(s.board, i);
        if (s.board.every((x) => x === "1")) win(s);
        break;
      case "slide-rush": {
        const empty = s.board.indexOf("");
        if (
          Math.abs(Math.floor(empty / 3) - Math.floor(i / 3)) +
            Math.abs((empty % 3) - (i % 3)) !==
          1
        )
          return state;
        [s.board[i], s.board[empty]] = [s.board[empty], s.board[i]];
        if (s.board.every((v, j) => v === (j === 8 ? "" : String(j + 1))))
          win(s);
        break;
      }
    }
    return s;
  }
  if (action.type !== "submit") return s;
  s.moves++;
  switch (s.slug) {
    case "hive-quest":
      if (s.selected.map((j) => s.board[j]).join("") === s.target) win(s);
      else {
        s.mistakes++;
        s.message = "That path does not spell the target yet.";
        s.selected = [];
      }
      break;
    case "word-search": {
      const word = s.selected.map((j) => s.board[j]).join("");
      const reversed = word.split("").reverse().join("");
      const path = s.selected;
      const delta = path.length > 1 ? path[1] - path[0] : 0;
      const valid =
        path.length > 1 &&
        [1, -1, 6, -6, 5, -5, 7, -7].includes(delta) &&
        path.every(
          (j, k) =>
            !k ||
            (j - path[k - 1] === delta &&
              Math.abs((j % 6) - (path[k - 1] % 6)) <= 1),
        );
      const match = s.targets.find((t) => t === word || t === reversed);
      if (valid && match && !s.found.includes(match)) {
        s.found.push(match);
        s.extra.foundCells = [...(s.extra.foundCells ?? []), ...path];
        if (s.found.length === s.targets.length) win(s);
      } else {
        s.mistakes++;
        s.message = "Select a straight, unbroken line of letters.";
      }
      s.selected = [];
      break;
    }
    case "daily-hive":
    case "word-blitz":
      if (s.targets.includes(v) && !s.found.includes(v)) {
        s.found.push(v);
        s.message = `${v} — a new connection!`;
        if (s.found.length >= s.extra.goal) win(s);
      } else {
        s.mistakes++;
        s.message = s.found.includes(v)
          ? "You already found that word."
          : `Use at least 3 letters and include ${s.board[0]}. Try a common word.`;
      }
      break;
    case "word-scramble":
    case "missing-letters":
      if (v === s.target) win(s);
      else {
        s.mistakes++;
        s.message = "A little more rearranging. Try again.";
        if (s.mistakes >= 5) lose(s);
      }
      break;
    case "word-guess":
      if (!/^[A-Z]{5}$/.test(v)) {
        s.message = "Enter exactly five letters.";
        return s;
      }
      s.guesses.push(v);
      if (v === s.target) win(s);
      else if (s.guesses.length >= 6) lose(s);
      break;
    case "letter-rescue":
      if (!/^[A-Z]$/.test(v) || s.guesses.includes(v)) return state;
      s.guesses.push(v);
      if (!s.target.includes(v)) s.mistakes++;
      if (s.target.split("").every((l) => s.guesses.includes(l))) win(s);
      else if (s.mistakes >= 6) lose(s);
      break;
    case "word-ladder": {
      const last = s.guesses.at(-1)!;
      if (
        !ladderWords.includes(v) ||
        v.length !== 3 ||
        v.split("").filter((l, j) => l !== last[j]).length !== 1 ||
        s.guesses.includes(v)
      ) {
        s.message =
          "Use a new three-letter word and change exactly one letter.";
        return s;
      }
      s.guesses.push(v);
      if (v === s.target) win(s);
      else if (s.guesses.length >= 12) lose(s);
      break;
    }
    case "category-shuffle": {
      const selected = s.selected.map((j) => s.board[j]);
      const group = s.extra.groups.find(
        (p: string[]) =>
          p.length === selected.length && p.every((w) => selected.includes(w)),
      );
      if (group && !s.found.includes(group.join("|"))) {
        s.found.push(group.join("|"));
        if (s.found.length === 4) win(s);
      } else {
        s.mistakes++;
        s.message = "Choose three items with a shared category.";
        if (s.mistakes >= 4) lose(s);
      }
      s.selected = [];
      break;
    }
    case "code-breaker":
      if (!/^[1-6]{4}$/.test(v)) {
        s.message = "Enter four digits between 1 and 6.";
        return s;
      }
      s.guesses.push(v);
      if (v === s.target) win(s);
      else if (s.guesses.length >= 10) lose(s);
      break;
    case "sequence-surge":
      if (v === String(s.extra.questions[s.round].answer)) {
        s.round++;
        if (s.round === s.extra.questions.length) win(s);
        else s.board = s.extra.questions[s.round].values.map(String);
      } else {
        s.mistakes++;
        s.message = "Look for addition or multiplication.";
        if (s.mistakes >= 3) lose(s);
      }
      break;
  }
  return s;
}
export function replay(
  slug: string,
  seed: number,
  difficulty: string,
  actions: Action[],
) {
  if (actions.length > 2000) throw new Error("Too many moves");
  return actions.reduce(act, createGame(slug, seed, difficulty));
}
export function dailySeed(date = new Date()) {
  return Number(date.toISOString().slice(0, 10).replaceAll("-", ""));
}
export const timeLimit = (slug: string) => (slug === "word-blitz" ? 90 : 600);
export function scoreFor(state: State, seconds: number) {
  if (state.status !== "won") return 0;
  const timed = [
    "number-rush",
    "number-trail",
    "memory-match",
    "orbit-recall",
    "word-blitz",
  ].includes(state.slug);
  return Math.max(
    100,
    state.score - (timed ? Math.max(0, Math.floor(seconds)) * 2 : 0),
  );
}
export const campaignSeed = (level: number, difficulty = "starter") =>
  15000 + level * 7919 + (difficulty === "advanced" ? 104729 : 0);
