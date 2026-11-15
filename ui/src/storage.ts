/** Browser preferences kept in localStorage (lens, sidebar and panel widths, sidebar open). */
export const LENS_KEY = "dp.lens";
export const LEFT_KEY = "dp.leftWidth";
export const RIGHT_KEY = "dp.rightWidth";
export const LEFT_OPEN_KEY = "dp.leftOpen";

export const storage = {
  get(k: string) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: lens choice is not remembered */
    }
  },
};
