import test from "node:test";
import assert from "node:assert/strict";

import {
  TARGET_CENTISECONDS,
  TARGET_SECONDS,
  bestAttempt,
  elapsedToCentiseconds,
  formatCentiseconds,
  judgeAttempt,
  resultMessage,
} from "../game-core.js";

test("converts stopwatch milliseconds to the displayed hundredth", () => {
  assert.equal(elapsedToCentiseconds(7_295), 730);
  assert.equal(elapsedToCentiseconds(7_304), 730);
  assert.equal(elapsedToCentiseconds(7_305), 731);
});

test("only the displayed 7.30 seconds wins", () => {
  assert.equal(TARGET_SECONDS, "7.30");
  assert.equal(judgeAttempt(TARGET_CENTISECONDS).isWinner, true);
  assert.equal(judgeAttempt(729).isWinner, false);
  assert.equal(judgeAttempt(731).isWinner, false);
});

test("formats and explains early and late results", () => {
  assert.equal(formatCentiseconds(730), "7.30");
  assert.equal(resultMessage(judgeAttempt(722)), "太早了 0.08 秒");
  assert.equal(resultMessage(judgeAttempt(743)), "慢了 0.13 秒");
});

test("finds the attempt closest to 7.30 seconds", () => {
  const attempts = [judgeAttempt(681), judgeAttempt(754), judgeAttempt(734)];
  assert.equal(bestAttempt(attempts).centiseconds, 734);
  assert.equal(bestAttempt([]), null);
});
