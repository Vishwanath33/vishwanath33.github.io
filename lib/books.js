/**
 * The Books page: reads `src/books.txt`, a plain list anyone can edit, and
 * sorts it onto shelves.
 *
 * The format is deliberately forgiving: no quotes, no indentation, no
 * commas. Books are separated by a line of dashes. Each begins with
 * `field: value` lines; whatever follows the first blank line is the
 * review, in Markdown.
 *
 *     title: Chaos: Making a New Science
 *     author: James Gleick
 *     read: 2024-03-10
 *     favourite: yes
 *     cover: chaos.jpg
 *
 *     What I thought of it, as long as I like.
 *
 *     ---
 *
 * Mistakes are reported while the site builds and never stop it: a book
 * with a misspelt field still appears, without that field.
 */
import fs from "node:fs";
import path from "node:path";

// In the order the filter offers them. `dateWord` goes before the date on
// a book's card where the bare date would read as the day it was finished.
export const STATUSES = {
  reading: { label: "Reading now", short: "Reading", glyph: "◐", dateWord: "since" },
  read: { label: "Read", short: "Read", glyph: "●" },
  "on-hold": { label: "On hold", short: "On hold", glyph: "◑", dateWord: "since" },
  "to-return": { label: "Dropped, to return to", short: "To return to", glyph: "↺" },
  "to-read": { label: "To read", short: "To read", glyph: "○" },
  dropped: { label: "Dropped", short: "Dropped", glyph: "×" },
};

/** Book cloths, for covers set in type when there is no image. */
const CLOTHS = [
  "#6b2b2a", // oxblood
  "#2c4459", // slate blue
  "#35523f", // forest
  "#775a2c", // ochre
  "#493a5c", // plum
  "#8a3f25", // rust
  "#263a4f", // navy
  "#585c47", // olive
  "#3b3a3d", // charcoal
  "#774a52", // old rose
];

