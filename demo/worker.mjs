import { analyzeReplay } from '../src/index.mjs';
self.onmessage = async ({ data: file }) => {
  try {
    const result = await analyzeReplay(file);
    self.postMessage({ result }, result.players.map(p => p.inputs.buffer));
  } catch (error) { self.postMessage({ error: error.message }); }
};
