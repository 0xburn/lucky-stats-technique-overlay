// Input observations, not a claim that DI changed the launch angle or that SDI
// displaced the fighter. Stage collisions and move-specific restrictions matter.
// Melee reads DI on exit from hitlag; it resets SDI timers on hit entry.
// Reference: doldecomp/melee src/melee/ft/kinds/ftCommon/ftCo_Damage.c
// (OnEveryHitlag, OnExitHitlag) and src/melee/ft/fighter.c (procInput).
const DEADZONE = .2875, SDI_MAGNITUDE = .7;
const damageState = state => state >= 75 && state <= 91 || state === 38;
const stick = pre => Number.isFinite(pre?.joystickX) && Number.isFinite(pre?.joystickY)
  ? { x: pre.joystickX, y: pre.joystickY } : null;
const axis = value => Math.abs(value) >= DEADZONE ? Math.sign(value) : 0;

// Estimate SDI inputs from fresh stick excursions in hitlag, once per frame.
// Replay telemetry omits the internal SDI timers; slow threshold crossings may
// be missed. Do not equate this estimate with the engine's accepted SDI count. Holding a direction,
// C-stick ASDI, and the initial hit/exit frames are deliberately not counted.
export function sdiInput(previous, current) {
  if (!previous || !current || Math.hypot(current.x, current.y) < SDI_MAGNITUDE) return false;
  const freshAxis = ['x', 'y'].some(key => axis(current[key]) !== 0 && axis(current[key]) !== axis(previous[key]));
  return freshAxis;
}

export function diDirection(input, towardAttacker) {
  if (!input) return null;
  const x = axis(input.x), y = axis(input.y);
  if (!x && !y) return 'neutral';
  if (!x) return y > 0 ? 'up' : 'down';
  if (!towardAttacker) return x > 0 ? 'right' : 'left';
  return x === towardAttacker ? 'in' : 'out';
}

export function createDefenseInputDetector() {
  let previous, hit;
  const events = [];
  function record(frame, pre, phase) {
    const direction = phase === 'launch' ? diDirection(stick(pre), hit.towardAttacker) : null;
    const event = { frame, phase, sdiInputs: hit.count, diDirection: direction,
      label: direction ? `DI ${direction}` : 'SDI', category: 'defense',
      stickX: pre.joystickX, stickY: pre.joystickY };
    const last = events.at(-1);
    if (phase === 'launch' || !last || last.frame < hit.start || last.sdiInputs !== event.sdiInputs)
      events.push(event);
  }
  return { events, push(frame, entry, attacker) {
    if (!entry?.pre || !entry?.post || !Number.isFinite(entry.post.hitlagRemaining) || !stick(entry.pre)) {
      previous = hit = undefined; return;
    }
    if (previous?.frame !== frame - 1) { previous = hit = undefined; }
    const {pre, post} = entry, lag = post.hitlagRemaining;
    const wasLag = previous?.post.hitlagRemaining > 0;
    const tookDamage = previous && Number.isFinite(post.percent) && Number.isFinite(previous.post.percent)
      && post.percent > previous.post.percent;
    if (lag > 0 && (!wasLag || tookDamage) && damageState(post.actionStateId) && tookDamage) {
      const dx = Number.isFinite(attacker?.positionX) && Number.isFinite(post.positionX)
        ? attacker.positionX - post.positionX : 0;
      hit = { start: frame, count: 0, towardAttacker: Math.abs(dx) > .01 ? Math.sign(dx) : 0 };
      record(frame, pre, 'hitlag');
    } else if (hit && lag > 0 && damageState(post.actionStateId)) {
      if (sdiInput(stick(previous?.pre), stick(pre))) hit.count++;
      record(frame, pre, 'hitlag');
    } else if (hit && wasLag && lag === 0 && damageState(post.actionStateId)) {
      record(frame, pre, 'launch'); hit = undefined;
    } else {
      hit = undefined;
      // Throws can launch without any hitlag/SDI opportunity. Read the release
      // frame's stick rather than silently omitting DI for those hits.
      const releasedThrow = previous?.post.actionStateId >= 239 && previous?.post.actionStateId <= 243;
      if (lag === 0 && previous?.post.hitlagRemaining === 0 && damageState(post.actionStateId)
        && (releasedThrow || (tookDamage && !damageState(previous.post.actionStateId)))) {
        const dx = Number.isFinite(attacker?.positionX) && Number.isFinite(post.positionX)
          ? attacker.positionX - post.positionX : 0;
        hit = {start: frame, count: 0, towardAttacker: Math.abs(dx) > .01 ? Math.sign(dx) : 0};
        record(frame, pre, 'launch'); hit = undefined;
      }
    }
    previous = {frame, pre, post};
  } };
}

