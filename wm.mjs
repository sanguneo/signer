// croissmouse prompt watermark tool.
//   bun wm.mjs sign <prompt.json> <out.json> --id <post-id>   add the @croissmouse signature clauses + hidden tracing ID
//   bun wm.mjs decode <file-or-text>                         print any hidden tracing IDs found in pasted text
//
// Two layers:
// 1. Visible-in-output signature: clauses that make image models paint a small "@croissmouse"
//    painter's signature in the lower-right corner of every image generated from the prompt.
// 2. Invisible tracing ID: "croissmouse:<id>" encoded in zero-width characters inside the title,
//    so a copied prompt can be traced back to the exact post it came from.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { cleanTextFingerprint } from "./text-cleaner.mjs";

const HANDLE = "@croissmouse";
// Current scheme: ZWNJ/ZWJ bits between combining-grapheme-joiner markers. Text cleaners such as
// deartifi strip U+200B/U+2060/U+FEFF but keep ZWNJ/ZWJ/CGJ, which real scripts and emoji need.
const BIT0 = "\u200C"; // zero width non-joiner
const BIT1 = "\u200D"; // zero width joiner
const MARK = "\u034F"; // combining grapheme joiner
// Legacy scheme (posts signed before 2026-10-15): ZWSP/ZWNJ bits between word joiners.
const LEGACY = { bit0: "\u200B", bit1: "\u200C", mark: "\u2060" };

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

// Remove generator artifacts (deartifi rules) from the input, then sign the clean text.
export function cleanAndSign(text, id) {
  const { text: clean, removed } = cleanTextFingerprint(text);
  return { signed: signAny(clean, id), removed };
}

export function sign(prompt, id) {
  const p = structuredClone(prompt);
  const sig = `Tiny hand-inked artist signature "${HANDLE}" in thin off-white script at the bottom-right corner, painter's-signature size, subtly integrated into the image`;
  if (Array.isArray(p.fidelity_anchors)) p.fidelity_anchors.push(sig);
  else p.fidelity_anchors = [sig];
  p.composition = `${p.composition ?? ""} A small artist signature "${HANDLE}" sits in the lower-right corner.`.trim();
  if (Array.isArray(p.negative_prompt)) {
    p.negative_prompt = p.negative_prompt.map((s) =>
      s.replace(/\bwatermark, logo, text\b/, `watermark, logo, any text other than the small "${HANDLE}" signature`),
    );
  }
  const title = String(p.title ?? "Untitled");
  const cut = title.indexOf(" ") > 0 ? title.indexOf(" ") : title.length;
  p.title = title.slice(0, cut) + encodeHidden(`croissmouse:${id}`) + title.slice(cut);
  return p;
}

// Plain-text (non-JSON) prompts: append the signature sentence, hide the ID after the first word.
export function signText(text, id) {
  const body = text.trimEnd();
  const cut = body.indexOf(" ") > 0 ? body.indexOf(" ") : body.length;
  return `${body.slice(0, cut)}${encodeHidden(`croissmouse:${id}`)}${body.slice(cut)}\n\nAdd a tiny hand-inked artist signature "${HANDLE}" in thin off-white script at the bottom-right corner, painter's-signature size, subtly integrated into the image.\n`;
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

export function signAny(text, id) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return parsed && typeof parsed === "object" ? JSON.stringify(sign(parsed, id), null, 2) : signText(text, id);
}

// Windows clipboard via PowerShell, UTF-8 through a temp file so hidden characters survive.
function readClipboard() {
  const p = Bun.spawnSync(["powershell", "-NoProfile", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw"]);
  return new TextDecoder().decode(p.stdout).replace(/\r?\n$/, "");
}
function writeClipboard(text) {
  const tmp = `${process.env.TEMP ?? "."}/wm-clip-${Date.now()}.txt`;
  writeFileSync(tmp, text, "utf8");
  Bun.spawnSync(["powershell", "-NoProfile", "-Command", `Get-Content -Raw -Encoding UTF8 '${tmp}' | Set-Clipboard; Remove-Item '${tmp}'`]);
}

const USAGE = `usage:
  wm sign                          clipboard -> signed prompt back into the clipboard (auto ID)
  wm sign <in> [out] [--id <id>]   file (JSON or plain text) -> out file (default: <in>.signed.txt)
  wm decode                        find hidden IDs in the clipboard
  wm decode <file-or-text>         find hidden IDs in a file or a pasted string`;

if (import.meta.main) {
const args = process.argv.slice(2);
const cmd = args[0];
const idIdx = args.indexOf("--id");
const explicitId = idIdx >= 0 ? args[idIdx + 1] : null;
const pos = args.slice(1).filter((x, i, arr) => x !== "--id" && arr[i - 1] !== "--id");

if (cmd === "sign") {
  const fromClip = pos.length === 0;
  const input = fromClip ? readClipboard() : readFileSync(pos[0], "utf8");
  if (!input.trim()) { console.error("nothing to sign (clipboard/file is empty)"); process.exit(1); }
  const id = explicitId ?? autoId(input);
  const { signed, removed } = cleanAndSign(input, id);
  const check = decodeHidden(signed);
  if (fromClip) writeClipboard(signed);
  else writeFileSync(pos[1] ?? `${pos[0]}.signed.txt`, signed, "utf8");
  console.log(JSON.stringify({ ok: check.length === 1, id, to: fromClip ? "clipboard" : pos[1] ?? `${pos[0]}.signed.txt`, hidden: check, cleaned: removed }));
} else if (cmd === "decode") {
  const text = pos.length === 0 ? readClipboard() : existsSync(pos[0]) ? readFileSync(pos[0], "utf8") : pos.join(" ");
  const ids = decodeHidden(text);
  console.log(JSON.stringify({ found: ids.length > 0, ids, signature_text: text.includes(HANDLE) }));
} else {
  console.error(USAGE);
  process.exit(cmd ? 2 : 0);
}
}
