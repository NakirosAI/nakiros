import { aq as Utils, ar as Color } from "./index-mt2AnMMq.js";
const channel = (color, channel2) => {
  return Utils.lang.round(Color.parse(color)[channel2]);
};
export {
  channel as c
};
