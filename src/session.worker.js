import { simulate } from "./session-report.js";
self.onmessage = ({ data }) => {
  try { self.postMessage({ results: simulate(data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
