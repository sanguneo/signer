// Prompt signer core (browser + Bun). No visible signature: it cleans generator artifacts
// (deartifi rules) and hides a tracing ID as invisible characters.
import { cleanTextFingerprint } from "./text-cleaner.mjs";

// Current scheme: ZWNJ/ZWJ bits between combining-grapheme-joiner markers. Text cleaners such as
// deartifi strip U+200B/U+2060/U+FEFF but keep ZWNJ/ZWJ/CGJ, which real scripts and emoji need.
const BIT0 = "\u200C"; // zero width non-joiner
const BIT1 = "\u200D"; // zero width joiner
const MARK = "\u034F"; // combining grapheme joiner
// Legacy scheme (posts signed before 2026-10-15): ZWSP/ZWNJ bits between word joiners.
const LEGACY = { bit0: "\u200B", bit1: "\u200C", mark: "\u2060" };
// The hidden text is exactly the ID the user chose (older posts carry "croissmouse:<id>"; both decode).
export const PREFIX = "";

export function encodeHidden(text) {
  const bits = [...new TextEncoder().encode(text)].map((b) => b.toString(2).padStart(8, "0")).join("");
  return MARK + [...bits].map((b) => (b === "1" ? BIT1 : BIT0)).join("") + MARK;
}

function decodeWith(text, bit0, bit1, mark) {
  const found = [];
  for (const m of text.matchAll(new RegExp(`${mark}([${bit0}${bit1}]+)${mark}`, "g"))) {
    if (m[1].length % 8 !== 0) continue;
    const bits = [...m[1]].map((c) => (c === bit1 ? "1" : "0")).join("");
    const bytes = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    found.push(new TextDecoder().decode(bytes));
  }
  return found;
}

export function decodeHidden(text) {
  return [...decodeWith(text, BIT0, BIT1, MARK), ...decodeWith(text, LEGACY.bit0, LEGACY.bit1, LEGACY.mark)];
}

// Hide the ID right after the first word of a string.
const hideAfterFirstWord = (s, id) => {
  const cut = s.indexOf(" ") > 0 ? s.indexOf(" ") : s.length;
  return s.slice(0, cut) + encodeHidden(PREFIX + id) + s.slice(cut);
};

// JSON prompts: hide the ID in the title. Nothing else changes.
export function sign(prompt, id) {
  const p = structuredClone(prompt);
  p.title = hideAfterFirstWord(String(p.title ?? "Untitled"), id);
  return p;
}

// Plain-text prompts: hide the ID after a random word in the middle (never after the last word).
export function signText(text, id, rand = Math.random) {
  const body = text.trimEnd();
  const gaps = [...body.matchAll(/ /g)].map((m) => m.index);
  if (gaps.length === 0) return body + encodeHidden(PREFIX + id) + "\n";
  const at = gaps[Math.floor(rand() * gaps.length)];
  return body.slice(0, at) + encodeHidden(PREFIX + id) + body.slice(at) + "\n";
}

export function signAny(text, id) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return parsed && typeof parsed === "object" ? JSON.stringify(sign(parsed, id), null, 2) : signText(text, id);
}

// Remove generator artifacts (deartifi rules) from the input, then sign the clean text.
export function cleanAndSign(text, id) {
  const { text: clean, removed } = cleanTextFingerprint(text);
  return { signed: signAny(clean, id), removed };
}

// Default ID: YYYYMMDD-<first words of the title>, e.g. 20261015-mysterious-woman-guy
export function autoId(text) {
  let title = "";
  try { title = String(JSON.parse(text).title ?? ""); } catch { title = text.slice(0, 60); }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").filter(Boolean).slice(0, 3).join("-");
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return slug ? `${ymd}-${slug}` : ymd;
}
