// Build once in the analysis worker. Rendering only searches small checkpoints.
export function buildLiveStats(stats, players) {
  if (!stats || players.length !== 2) return null;
  return players.map(({ playerIndex }) => {
    // Match slippi-js overall: conversions are stored against the victim,
    // while kill credit and move damage have their own attacker attribution.
    const conversions = stats.conversions.filter(c => c.playerIndex !== playerIndex);
    const events = conversions.flatMap(c => [
      { frame: c.startFrame, active: 1 },
      ...(Number.isFinite(c.endFrame) ? [{ frame: c.endFrame, active: -1, openings: 1,
        kills: Number(c.didKill && c.lastHitBy === playerIndex),
        damage: c.moves.reduce((sum, m) => sum + (m.playerIndex === playerIndex ? m.damage : 0), 0) }] : []),
    ]).sort((a, b) => a.frame - b.frame);
    let active = 0, openings = 0, kills = 0, damage = 0;
    const checkpoints = events.map(event => {
      active += event.active; openings += event.openings || 0;
      kills += event.kills || 0; damage += event.damage || 0;
      return { frame: event.frame, active, openings, kills, damage };
    });
    const combos = stats.combos.filter(c => Number.isFinite(c.endFrame) && c.moves[0]?.playerIndex === playerIndex);
    const largestCombo = combos.length ? Math.max(...combos.map(c => Math.max(0, c.endPercent - c.startPercent))) : null;
    return { index: playerIndex, checkpoints, summary: { openings, kills, damage, largestCombo,
      incomplete: !stats.gameComplete || conversions.some(c => !Number.isFinite(c.endFrame)) } };
  });
}

export function statsAtFrame(checkpoints, frame) {
  let low = 0, high = checkpoints.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (checkpoints[mid].frame <= frame) low = mid + 1;
    else high = mid;
  }
  return checkpoints[low - 1] || { active: 0, openings: 0, kills: 0, damage: 0 };
}

export const statRatio = (count, total) => total > 0 && Number.isFinite(count / total) ? (count / total).toFixed(1) : '—';
