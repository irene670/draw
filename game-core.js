export const TARGET_CENTISECONDS = 730;
export const TARGET_SECONDS = "7.30";
export const TOTAL_ATTEMPTS = 3;

export function elapsedToCentiseconds(elapsedMilliseconds) {
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) return 0;
  return Math.round(elapsedMilliseconds / 10);
}

export function formatCentiseconds(centiseconds) {
  return (Math.max(0, centiseconds) / 100).toFixed(2);
}

export function judgeAttempt(centiseconds) {
  const difference = centiseconds - TARGET_CENTISECONDS;

  return {
    centiseconds,
    difference,
    isWinner: difference === 0,
    direction: difference === 0 ? "exact" : difference < 0 ? "early" : "late",
    distance: Math.abs(difference),
  };
}

export function bestAttempt(attempts) {
  if (!attempts.length) return null;
  return attempts.reduce((best, attempt) =>
    Math.abs(attempt.centiseconds - TARGET_CENTISECONDS) <
    Math.abs(best.centiseconds - TARGET_CENTISECONDS)
      ? attempt
      : best,
  );
}

export function resultMessage(result) {
  if (result.isWinner) return `完美命中 ${TARGET_SECONDS} 秒！`;
  const distance = formatCentiseconds(result.distance);
  return result.direction === "early"
    ? `太早了 ${distance} 秒`
    : `慢了 ${distance} 秒`;
}
