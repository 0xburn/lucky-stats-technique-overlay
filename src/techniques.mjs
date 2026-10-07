import { specialMove } from './special-moves.mjs';

// Common Melee action states, as exposed by slippi-js State. Character-specific
// states must be gated by the in-game (internal) character, including transforms.
const actions = new Map([
  [20, ['Dash', 'movement']], [25, ['Jump', 'movement']], [26, ['Jump', 'movement']],
  [27, ['Double jump', 'movement']], [28, ['Double jump', 'movement']],
  [44, ['Jab', 'offense']], [45, ['Jab', 'offense']], [46, ['Jab', 'offense']],
  [47, ['Rapid jab', 'offense']], [50, ['Dash attack', 'offense']],
  [56, ['Up tilt', 'offense']], [57, ['Down tilt', 'offense']],
  [63, ['Up smash', 'offense']], [64, ['Down smash', 'offense']],
  ...['Neutral air', 'Forward air', 'Back air', 'Up air', 'Down air'].map((s,i) => [65+i, [s, 'offense']]),
  [178, ['Shield', 'defense']], [179, ['Shield', 'defense']], [180, ['Shield hit', 'defense']],
  [199, ['Tech in place', 'defense']], [200, ['Tech roll forward', 'defense']],
  [201, ['Tech roll back', 'defense']], [202, ['Wall tech', 'defense']],
  [203, ['Wall jump tech', 'defense']], [204, ['Ceiling tech', 'defense']],
  [212, ['Grab', 'offense']], [214, ['Dash grab', 'offense']], [217, ['Pummel', 'offense']],
  [219, ['Forward throw', 'offense']], [220, ['Back throw', 'offense']],
  [221, ['Up throw', 'offense']], [222, ['Down throw', 'offense']],
  [233, ['Roll forward', 'defense']], [234, ['Roll back', 'defense']],
  [235, ['Spot dodge', 'defense']], [236, ['Air dodge', 'defense']],
  [252, ['Ledge grab', 'movement']],
]);
for (let s = 51; s <= 55; s++) actions.set(s, ['Forward tilt', 'offense']);
for (let s = 58; s <= 62; s++) actions.set(s, ['Forward smash', 'offense']);

export function inputTokens(pre = {}) {
  const direction = (x = 0, y = 0) => {
    const h = Math.abs(x) >= .3 ? Math.sign(x) : 0, v = Math.abs(y) >= .3 ? Math.sign(y) : 0;
    return ({ '0,1':'↑', '1,1':'↗', '1,0':'→', '1,-1':'↘', '0,-1':'↓', '-1,-1':'↙', '-1,0':'←', '-1,1':'↖' })[`${h},${v}`];
  };
  const tokens = [], stick = direction(pre.joystickX, pre.joystickY), c = direction(pre.cStickX, pre.cStickY);
  if (stick) tokens.push(`◉ ${stick}`);
  if (c) tokens.push(`C ${c}`);
  const buttons = pre.physicalButtons ?? pre.buttons ?? 0;
  for (const [mask, name] of [[0x100,'A'],[0x200,'B'],[0x400,'X'],[0x800,'Y'],[0x10,'Z']])
    if (buttons & mask) tokens.push(name);
  if ((buttons & 0x40) || pre.physicalLTrigger > .3) tokens.push('L');
  if ((buttons & 0x20) || pre.physicalRTrigger > .3) tokens.push('R');
  return tokens;
}

