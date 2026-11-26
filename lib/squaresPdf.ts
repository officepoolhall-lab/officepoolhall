// A Squares board as a one-page PDF (landscape Letter), for the commissioner to send to people
// who don't have the link. Written by hand (a PDF is text commands plus a table of where each
// object starts), so it needs no library: the two built-in Helvetica fonts, lines, filled
// boxes and text.

import { QUARTERS, type Score } from "./squares";

export type PdfBoard = {
  poolName: string;
  homeName: string;
  awayName: string;
  colDigits: number[] | null;
  rowDigits: number[] | null;
  /** The name on each of the 100 squares (row × 10 + column), or null. */
  names: (string | null)[];
  scores: (Score | null)[];
  winners: (number | null)[];
  /** "$250" for each quarter, or null when there's no pot to show. */
  payouts: (string | null)[];
  /** Small print at the bottom ("officepoolhall.com · Feb 7, 2027"). */
  footer: string;
};

// Helvetica's character widths (per 1000 units of font size), codes 32-126.
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722,
  778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Text the built-in fonts can draw: Latin-1, with curly quotes and dashes straightened and anything else as "?". */
const latin = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const width = (s: string, size: number, bold = false) => ([...s].reduce((t, ch) => t + (W[ch.charCodeAt(0) - 32] ?? 556), 0) / 1000) * size * (bold ? 1.06 : 1);
const esc = (s: string) => s.replace(/([\\()])/g, "\\$1");
/** The font size (down to `min`) at which the text fits a width; `min` when nothing fits. */
function fitSize(s: string, max: number, size: number, min: number, bold = false): number {
  let z = size;
  while (z > min && width(s, z, bold) > max) z -= 0.25;
  return z;
}

