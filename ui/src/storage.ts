/** Browser preferences kept in localStorage (lens, sidebar and panel widths, sidebar open). */
/** The lens used to be remembered once per browser; it is now remembered per project (`lensKey`), and this key is only read as a fallback. */
export const LENS_KEY = "dp.lens";
/**
 * The key of the lens remembered for the project in `root` (the folder the model is served from).
 * With sign-in the signed-in name is part of the key: each person has their own remembered lens, and a first
 * sign-in starts in the default lens of the person's role.
 */
export const lensKey = (root: string, user?: string | null) => `${LENS_KEY}:${root}${user ? `:user:${user.toLowerCase()}` : ""}`;
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
