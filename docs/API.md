# API and data contracts

All modules are ESM. The main entry point is `src/index.mjs`. Only
`src/overlay.mjs` requires a DOM, and only when `createOverlay` is called.

## analyzeReplay(blob, progress?)

Async; takes a browser File/Blob or Node Blob. Rejects unsupported/corrupt input
or controller history exceeding the configured cap. Progress receives
`analysisReadBytes`, `analysisInputBytes`, `analysisRetainedFrames`, and `analysisFrame`.

Returns:

- `first`, `last`: inclusive Slippi frame bounds.
- `stride`: 12 float entries per player per frame.
- `players`: `index` (0-based Slippi player index), `port` (1-based), `name`,
  `character`, `characterId` (external character ID), `inputs` (Float32Array),
  `techniques`, `defense`, `defenseCombos`, and `overall`.
- `combos`, `kos`, `liveStats`: optional useful statistics used by the original
  viewer. The overlay's detection does not depend on a database or Elo.

At `(frame - first) * stride`, the packed input row contains:

| Offset | Value |
| --- | --- |
| 0 | Frame inputs available (1/0) |
| 1, 2 | Main stick X, Y |
| 3, 4 | C-stick X, Y |
| 5 | Physical button bitmask |
| 6, 7 | Physical L, R analog triggers |
| 8 | Percent |
| 9 | Stocks remaining |
| 10 | Position X (NaN if absent) |
| 11 | Receiving-combo eligibility (1/0) |

Technique events: `{frame, label, category, inputs, endFrame?}`. Category is
`movement`, `offense`, or `defense`; input tokens are strings such as `B`, `R`,
`◉ ↘`, `C ←`. `endFrame` is exclusive. `techniqueAt(events, frame)` selects the
latest event at or before the frame and enforces its expiry. Keep events sorted.

`overlayAt(analysis, frame)` returns an array of `{index, port, name, technique,
inputs, defense, defenseInputs}`. Out-of-range/noninteger frames return `[]`.
Missing labels are empty strings. This view model also prevents an older
attack from covering newer defensive information.

## Defense helpers

`createDefenseInputDetector()` returns `{events, push(frame, entry, attackerPost)}`.
Each entry has `pre` and `post` as in slippi-js. The attacker is the other
fighter's post-frame object, or null when unknown.

`buildDefenseCombos(combos, victimIndex, lastFrame)` converts slippi-js combo
windows into `{frame, endFrame, attacker}`. slippi-js's combo playerIndex is
**the victim**, not the attacker.

`liveDefenseAt(player, players, frame, first, stride)` reads the packed frame,
checks the recipient's current eligibility plus combo window, and returns
`{frame, diDirection, stickX, stickY, sdiInputs}` or null. Neutral/offense
frames are ineligible even when statistical combo grace windows remain open.
`defenseLabel(event)` formats the display and omits zero SDI.

## Extension boundaries

- Add standard action-state rules in `techniques.mjs`.
- Add internal-character-specific special state ranges in `special-moves.mjs`.
  Do not confuse external character IDs with `post.internalCharacterId`.
- Add recorded field extraction / raw flags in `stream-analysis.mjs`.
- Keep display selection in `overlayAt`; keep DOM and asset choices in
  `overlay.mjs`. No network requests belong in these modules.
- Integrators should preserve user preferences using stable account/player
  identity when available. Ports can change across games. The library does not
  assume identity from character or Elo, and does not maintain global settings.
