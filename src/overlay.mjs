import { overlayAt } from './index.mjs';
/** Mount in a position:relative video wrapper or a transparent OBS page. */
export function createOverlay(container, { enabled = () => true, renderInputs } = {}) {
  const root = document.createElement('div');
  root.className = 'lst-overlay';
  container.append(root);
  let disposed = false;
  const inputText = (element, tokens) => {
    if (renderInputs) renderInputs(element, tokens);
    else element.textContent = tokens.join(' ');
  };
  return {
    render(analysis, frame) {
      if (disposed) throw new Error('Overlay has been destroyed.');
      const rows = overlayAt(analysis, frame).filter(p => enabled(p) && (p.technique || p.defense));
      root.replaceChildren(...rows.map(p => {
        const row = document.createElement('section');
        row.className = 'lst-player'; row.dataset.port = p.port;
        const name = document.createElement('small'); name.textContent = p.name;
        const technique = document.createElement('strong'); technique.textContent = p.technique;
        const inputs = document.createElement('span'); inputs.className = 'lst-inputs'; inputText(inputs, p.inputs);
        const defense = document.createElement('div'); defense.className = 'lst-defense'; defense.textContent = p.defense;
        const defenseInputs = document.createElement('span'); defenseInputs.className = 'lst-inputs'; inputText(defenseInputs, p.defenseInputs);
        defense.append(defenseInputs); row.append(name, technique, inputs, defense);
        return row;
      }));
    },
    clear() { root.replaceChildren(); },
    destroy() { root.remove(); disposed = true; },
  };
}
