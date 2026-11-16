/**
 * Estimated size of a line's label box, for placing labels before they are drawn. Calibrated against
 * the `.edge-label` styles (font 10.5px, padding 2px 7px, 1px border, max-width 180px, text clamped
 * to four lines, a technology line in 9.5px, a row of 10px badges). A little generous on width.
 */

const MAX_W = 180;
const FRAME_X = 16; // padding 7 + 7, border 1 + 1
const FRAME_Y = 6; // padding 2 + 2, border 1 + 1
const TEXT_LINES = 4;
const CHAR = 5.3; // average glyph width at 10.5px
const LINE = 13.65; // 10.5px at line-height 1.3
const TECH_H = 12.4;
const TECH_ICON = 13; // icon 10px + gap 3px
const BADGE_ROW = 15;
const BADGE_GAP = 3;

export interface LabelContent {
  text: string;
  technologies: string[];
  /** The visible badge texts, in order (kind, stages, sensitivity, notes, open work, comments). */
  badges: string[];
  /** Font size of the label text, when the line has its own (the default is 10.5). */
  fontSize?: number;
}

/** Lines needed to wrap `text` into `width` pixels, by words, breaking words that are too long. */
function wrapLines(text: string, charW: number, width: number): number {
  const per = Math.max(1, Math.floor(width / charW));
  let lines = 0;
  for (const para of text.split("\n")) {
    let used = 0;
    let n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let len = word.length;
      if (used > 0 && used + 1 + len <= per) used += 1 + len;
      else {
        if (used > 0) n++;
        while (len > per) {
          n++;
          len -= per;
        }
        used = len;
      }
    }
    lines += n;
  }
  return Math.max(1, lines);
}

export function estimateLabelSize(c: LabelContent): { w: number; h: number } {
  const k = (c.fontSize ?? 10.5) / 10.5;
  const charW = CHAR * k;
  const inner = MAX_W - FRAME_X;
  const textW = c.text.length * charW;
  const tech = c.technologies.join(", ");
  const techW = tech ? TECH_ICON + (tech.length + 1) * CHAR * (9.5 / 10.5) : 0;
  const badgeW = c.badges.map((b) => b.length * 5.2 + 12);
  const badgesW = badgeW.reduce((s, x) => s + x, 0) + BADGE_GAP * Math.max(0, badgeW.length - 1);
  const w = Math.min(MAX_W, Math.ceil(Math.max(textW, techW, badgesW)) + FRAME_X);

  const lines = Math.min(TEXT_LINES, wrapLines(c.text, charW, inner));
  let h = FRAME_Y + lines * LINE * k;
  if (tech) h += TECH_H;
  if (badgeW.length) {
    let rows = 1;
    let used = 0;
    for (const b of badgeW) {
      if (used > 0 && used + BADGE_GAP + b > inner) {
        rows++;
        used = b;
      } else used += (used > 0 ? BADGE_GAP : 0) + b;
    }
    h += 2 + rows * BADGE_ROW + (rows - 1) * BADGE_GAP;
  }
  return { w, h: Math.ceil(h) };
}
