import { SlpStream, SlpStreamEvent, SlpStreamMode, SlpParser, SlpParserEvent,
  ComboComputer, ConversionComputer, InputComputer, StockComputer,
  generateOverallStats, characters, moves } from '@slippi/slippi-js';
import { createDefenseInputDetector, buildDefenseCombos, isReceivingCombo } from './defense-inputs.mjs';
import { createTechniqueDetector } from './techniques.mjs';
import { buildLiveStats } from './live-stats-model.mjs';

const STRIDE = 12, CHUNK_FRAMES = 1024, READ_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 32 * 1024 * 1024;

// Keep rollback candidates in SlpParser, but retire finalized object graphs.
// The four stat computers used by the viewer need only the previous frame.
// Controller history uses packed floats rather than Slippi's full frame tree.
export async function analyzeReplay(blob, progress = () => {}) {
  const parser = new SlpParser();
  const stream = new SlpStream({ mode: SlpStreamMode.MANUAL });
  const combo = new ComboComputer(), conversion = new ConversionComputer();
  const input = new InputComputer(), stock = new StockComputer();
  const computers = [combo, conversion, input, stock];
  const chunks = new Map(), techniques = new Map(), defense = new Map();
  let settings, first, last, previous, finalized, inputBytes = 0, peakRetainedFrames = 0;
  let statsBlocked = false, previousItems = new Set();
  parser.on(SlpParserEvent.SETTINGS, value => {
    settings = value;
    for (const computer of computers) computer.setup(settings);
    for (const p of settings.players) { chunks.set(p.playerIndex, []); techniques.set(p.playerIndex, createTechniqueDetector()); defense.set(p.playerIndex, createDefenseInputDetector()); }
  });
  function capture(frame, confirmed = true) {
    first ??= frame.frame;
    last = Math.max(last ?? first, frame.frame);
    const offset = frame.frame - first;
    if (!Number.isSafeInteger(offset) || offset < 0 ||
        (offset + 1) * STRIDE * 4 * settings.players.length > MAX_INPUT_BYTES)
      throw new Error('Replay analysis exceeds the controller history limit.');
    const newItems = confirmed ? (frame.items || []).filter(item => !previousItems.has(item.spawnId)) : [];
    if (confirmed) previousItems = new Set((frame.items || []).map(item => item.spawnId));
    for (const p of settings.players) {
      const entry = frame.players?.[p.playerIndex];
      if (confirmed) {
        techniques.get(p.playerIndex).push(frame.frame, entry, newItems.filter(item => item.owner === p.playerIndex));
        const attackerIndex = entry?.post?.lastHitBy;
        const attacker = attackerIndex !== p.playerIndex ? frame.players?.[attackerIndex]?.post : null;
        defense.get(p.playerIndex).push(frame.frame, entry, attacker);
      }
      if (!entry?.pre) continue;
      const list = chunks.get(p.playerIndex), index = Math.floor(offset / CHUNK_FRAMES);
      if (!list[index]) { list[index] = new Float32Array(CHUNK_FRAMES * STRIDE); inputBytes += list[index].byteLength; }
      const pre = entry.pre, post = entry.post;
      list[index].set([1, pre.joystickX || 0, pre.joystickY || 0, pre.cStickX || 0, pre.cStickY || 0,
        pre.physicalButtons ?? pre.buttons ?? 0, pre.physicalLTrigger || 0, pre.physicalRTrigger || 0,
        post?.percent || 0, post?.stocksRemaining || 0, post?.positionX ?? NaN, Number(isReceivingCombo(post))], offset % CHUNK_FRAMES * STRIDE);
    }
  }
  parser.on(SlpParserEvent.FINALIZED_FRAME, frame => {
    capture(frame);
    // Match Stats.process(): incomplete input stops subsequent stat processing.
    if (!settings.players.every(p => frame.players?.[p.playerIndex]?.post)) statsBlocked = true;
    if (!statsBlocked) {
      const history = { [frame.frame]: frame };
      if (previous) history[previous.frame] = previous;
      for (const computer of computers) computer.processFrame(frame, history);
    }
    previous = frame; finalized = frame.frame;
    delete parser.getFrames()[frame.frame];
    delete parser.getRollbackFrames().frames[frame.frame];
  });
  // slippi-js omits state flags from its parsed post-frame object. Read the
  // documented hitstun bit from RAW immediately before its matching COMMAND;
  // attach it to that frame so normal rollback/finalization rules still apply.
  let rawHitstun, rawFastfall;
  stream.on(SlpStreamEvent.RAW, ({command, payload}) => {
    if (command === 0x38) {
      rawHitstun = payload.length > 0x29 ? Boolean(payload[0x29] & 0x02) : undefined;
      rawFastfall = payload.length > 0x27 ? Boolean(payload[0x27] & 0x08) : undefined;
    }
  });
  stream.on(SlpStreamEvent.COMMAND, ({ command, payload }) => {
    if (command === 0x38) {
      payload.isInHitstun = rawHitstun;
      payload.isFastfalling = rawFastfall;
    }
    parser.handleCommand(command, payload);
    // Missing/invalid bookends must not turn a corrupt replay into an
    // unbounded frame cache. Normal rollback retains at most eight frames.
    const retained = Object.keys(parser.getFrames()).length;
    peakRetainedFrames = Math.max(peakRetainedFrames, retained);
    if (retained > 120) throw new Error('Replay analysis has too many unfinalized frames.');
  });
  const header = new Uint8Array(await blob.slice(0, 15).arrayBuffer());
  const wrapped = [0x7b,0x55,3,0x72,0x61,0x77,0x5b,0x24,0x55,0x23,0x6c].every((v,i) => header[i] === v);
  let start = wrapped ? 15 : 0, end = blob.size;
  if (wrapped) {
    const length = new DataView(header.buffer).getUint32(11);
    if (length) end = Math.min(end, start + length);
  } else if (header[0] === 0x36) {
    // Pre-message-table recordings use the same fixed sizes as slippi-js.
    stream.process(new Uint8Array([0x35,13,0x36,1,0x40,0x37,0,6,0x38,0,0x46,0x39,0,1]));
  } else if (header[0] !== 0x35) throw new Error('Replay has no analysis frames.');
  // Include the complete size table in the first chunk. Each read yields to
  // cancellation and other browser work; no full replay ArrayBuffer is needed.
  for (let offset = start; offset < end && !parser.getGameEnd(); offset += READ_BYTES) {
    stream.process(new Uint8Array(await blob.slice(offset, Math.min(end, offset + READ_BYTES)).arrayBuffer()));
    progress({ analysisReadBytes: Math.min(end, offset + READ_BYTES) - start,
      analysisInputBytes: inputBytes, analysisRetainedFrames: peakRetainedFrames, analysisFrame: last ?? -123 });
  }
  if (!settings) throw new Error('Replay has no analysis frames.');
  // Preserve controller inputs from incomplete recordings, without treating
  // unfinalized frames as completed stats or manufacturing a game-end event.
  for (const frame of Object.values(parser.getFrames()).sort((a,b) => a.frame - b.frame))
    if (finalized == null || frame.frame > finalized) capture(frame, false);
  if (first == null) throw new Error('Replay has no analysis frames.');
  const stats = { conversions: conversion.fetch(), combos: combo.fetch(), stocks: stock.fetch(),
    gameComplete: Boolean(parser.getGameEnd()) };
  const overall = generateOverallStats({ settings, inputs: input.fetch(), conversions: stats.conversions,
    playableFrameCount: parser.getPlayableFrameCount() });
  const players = settings.players.map(p => {
    const inputs = new Float32Array((last - first + 1) * STRIDE);
    const list = chunks.get(p.playerIndex);
    for (let i = 0; i < list.length; i++) if (list[i]) {
      inputs.set(list[i].subarray(0, Math.min(list[i].length, inputs.length - i * CHUNK_FRAMES * STRIDE)), i * CHUNK_FRAMES * STRIDE);
      list[i] = null;
    }
    return { index: p.playerIndex, port: p.port, hasReplayName: Boolean(p.displayName || p.nametag),
      name: p.displayName || p.nametag || `Port ${p.port}`, character: characters.getCharacterName(p.characterId),
      characterId: p.characterId, inputs, techniques: techniques.get(p.playerIndex).events, defense: defense.get(p.playerIndex).events, defenseCombos: buildDefenseCombos(stats.combos, p.playerIndex, last), overall: overall.find(o => o.playerIndex === p.playerIndex) };
  });
  const combos = stats.combos.filter(c => c.moves.length).map(c => ({ start: c.startFrame, end: c.endFrame ?? last,
    player: c.moves[0].playerIndex, damage: Math.max(0, (c.endPercent ?? c.currentPercent) - c.startPercent),
    kill: c.didKill, opener: moves.getMoveName(c.moves[0].moveId), hits: c.moves.reduce((n,m) => n + m.hitCount, 0) })).sort((a,b) => b.damage - a.damage);
  const kos = [...new Set(stats.stocks.filter(s => s.endFrame != null && s.deathAnimation != null).map(s => s.endFrame))].sort((a,b) => a-b);
  return { first, last, stride: STRIDE, players, combos, kos, liveStats: buildLiveStats(stats, settings.players) };
}