/** The text cut to fit a width, ending in "." when it had to be shortened. */
function fit(s: string, max: number, size: number, bold = false): string {
  if (width(s, size, bold) <= max) return s;
  let out = s;
  while (out.length > 1 && width(`${out}.`, size, bold) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}.`;
}

export function squaresPdf(b: PdfBoard): Uint8Array {
  const [PW, PH] = [792, 612];
  const ops: string[] = [];
  const text = (s: string, x: number, y: number, size: number, o: { bold?: boolean; gray?: number; align?: "left" | "center" | "right" } = {}) => {
    const t = latin(s);
    const w = width(t, size, o.bold);
    const tx = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    ops.push(`${o.gray ?? 0} g BT /${o.bold ? "F2" : "F1"} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td (${esc(t)}) Tj ET`);
  };
  const box = (x: number, y: number, w: number, h: number, fill: number | null, stroke = true) =>
    ops.push(`${fill === null ? "" : `${fill} g `}0.55 G 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill === null ? "S" : stroke ? "B" : "f"}`);

  // Heading.
  text(fit(b.poolName, 520, 18, true), 36, PH - 46, 18, { bold: true });
  text(`${b.awayName} vs ${b.homeName}`, 36, PH - 64, 11, { gray: 0.35 });

  // The board: a row and a column of numbers, then 10 × 10 squares.
  const [gx, gyTop, cw, ch] = [62, PH - 96, 49, 42];
  text(latin(b.homeName), gx + cw + (cw * 10) / 2, gyTop + 6, 11, { bold: true, align: "center" });
  // The away team's name runs up the left side.
  const away = latin(b.awayName);
  const mid = gyTop - ch - (ch * 10) / 2 - width(away, 11, true) / 2;
  ops.push(`0 g BT /F2 11 Tf 0 1 -1 0 ${gx - 8} ${mid.toFixed(2)} Tm (${esc(away)}) Tj ET`);
  const won = (idx: number) => b.winners.map((w, q) => (w === idx ? ["Q1", "Half", "Q3", "Final"][q] : null)).filter(Boolean).join(" ");
  for (let r = -1; r < 10; r++) {
    for (let c = -1; c < 10; c++) {
      const x = gx + (c + 1) * cw;
      const y = gyTop - (r + 2) * ch;
      if (r === -1 && c === -1) continue;
      if (r === -1 || c === -1) {
        // A number: white on black.
        const d = r === -1 ? b.colDigits?.[c] : b.rowDigits?.[r];
        box(x, y, cw, ch, 0.1);
        text(d === undefined || d === null ? "?" : String(d), x + cw / 2, y + ch / 2 - 5, 15, { bold: true, gray: 1, align: "center" });
        continue;
      }
      const idx = r * 10 + c;
      const w = won(idx);
      box(x, y, cw, ch, w ? 0.86 : null);
      const name = b.names[idx];
      if (name) {
        // The whole name: one line if it fits, else split over two (or three) lines at spaces,
        // shrinking the type (down to 5pt) rather than cutting anything off.
        const t = latin(name);
        const bold = Boolean(w);
        const words = t.split(" ");
        const splits = (n: number): string[] => {
          if (n === 1 || words.length < n) return [t];
          // Balance the lines by length.
          const per = t.length / n;
          const lines: string[] = [];
          let cur = "";
          for (const word of words) {
            if (cur && (cur + " " + word).length > per * 1.15 && lines.length < n - 1) {
              lines.push(cur);
              cur = word;
            } else cur = cur ? `${cur} ${word}` : word;
          }
          lines.push(cur);
          return lines;
        };
        let lines = [t];
        let size = 8;
        for (const n of [1, 2, 3]) {
          const ls = splits(n);
          const longest = Math.max(...ls.map((l) => width(l, 8, bold)));
          const s8 = Math.min(8, (8 * (cw - 6)) / longest, (ch - 6) / (ls.length * 1.15));
          if (s8 >= 7 || n === 3 || words.length <= n) {
            lines = ls;
            size = Math.max(5, Math.floor(s8 * 4) / 4);
            break;
          }
        }
        const lead = size * 1.15;
        const top = y + ch / 2 + ((lines.length - 1) * lead) / 2 - size * 0.35;
        lines.forEach((l, i) => text(fit(l, cw - 4, size, bold), x + cw / 2, top - i * lead, size, { bold, align: "center" }));
      }
      if (w) text(w, x + cw - 3, y + ch - 8, 6, { bold: true, gray: 0.25, align: "right" });
    }
  }

  // Beside the board: each quarter's score, winner and payout.
  const px = gx + cw * 11 + 16;
  const pw = PW - 36 - px;
  let py = gyTop - 6;
  text("Winners", px, py, 12, { bold: true });
  py -= 20;
  QUARTERS.forEach((q, i) => {
    const s = b.scores[i];
    const w = b.winners[i];
    text(q, px, py, 9.5, { bold: true });
    if (b.payouts[i]) text(b.payouts[i]!, px + pw, py, 9.5, { align: "right" });
    py -= 12;
    // The score line shrinks to fit (long team names) before anything is cut.
    const line = s ? `${b.awayName} ${s.away}, ${b.homeName} ${s.home}` : "Not played yet";
    const z = fitSize(line, pw, 8, 6);
    text(fit(line, pw, z), px, py, z, { gray: 0.4 });
    py -= 12;
    if (s) {
      const who = w === null ? "Numbers not set" : (b.names[w] ?? "Open square");
      text(fit(who, pw, 9.5), px, py, 9.5);
      py -= 12;
    }
    py -= 10;
  });
  py -= 4;
  for (const line of ["Columns: the last digit of the", `${b.homeName} score.`, "Rows: the last digit of the", `${b.awayName} score.`]) {
    text(fit(line, pw, 7.5), px, py, 7.5, { gray: 0.4 });
    py -= 10;
  }
  text(b.footer, 36, 24, 7.5, { gray: 0.45 });

  // Assemble: the objects, then the table of their byte offsets.
  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character is Latin-1, so one byte each (which is what the offsets counted).
  return Uint8Array.from(out, (ch) => ch.charCodeAt(0) & 0xff);
}
