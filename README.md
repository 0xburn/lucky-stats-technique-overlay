# Lucky Stats Technique Overlay

Melee technique detection and a reusable browser overlay for Slippi replays.
Created by **[Lucky 7s Melee LLC · LuckyStats.gg](https://LuckyStats.gg)**.
MIT licensed: use it, modify it, ship your own tools, or build commercial apps.

**This package displays labels and inputs. It does not render Melee.** Supply
your own replay renderer or gameplay video and synchronize by Slippi frame.
The included demo previews labels on a plain background.

## Run the demo

Requires Node.js **22.18+** (or Node 24) and npm.

```sh
git clone https://github.com/0xburn/lucky-stats-technique-overlay.git
cd lucky-stats-technique-overlay
npm ci
npm run dev
```

Open the local URL printed by Vite and choose a `.slp` file. Scrub by frame,
play the timeline, toggle players, or export technique events as JSON.
Replay processing runs in a Web Worker in your browser; there is no upload API.
Both players are initially enabled. The demo resets choices when a new file
is opened; an integrating app can preserve choices using stable player IDs.

```sh
npm test
npm run build
```

The build writes the static demo to `dist/`. Serve that directory with any
static HTTP server. It is an overlay inspector, not a gameplay viewer.

## Use in another app

This is a source release, not an npm-registry publication. Install from GitHub
(pin a commit for reproducibility), use a local checkout, or copy the MIT source:

```sh
npm install github:0xburn/lucky-stats-technique-overlay
```

```js
import { analyzeReplay, overlayAt } from 'lucky-stats-technique-overlay';

// Browser File/Blob, or Node: new Blob([await readFile('game.slp')]).
const analysis = await analyzeReplay(file);
const players = overlayAt(analysis, 540);
console.log(players); // per-player technique, input tokens, and defensive input labels
```

Run `analyzeReplay` in a worker for large files. See `demo/worker.mjs` for
transferring the packed input buffers back without copying them.

### Mount the browser overlay

```js
import { createOverlay } from 'lucky-stats-technique-overlay/overlay';
import 'lucky-stats-technique-overlay/overlay.css';

const hiddenPlayers = new Set();
const overlay = createOverlay(document.querySelector('#video-wrapper'), {
  enabled: player => !hiddenPlayers.has(player.index),
});

// The wrapper must have position:relative and a width/height.
// Call whenever your renderer presents a frame, including seeks/backward steps.
function onReplayFrame(frame) {
  overlay.render(analysis, frame);
}

// When unmounting:
// overlay.destroy();
```

`createOverlay` exposes `render(analysis, frame)`, `clear()`, and `destroy()`.
It owns only the child element it creates. Player names are assigned through
`textContent`, not interpreted as HTML. Override `.lst-*` CSS classes to change
placement and appearance. An optional `renderInputs(element, tokens)` callback
can replace text symbols with your own icons; replace the element's children
on every callback and do not interpret replay names as HTML.

### Frame synchronization

Use exact integer Slippi frames where possible. `analysis.first` is typically
negative (the pre-game countdown); **frame 0 is not necessarily video time 0**.
For a video with a known alignment:

```js
const frame = Math.round(video.currentTime * 60) + frameAtVideoTimeZero;
overlay.render(analysis, frame);
```

Calibrate the offset against the same recording. Edited footage, dropped
frames, and speed changes need an explicit time-to-frame mapping. The demo's
wall-clock player is a preview, not a live gameplay synchronization mechanism.

### Streaming / live integrations

The detectors accept finalized frames incrementally. This repository does not
include a Dolphin hook, a live Slippi file tailer, controller capture, an OBS
plugin, or a network transport. Those are integration points for your app.
Controller buttons alone cannot confirm that a move executed.

```js
import { createTechniqueDetector, techniqueAt } from 'lucky-stats-technique-overlay';
const detector = createTechniqueDetector(); // one per player

// Call once per finalized frame, in increasing order.
detector.push(frame, { pre, post }, newOwnedProjectiles);
const technique = techniqueAt(detector.events, frame);
```

`pre` and `post` follow slippi-js frame shapes. Attach `post.isFastfalling` and
`post.isInHitstun` from the raw post-frame flags as shown in `src/stream-analysis.mjs`.
They are not supplied by slippi-js 9.1.2's parsed object. `newOwnedProjectiles`
contains only newly spawned items owned by this player, deduplicated by spawn
ID. See the replay adapter for rollback finalization and item ownership.
Rebuild a detector after rewinding finalized history; do not feed rollback
candidates directly. Event histories grow with a session: segment/reset them
for indefinitely running live feeds. An attack's `endFrame` can be filled in
by a later frame, so a live client must observe updates as well as new events.

For defense, `createDefenseInputDetector().push(frame, entry, attackerPost)`
records hitlag SDI estimates and launch observations. `liveDefenseAt` additionally
uses victim combo windows and packed current-frame inputs to produce the
on-screen DI label. See [the API notes](docs/API.md).

## What is detected

- Common aerials, ground attacks, grabs, throws, shields, rolls, and techs.
- Dash, jumps, jump-cancel out of Fox/Falco reflector, wavedash/waveland.
- L-cancel / missed L-cancel from the recorded status, plus aerial autocancel.
- Fast fall from the engine flag transition, not a downward stick guess.
- Character-specific Neutral-B, Side-B, Up-B, Down-B state groups.
- Fox/Falco Laser; Double Laser when a second owned laser spawns in one airtime.
- Current DI input while receiving a combo and estimated SDI inputs during hitlag.

Attack labels stop when the attack is interrupted or leaves its state group.
Seeking is deterministic; expired labels do not revive after a defensive label
clears. Most labels expire after 30 game frames even if the move continues.

## Accuracy and limitations

- DI in/out describes current stick direction relative to the attacker. It does
  not prove the resulting launch angle or whether that DI was optimal.
- `SDI ~N` is an input estimate, not engine-confirmed displacement. Zero is hidden;
  C-stick ASDI and held stick directions are not counted as SDI inputs.
- Double Laser depends on projectile/owner telemetry. Older recordings may
  lack it. Fast fall requires state flags. Missing data is not guessed.
- Autocancel is detected from a standard aerial transitioning to normal landing;
  unusual character-specific states need separate rules.
- State mappings target standard Melee. Mods and custom characters require
  explicit mappings. This is not an exhaustive technique classifier (for example,
  short-hop/full-hop discrimination is not implemented).
- Replay analysis is capped at 32 MiB of packed controller history and rejects
  more than 120 unfinalized frames. The retained analysis includes event lists
  and stats in addition to that controller buffer.

## Contributing

Read [AGENTS.md](AGENTS.md) for the module map and rules for developers/agents.
Add synthetic regression fixtures for detector changes, run tests and the
browser demo build, and document any new telemetry requirements. Do not commit
private replays. See [NOTICE.md](NOTICE.md) for attribution and dependency licenses.
