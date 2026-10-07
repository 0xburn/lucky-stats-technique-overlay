export { analyzeReplay } from './stream-analysis.mjs';
export { createTechniqueDetector, techniqueAt, inputTokens } from './techniques.mjs';
export { createDefenseInputDetector, buildDefenseCombos, liveDefenseAt, defenseLabel, isReceivingCombo, sdiInput, diDirection } from './defense-inputs.mjs';
export { specialMove } from './special-moves.mjs';

import { techniqueAt, inputTokens } from './techniques.mjs';
import { liveDefenseAt, defenseLabel } from './defense-inputs.mjs';
/** Pure, seek-safe view model. `frame` is the exact Slippi game frame. */
export function overlayAt(analysis, frame) {
  if (!Number.isInteger(frame) || frame < analysis.first || frame > analysis.last) return [];
  return analysis.players.map(player => {
    const defense = liveDefenseAt(player, analysis.players, frame, analysis.first, analysis.stride);
    const candidate = techniqueAt(player.techniques, frame);
    const technique = candidate && (!defense || candidate.frame >= defense.frame) ? candidate : null;
    return { index: player.index, port: player.port, name: player.name,
      technique: technique?.label ?? '', inputs: technique?.inputs ?? [],
      defense: defenseLabel(defense),
      defenseInputs: defense ? inputTokens({joystickX: defense.stickX, joystickY: defense.stickY}) : [] };
  });
}
