import { act, createGame, toggleLights, type Action } from "./engine.js";
// Deterministic solvers for test fixtures only; never imported by either application bundle.
export function solve(
  slug: string,
  seed = 42,
  difficulty = "starter",
): Action[] {
  let s = createGame(slug, seed, difficulty);
  const actions: Action[] = [];
  function go(a: Action) {
    actions.push(a);
    s = act(s, a);
  }
  const select = (value: number) => go({ type: "select", value }),
    submit = (value?: string) => go({ type: "submit", value });
  switch (slug) {
    case "hive-quest":
      s.extra.path.forEach(select);
      submit();
      break;
    case "orbit-recall":
      while (s.status === "playing") {
        for (const n of s.sequence.slice(0, s.round)) select(n);
      }
      break;
    case "number-rush":
    case "number-trail":
      for (let i = 1; i <= s.board.length; i++)
        select(s.board.indexOf(String(i)));
      break;
    case "daily-hive":
    case "word-blitz":
      s.targets.slice(0, s.extra.goal).forEach(submit);
      break;
    case "word-scramble":
    case "word-guess":
    case "missing-letters":
    case "code-breaker":
      submit(s.target);
      break;
    case "memory-match":
      for (const symbol of new Set(s.board)) {
        const indices = s.board
          .map((x, i) => (x === symbol ? i : -1))
          .filter((x) => x >= 0);
        indices.forEach(select);
      }
      break;
    case "word-search":
      for (const word of s.targets) {
        let found: number[] = [];
        for (let i = 0; i < s.board.length && !found.length; i++)
          for (const delta of [1, -1, 6, -6, 5, -5, 7, -7]) {
            const path = Array.from(
              { length: word.length },
              (_, j) => i + j * delta,
            );
            if (
              path.every(
                (p, j) =>
                  p >= 0 &&
                  p < 36 &&
                  s.board[p] === word[j] &&
                  (!j || Math.abs((p % 6) - (path[j - 1] % 6)) <= 1),
              )
            ) {
              found = path;
              break;
            }
          }
        found.forEach(select);
        submit();
      }
      break;
    case "letter-rescue":
      new Set(s.target).forEach(submit);
      break;
    case "word-ladder":
      ["COT", "COG", "DOG"].forEach(submit);
      break;
    case "synonym-match":
      s.extra.pairs.forEach((p: string[]) =>
        p.forEach((w) => select(s.board.indexOf(w))),
      );
      break;
    case "odd-one-out":
      while (s.status === "playing")
        select(s.board.indexOf(s.extra.sets[s.round][3]));
      break;
    case "category-shuffle":
      s.extra.groups.forEach((p: string[]) => {
        p.forEach((w) => select(s.board.indexOf(w)));
        submit();
      });
      break;
    case "sequence-surge":
      while (s.status === "playing")
        submit(String(s.extra.questions[s.round].answer));
      break;
    case "hive-lock": {
      const queue: [string, number[]][] = [[s.board.join(""), []]],
        seen = new Set<string>();
      for (let head = 0; head < queue.length; head++) {
        const [board, path] = queue[head];
        if (board === "111111111") {
          path.forEach(select);
          break;
        }
        for (let i = 0; i < 9; i++) {
          const next = toggleLights(board.split(""), i).join("");
          if (!seen.has(next)) {
            seen.add(next);
            queue.push([next, [...path, i]]);
          }
        }
      }
      break;
    }
    case "slide-rush": {
      const target = "12345678_",
        queue: [string, number[]][] = [
          [s.board.map((x) => x || "_").join(""), []],
        ],
        seen = new Set<string>([queue[0][0]]);
      for (let head = 0; head < queue.length; head++) {
        const [board, path] = queue[head];
        if (board === target) {
          path.forEach(select);
          break;
        }
        const empty = board.indexOf("_");
        for (let i = 0; i < 9; i++) {
          if (
            Math.abs(Math.floor(empty / 3) - Math.floor(i / 3)) +
              Math.abs((empty % 3) - (i % 3)) !==
            1
          )
            continue;
          const chars = board.split("");
          [chars[i], chars[empty]] = [chars[empty], chars[i]];
          const next = chars.join("");
          if (!seen.has(next)) {
            seen.add(next);
            queue.push([next, [...path, i]]);
          }
        }
      }
      break;
    }
  }
  if (s.status !== "won")
    throw new Error(`${slug} fixture did not finish: ${JSON.stringify(s)}`);
  return actions;
}
