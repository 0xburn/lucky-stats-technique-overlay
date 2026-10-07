# Developer and agent instructions

This is a standalone library extracted from LuckyStats.gg, owned by Lucky 7s
Melee LLC. Preserve the MIT copyright and attribution. It does not render Melee.
Do not add Lucky Stats authentication, database, API routes, production config,
private replay files, Nintendo assets, or an emulator as implicit dependencies.

## Module map

- `src/techniques.mjs`: finalized-frame technique detector and label lifetime.
- `src/special-moves.mjs`: internal character/state mappings.
- `src/defense-inputs.mjs`: DI/SDI observation and victim-state gating.
- `src/stream-analysis.mjs`: Slippi parser, raw flags, bounded frame retention,
  projectile deduplication, and packed input history.
- `src/live-stats-model.mjs`: optional replay statistics checkpoints.
- `src/index.mjs`: public exports and pure `overlayAt` presentation model.
- `src/overlay.mjs`, `src/overlay.css`: generic DOM adapter and styles.
- `demo/`: local file picker, worker, frame timeline. No gameplay renderer.
- `test/`: synthetic fixtures and regression cases. No private SLP files.

## Before changing detection

1. Reproduce with exact frames and raw telemetry. Distinguish a missing event,
   wrong classification, stale label, and rendering/synchronization problem.
2. Base labels on executed states/flags, not just pressed buttons.
3. Feed only finalized frames to detectors; preserve rollback handling.
4. Expire interrupted attack labels so they cannot reappear after hitstun.
5. Keep SDI labeled as an estimate; do not claim accepted displacement.
6. Add synthetic regressions covering gaps, seek-back behavior, unknown data,
   and the affected character. Never copy users' full recordings into tests.

## Validate

Use Node >=22.18. Run `npm ci`, `npm test`, and `npm run build`. Exercise the
demo for UI changes: file load, player toggles, seek forward/backward, and mobile
widths. Do not claim live gameplay support unless an actual live adapter was
implemented and verified. See README and docs/API.md for API contracts.