// Streaming, finalized frames only. Retain a small history, not a second frame tree.
export function createTechniqueDetector() {
  let history = [], airborneLasers = 0, activeAttack, activeFastfall;
  const events = [];
  return { events, push(frame, entry, newItems = []) {
    if (!entry?.post || !entry?.pre || history.at(-1)?.frame !== frame - 1) {
      const end = (history.at(-1)?.frame ?? frame - 1) + 1;
      if (activeAttack) activeAttack.event.endFrame = end;
      if (activeFastfall) activeFastfall.endFrame = end;
      activeAttack = activeFastfall = null;
      history = []; airborneLasers = 0;
      if (!entry?.post || !entry?.pre) return;
    }
    const { pre, post } = entry, state = post.actionStateId;
    const prev = history.at(-1), old = prev?.post.actionStateId;
    if (activeFastfall && post.isFastfalling !== true) {
      activeFastfall.endFrame = frame;
      activeFastfall = null;
    }
    if (activeAttack && (post.internalCharacterId !== activeAttack.character ||
      (state !== activeAttack.state && (!activeAttack.special || specialMove(post.internalCharacterId, state) !== activeAttack.special)))) {
      activeAttack.event.endFrame = frame;
      activeAttack = null;
    }
    const changed = prev && (state !== old || (post.actionStateCounter < prev.post.actionStateCounter));
    let action = changed ? actions.get(state) : null;
    let inputs = pre;
    if (changed && state === 179 && old === 178) action = null;
    // Fox (internal 1) and Falco (internal 22) share reflector states.
    const spacie = [1, 22].includes(post.internalCharacterId);
    const shine = s => s >= 360 && s <= 369;
    const special = specialMove(post.internalCharacterId, state);
    if (changed && special && (special !== specialMove(prev.post.internalCharacterId, old) ||
      (state === old && post.actionStateCounter < prev.post.actionStateCounter))) {
      action = [spacie && special === 'Neutral-B' ? 'Laser' : special, 'offense'];
    }
    // Projectile spawn IDs count real shots, never repeated/held B inputs.
    // Fox/Falco lasers are item kinds 54/55 (melee/it/forward.h).
    if (!post.isAirborne) airborneLasers = 0;
    const lasers = spacie ? newItems.filter(item => item.typeId === (post.internalCharacterId === 1 ? 54 : 55)) : [];
    if (lasers.length) {
      if (post.isAirborne) airborneLasers += lasers.length;
      action = [airborneLasers === 2 ? 'Double Laser' : 'Laser', 'offense'];
      inputs = history.findLast(x => (x.pre.physicalButtons ?? x.pre.buttons ?? 0) & 0x200)?.pre ?? pre;
    }
    if (changed && state === 24 && spacie && shine(old)) action = ['Jump cancel', 'movement'];
    if (changed && [25,26].includes(state)) {
      const knee = history.findLastIndex(x => x.post.actionStateId === 24);
      if (knee >= 0) {
        let start = knee;
        while (start > 0 && history[start - 1].post.actionStateId === 24) start--;
        if (history[start - 1]?.post.actionStateId === 20) action = ['Dash jump', 'movement'];
        inputs = history[start].pre;
      }
    }
    if (changed && state === 43 && old === 236) {
      const dodge = history.findLastIndex(x => x.post.actionStateId !== 236) + 1;
      inputs = history[dodge]?.pre ?? pre;
      const knee = history.findLast(x => x.post.actionStateId === 24);
      const sameHeight = knee && Number.isFinite(post.positionY) && Number.isFinite(knee.post.positionY)
        && Math.abs(post.positionY - knee.post.positionY) < .1;
      action = [sameHeight ? 'Wavedash' : 'Waveland', 'movement'];
    }
    if (state >= 70 && state <= 74 && [1,2].includes(post.lCancelStatus)
      && (changed || post.lCancelStatus !== prev?.post.lCancelStatus)) {
      action = [post.lCancelStatus === 1 ? 'L-cancel' : 'Missed L-cancel', 'movement'];
      inputs = history.slice(-7).findLast(x => inputTokens(x.pre).some(t => ['L','R','Z'].includes(t)))?.pre ?? pre;
    }
    if (changed && state === 42 && old >= 65 && old <= 69 && !post.lCancelStatus) {
      action = ['Auto-cancel', 'movement'];
    }
    if (action) {
      const event = { frame, label: action[0], category: action[1], inputs: inputTokens(inputs) };
      events.push(event);
      if (action[1] === 'offense') activeAttack = { event, state, special, character: post.internalCharacterId };
    }
    // The engine flag distinguishes a fast fall from merely holding down.
    if (prev && post.isFastfalling === true && prev.post.isFastfalling === false) {
      activeFastfall = { frame, label: 'Fast fall', category: 'movement', inputs: inputTokens(pre) };
      events.push(activeFastfall);
    }
    history.push({ frame, pre, post });
    if (history.length > 20) history.shift();
  } };
}

// Seeking is independent of playback order; labels expire after 30 game frames.
export function techniqueAt(events = [], frame) {
  let lo = 0, hi = events.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (events[mid].frame <= frame) lo = mid + 1; else hi = mid; }
  const event = events[lo - 1];
  return event && frame - event.frame < 30 && (event.endFrame == null || frame < event.endFrame) ? event : null;
}
