/** Browser preferences kept in localStorage (lens, sidebar and panel widths, sidebar and panel open, Add palette open). */
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
export const RIGHT_OPEN_KEY = "dp.rightOpen";
/** Whether the Add palette is open ("1") or collapsed to its button ("0"). Not set: open when the canvas is wide enough. */
export const PALETTE_KEY = "dp.paletteOpen";

/** How the home page lists projects: "grid" (cards) or "list". */
export const HOME_VIEW_KEY = "dp.homeView";

/** The name a person types on comments when sign-in is off (kept in this browser only). */
export const AUTHOR_KEY = "dp.commentAuthor";

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
