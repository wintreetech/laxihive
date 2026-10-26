import { test } from "node:test";
import assert from "node:assert/strict";
import { games } from "./catalog.js";
import {
  createGame,
  replay,
  act,
  feedback,
  hexAdjacent,
  scoreFor,
  campaignSeed,
} from "./engine.js";
import { solve } from "./solve.fixture.js";
for (const game of games)
  test(`${game.name}: generated challenge is playable and replay-verifiable`, () => {
    for (const seed of [1, 42, 20261026]) {
      const moves = solve(game.slug, seed);
      const result = replay(game.slug, seed, "starter", moves);
      assert.equal(result.status, "won");
      assert.ok(result.score >= 100);
      assert.deepEqual(replay(game.slug, seed, "starter", moves), result);
    }
  });
test("Word Guess handles duplicate letters without overcounting", () =>
  assert.deepEqual(feedback("EERIE", "SHEEP"), [
    "present",
    "present",
    "absent",
    "absent",
    "absent",
  ]));
test("Hive Quest rejects nonadjacent paths", () => {
  const s = createGame("hive-quest", 42);
  const other = s.board.findIndex((_, i) => i !== 0 && !hexAdjacent(0, i));
  const next = act(act(s, { type: "select", value: 0 }), {
    type: "select",
    value: other,
  });
  assert.deepEqual(next.selected, [0]);
});
test("Orbit Recall ends on an incorrect sequence", () => {
  const s = createGame("orbit-recall", 42);
  assert.equal(
    act(s, { type: "select", value: (s.sequence[0] + 1) % 9 }).status,
    "lost",
  );
});
test("Sliding tiles reject nonadjacent moves", () => {
  const s = createGame("slide-rush", 42),
    empty = s.board.indexOf(""),
    other = s.board.findIndex(
      (_, i) =>
        Math.abs((i % 3) - (empty % 3)) +
          Math.abs(Math.floor(i / 3) - Math.floor(empty / 3)) >
        1,
    );
  assert.deepEqual(act(s, { type: "select", value: other }), s);
});
test("A finished challenge cannot award another score through extra moves", () => {
  const actions = solve("word-scramble");
  const won = replay("word-scramble", 42, "starter", actions);
  assert.deepEqual(act(won, { type: "submit", value: "OTHER" }), won);
});
test("Oversized replay is rejected", () =>
  assert.throws(() =>
    replay("number-rush", 1, "starter", Array(2001).fill({ type: "clear" })),
  ));
test("Every daily letter set has enough valid words and rotates deterministically", () => {
  for (let seed = 1; seed <= 7; seed++) {
    const s = createGame("daily-hive", seed);
    assert.ok(s.targets.length >= 12);
    assert.ok(
      s.targets.every(
        (w) =>
          w.includes(s.board[0]) &&
          w.split("").every((l) => s.board.includes(l)),
      ),
    );
    assert.equal(
      replay("daily-hive", seed, "starter", solve("daily-hive", seed)).status,
      "won",
    );
  }
  assert.notDeepEqual(
    createGame("daily-hive", 1).board,
    createGame("daily-hive", 2).board,
  );
});
test("Timed scores reward speed and remain bounded", () => {
  const won = replay("number-rush", 42, "starter", solve("number-rush", 42));
  assert.ok(scoreFor(won, 10) > scoreFor(won, 100));
  assert.equal(scoreFor(won, 100000), 100);
  assert.equal(scoreFor(createGame("number-rush", 42), 10), 0);
});
test("Campaign and advanced modes have distinct challenges", () => {
  assert.notEqual(campaignSeed(1), campaignSeed(2));
  assert.notEqual(campaignSeed(1), campaignSeed(1, "advanced"));
  assert.ok(
    createGame("hive-quest", 42, "advanced").target.length >
      createGame("hive-quest", 42).target.length,
  );
  assert.equal(createGame("word-blitz", 42, "advanced").extra.goal, 12);
  assert.equal(
    createGame("sequence-surge", 42, "advanced").extra.questions.length,
    8,
  );
});
