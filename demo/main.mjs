import { createOverlay } from '../src/overlay.mjs';
import '../src/overlay.css';
import './style.css';
const $ = id => document.getElementById(id);
const disabled = new Set();
const overlay = createOverlay($('preview'), { enabled: p => !disabled.has(p.index) });
let analysis, worker, frame, playing = false, previous, fraction = 0;
function paint() { if (!analysis) return; $('frame').value = $('seek').value = frame; overlay.render(analysis, frame); }
function stop() { playing = false; $('play').textContent = 'Play'; previous = undefined; fraction = 0; }
$('file').onchange = () => {
  worker?.terminate(); stop(); analysis = null; overlay.clear(); disabled.clear(); $('players').replaceChildren();
  for (const id of ['frame','seek','play','export']) $(id).disabled = true;
  const file = $('file').files[0]; if (!file) return;
  $('status').textContent = 'Analyzing replay…';
  worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
  worker.onerror = () => { $('status').textContent = 'Replay analysis failed.'; worker?.terminate(); };
  worker.onmessage = ({ data }) => {
    worker.terminate();
    if (data.error) { $('status').textContent = data.error; return; }
    analysis = data.result; frame = analysis.first;
    $('status').textContent = `${analysis.players.length} players · ${analysis.last - analysis.first + 1} frames`;
    for (const p of analysis.players) {
      const label = document.createElement('label'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = true;
      checkbox.onchange = () => { if (checkbox.checked) disabled.delete(p.index); else disabled.add(p.index); paint(); };
      label.append(checkbox, document.createTextNode(p.name)); $('players').append(label);
    }
    for (const id of ['frame','seek']) { $(id).min = analysis.first; $(id).max = analysis.last; }
    for (const id of ['frame','seek','play','export']) $(id).disabled = false;
    paint();
  };
  worker.postMessage(file);
};
for (const id of ['frame','seek']) $(id).oninput = event => {
  const value = Number(event.target.value); if (!Number.isFinite(value)) return;
  frame = Math.max(analysis.first, Math.min(analysis.last, Math.round(value))); stop(); paint();
};
$('play').onclick = () => { if (playing) stop(); else { if (frame === analysis.last) frame = analysis.first; playing = true; previous = undefined; $('play').textContent = 'Pause'; } };
$('export').onclick = () => {
  const result = { first: analysis.first, last: analysis.last, players: analysis.players.map(({index,port,name,techniques,defense}) => ({index,port,name,techniques,defense})) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)], { type:'application/json' }));
  const link = document.createElement('a'); link.href=url; link.download='techniques.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function tick(now) {
  if (playing && analysis) {
    fraction += previous == null ? 0 : Math.min(now - previous, 250) * .06 * Number($('speed').value);
    previous = now;
    const advance = Math.floor(fraction); fraction -= advance;
    if (advance) { frame = Math.min(analysis.last, frame + advance); paint(); if (frame === analysis.last) stop(); }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