// Combo statistics retain a grace window through neutral and counterattacks.
// Gate the overlay on the recipient's current state, not that window alone.
export function isReceivingCombo(post) {
  const state = post?.actionStateId;
  if (!Number.isInteger(state)) return false;
  const captured = state >= 223 && state <= 232 || state >= 239 && state <= 243
    || (state >= 266 && state <= 304 && state !== 293) || state >= 327 && state <= 338;
  if (captured) return true;
  if (!damageState(state) && state !== 185 && state !== 193) return false;
  if (post.hitlagRemaining > 0) return true;
  if (typeof post.isInHitstun === 'boolean') return post.isInHitstun;
  // Pre-2.0 recordings have no state flags. Restrict the fallback to damage
  // animations, where Misc AS is hitstun remaining (not an attack timer).
  return Number.isFinite(post.miscActionState) ? post.miscActionState > 0 : true;
}

// ComboComputer stores playerIndex as the victim. Preserve all combo windows,
// including grabs with no damage yet; DI display follows live inputs throughout.
export function buildDefenseCombos(combos, playerIndex, lastFrame) {
  return combos.filter(c => c.playerIndex === playerIndex)
    .map(c => ({frame: c.startFrame, endFrame: c.endFrame ?? lastFrame + 1,
      attacker: c.moves?.[0]?.playerIndex ?? c.lastHitBy}))
    .sort((a, b) => a.frame - b.frame);
}

function latestAt(events, frame) {
  let lo = 0, hi = events.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (events[mid].frame <= frame) lo = mid + 1; else hi = mid; }
  return events[lo - 1];
}

// This is the current DI input, including anticipation between hits, not the
// DI that determined the previous launch. Read packed inputs at the exact seek
// frame and compare current player positions so side switches remain correct.
export function liveDefenseAt(player, players, frame, first, stride) {
  const combo = latestAt(player.defenseCombos ?? [], frame);
  if (!combo || frame >= combo.endFrame) return null;
  const offset = (frame - first) * stride;
  const values = player.inputs;
  if (offset < 0 || offset + stride > values.length || !values[offset] || stride < 12 || values[offset + 11] !== 1) return null;
  const input = {x: values[offset + 1], y: values[offset + 2]};
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) return null;
  const attacker = players.find(p => p.index === combo.attacker);
  const opponentX = attacker?.inputs[offset] ? attacker.inputs[offset + 10] : NaN;
  const ownX = values[offset + 10];
  const dx = Number.isFinite(opponentX) && Number.isFinite(ownX) ? opponentX - ownX : 0;
  const hit = latestAt(player.defense ?? [], frame);
  return {frame: hit && hit.frame >= combo.frame ? hit.frame : combo.frame,
    diDirection: diDirection(input, Math.abs(dx) > .01 ? Math.sign(dx) : 0),
    stickX: input.x, stickY: input.y,
    sdiInputs: hit && hit.frame >= combo.frame ? hit.sdiInputs : 0};
}

export function defenseLabel(event) {
  if (!event) return '';
  const parts = [];
  if (event.diDirection) parts.push(`DI ${event.diDirection}`);
  if (event.sdiInputs > 0) parts.push(`SDI ~${event.sdiInputs} ${event.sdiInputs === 1 ? 'input' : 'inputs'}`);
  return parts.join(' · ');
}
