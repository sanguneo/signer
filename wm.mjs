// Prompt signer CLI (Bun). Cleans generator artifacts and hides a tracing ID; no visible signature.
//   bun wm.mjs sign <prompt.json> <out.json> --id <post-id>
//   bun wm.mjs decode <file-or-text>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { cleanAndSign, autoId, decodeHidden } from "./signer.mjs";

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
  console.log(JSON.stringify({ found: ids.length > 0, ids }));
} else {
  console.error(USAGE);
  process.exit(cmd ? 2 : 0);
}
}