const FIELDS = new Set(["title", "author", "read", "status", "favourite", "cover", "link", "note"]);
const ALIASES = { favorite: "favourite", date: "read", finished: "read", url: "link", by: "author" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const slugify = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Split the file into books: fields, then the review. */
export function parseBooks(text) {
  const books = [];
  const warnings = [];
  const chunks = String(text || "").replace(/\r\n?/g, "\n").split(/^[ \t]*-{3,}[ \t]*$/m);

  chunks.forEach((chunk, n) => {
    const lines = chunk.split("\n");
    let i = 0;
    // Blank lines and comments may come before a book's fields.
    while (i < lines.length && (!lines[i].trim() || /^\s*#/.test(lines[i]))) i++;

    const book = {};
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) break;                       // a blank line ends the fields
      if (/^\s*#/.test(line)) continue;              // a comment
      const m = line.match(/^\s*([A-Za-z][A-Za-z -]*?)\s*:\s*(.*)$/);
      if (!m) break;                                 // the review began without a blank line
      const key = m[1].toLowerCase().replace(/\s+/g, "-");
      const field = ALIASES[key] || key;
      if (!FIELDS.has(field)) {
        if (!book.title && !Object.keys(book).length) break;
        warnings.push(`"${book.title || `book ${n + 1}`}": no such field as "${m[1]}" (fields are ${[...FIELDS].join(", ")}). If that line is the start of the review, put a blank line before it.`);
        continue;
      }
      book[field] = m[2].trim();
    }
    const review = lines.slice(i).join("\n").trim();

    if (!Object.keys(book).length) {
      if (review.replace(/^\s*#.*$/gm, "").trim()) warnings.push(`book ${n + 1}: text with no "title:" line above it was left out.`);
      return;
    }
    if (!book.title) {
      warnings.push(`book ${n + 1}: no "title:" line, so it was left out.`);
      return;
    }
    books.push({ ...book, review });
  });

  return { books, warnings };
}

function readDate(value, title, warnings) {
  if (!value) return { sort: "", text: "" };
  const m = value.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  const month = m && m[2] ? Number(m[2]) : 0;
  const day = m && m[3] ? Number(m[3]) : 0;
  if (!m || month > 12 || day > 31) {
    warnings.push(`"${title}": the date "${value}" should look like 2024-03-10, 2024-03 or 2024. It is shown as written and the book is not sorted by it.`);
    return { sort: "", text: value };
  }
  const text = [day || "", month ? MONTHS[month - 1] : "", m[1]].filter(Boolean).join(" ");
  return { sort: `${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, text };
}

function readStatus(value, hasDate, title, warnings) {
  if (!value) return "read";
  const v = value.toLowerCase().replace(/[^a-z]/g, "");
  if (["read", "finished", "done"].includes(v)) return "read";
  if (["reading", "currentlyreading", "readingnow", "now"].includes(v)) return "reading";
  if (["toread", "unread", "wanttoread", "want", "next"].includes(v)) return "to-read";
  if (["onhold", "hold", "paused"].includes(v)) return "on-hold";
  if (["toreturnto", "toreturn", "droppedtoreturnto", "droppedbutwanttoread", "retry"].includes(v)) return "to-return";
  if (["dropped", "abandoned", "dnf", "didnotfinish", "gaveup"].includes(v)) return "dropped";
  warnings.push(`"${title}": status "${value}" is not one of read, reading, on hold, to return to, to read, dropped. It is shelved as ${hasDate ? "read" : "to read"}.`);
  return hasDate ? "read" : "to-read";
}

/** "Hofstadter, Douglas" or "Douglas Hofstadter and …" → sort by Hofstadter. */
function authorKey(author) {
  let first = String(author || "").split(/\s*(?:;|&|\band\b)\s*/i)[0].trim();
  if (first.includes(",")) {
    const [last, rest] = first.split(",", 2);
    first = `${(rest || "").trim()} ${last.trim()}`.trim();
  }
  const parts = first.split(/\s+/).filter(Boolean);
  if (!parts.length) return "￿";                 // no author: after everyone
  return slugify(`${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`);
}

/**
 * Sort the parsed books onto shelves, ready for the page.
 * `render` turns a Markdown review into HTML.
 */
export function shelve(text, { render, coversDir, notesDir, noteUrl, log = console.warn } = {}) {
  const { books: raw, warnings } = parseBooks(text);
  const ids = new Map();

  const all = raw.map((b, order) => {
    const title = b.title;
    const author = b.author || "";
    const date = readDate(b.read, title, warnings);
    const status = readStatus(b.status, Boolean(b.read), title, warnings);

    let cover = "";
    if (b.cover) {
      const file = path.basename(b.cover);
      if (coversDir && fs.existsSync(path.join(coversDir, file))) cover = file;
      else warnings.push(`"${title}": no file called "${file}" in src/assets/covers/, so a typeset cover is used instead.`);
    }

    let link = "";
    if (b.link) {
      if (/^https?:\/\/\S+$/i.test(b.link)) link = b.link;
      else warnings.push(`"${title}": the link "${b.link}" should be a full address beginning https://. It was left out.`);
    }

    let note = "";
    if (b.note) {
      const slug = b.note.replace(/^\[\[|\]\]$/g, "").replace(/^\/?notes\//, "").replace(/\/$/, "").replace(/\.md$/, "").trim();
      if (notesDir && fs.existsSync(path.join(notesDir, `${slug}.md`))) note = noteUrl(slug);
      else warnings.push(`"${title}": there is no entry called "${slug}" in src/notes/, so the link to it was left out.`);
    }

    const base = `book-${slugify(`${title} ${authorKey(author).split("-")[0]}`).slice(0, 60) || "untitled"}`;
    const seen = ids.get(base) || 0;
    ids.set(base, seen + 1);

    return {
      id: seen ? `${base}-${seen + 1}` : base,
      order,
      title,
      author,
      status,
      statusLabel: STATUSES[status].label,
      glyph: STATUSES[status].glyph,
      dateWord: STATUSES[status].dateWord || "",
      favourite: /^(y|yes|true|1|★)$/i.test(b.favourite || ""),
      date: date.text,
      dateSort: date.sort,
      cover,
      cloth: CLOTHS[hash(title + author) % CLOTHS.length],
      // A typeset cover's title is sized so its longest word fits the
      // line (in hundredths of the cover's width).
      titleSize: Math.round(Math.min(13, Math.max(7.5, 118 / Math.max(...title.split(/[\s-]+/).map((w) => w.length)))) * 10) / 10,
      link,
      lookup: `https://openlibrary.org/search?q=${encodeURIComponent(`${title} ${author}`.trim())}`,
      note,
      review: b.review && render ? render(b.review) : "",
    };
  });

  for (const w of warnings) log(`[books] ${w}`);

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  // Latest first, oldest last. A book being read with no date given is
  // the latest of all; any other book without a date goes to the end.
  const when = (b) => b.dateSort || (b.status === "reading" ? "9999" : "");
  const newestFirst = (a, b) => cmp(when(b), when(a)) || b.order - a.order;

  return {
    total: all.length,
    counts: Object.fromEntries(Object.keys(STATUSES).map((s) => [s, all.filter((b) => b.status === s).length])),
    statuses: STATUSES,
    reading: all.filter((b) => b.status === "reading").sort(newestFirst),
    favourites: all.filter((b) => b.favourite).sort(newestFirst),
    all: [...all].sort(newestFirst),
    warnings,
  };
}
