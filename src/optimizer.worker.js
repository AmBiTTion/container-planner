import { optimize } from "./engine.js";
self.onmessage = ({ data }) => {
  try {
    const result = optimize(data.project, data.mode, (progress) =>
      self.postMessage({ progress }),
    );
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
