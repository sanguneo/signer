// croissmouse watermark web UI, reachable only over Tailscale.
//   bun web.mjs            -> http://<tailscale-ip>:8787
// Binds to the Tailscale IPv4 address, so it is not exposed on the LAN or the internet.
import { cleanAndSign, autoId, decodeHidden } from "./wm.mjs";

const PORT = Number(process.env.WM_PORT ?? 8787);
const ip = Bun.spawnSync(["tailscale", "ip", "-4"]).stdout.toString().trim().split(/\s+/)[0];
if (!/^100\./.test(ip)) {
  console.error(`WMERR tailscale IPv4 not found (got "${ip}")`);
  process.exit(1);
}

const PAGE = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>croissmouse 서명기</title>
<style>
  :root { color-scheme: light dark; --bg:#faf7f2; --fg:#2b2118; --card:#fff; --muted:#8a7a6a; --acc:#c8792a; --line:#e8dfd3; }
  @media (prefers-color-scheme: dark) { :root { --bg:#17130f; --fg:#f1e7db; --card:#221c16; --muted:#a89584; --acc:#e09a52; --line:#3a3027; } }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width: 760px; margin: 0 auto; padding: 20px 16px 48px; }
  h1 { font-size: 22px; margin: 4px 0 2px; } .sub { color: var(--muted); margin: 0 0 18px; font-size: 14px; }
  .tabs { display:flex; gap:8px; margin-bottom: 14px; }
  .tabs button { flex:1; padding: 10px; border-radius: 12px; border:1px solid var(--line); background:var(--card); color:var(--fg); font-weight:600; font-size:15px; }
  .tabs button.on { background: var(--acc); border-color: var(--acc); color: #fff; }
  .card { background: var(--card); border:1px solid var(--line); border-radius: 16px; padding: 14px; margin-bottom: 12px; }
  label { display:block; font-size: 13px; color: var(--muted); margin: 0 0 6px; }
  textarea, input { width:100%; border:1px solid var(--line); border-radius: 10px; background: transparent; color: var(--fg); padding: 10px; font: 13px/1.45 ui-monospace,Consolas,monospace; }
  textarea { min-height: 180px; resize: vertical; }
  .row { display:flex; gap:8px; margin-top: 10px; }
  .row button { flex:1; min-height: 44px; border:0; border-radius: 12px; font-size: 15px; font-weight: 600; background: var(--acc); color:#fff; }
  .row button.ghost { background: transparent; color: var(--fg); border:1px solid var(--line); }
  .msg { font-size: 14px; margin-top: 8px; min-height: 20px; }
  .ok { color: #3a8f4f; } .bad { color: #c0452f; }
  .hide { display:none; }
</style></head>
<body><main>
  <h1>🥐 croissmouse 서명기</h1>
  <p class="sub">제미나이 등이 붙인 이상한 문자를 먼저 정리하고(deartifi 규칙), @croissmouse 서명과 숨은 추적 ID를 넣어요. 퍼간 글에서 ID도 찾아요.</p>
  <div class="tabs"><button id="t-sign" class="on">서명 넣기</button><button id="t-dec">불펌 확인</button></div>

  <section id="p-sign">
    <div class="card">
      <label for="in">원본 프롬프트 (JSON 또는 일반 문장)</label>
      <textarea id="in" placeholder='{ "purpose": "image generation", "title": "...", ... }'></textarea>
      <label for="id" style="margin-top:10px">추적 ID (비우면 자동: 날짜-제목 앞 3단어)</label>
      <input id="id" placeholder="예: fawkes" autocomplete="off">
      <div class="row"><button id="b-sign">서명 넣기</button><button id="b-paste" class="ghost">붙여넣기</button></div>
      <div id="m-sign" class="msg"></div>
    </div>
    <div class="card">
      <label for="out">결과 (이걸 그대로 올리세요)</label>
      <textarea id="out" readonly></textarea>
      <div class="row"><button id="b-copy">결과 복사</button></div>
      <div id="m-copy" class="msg"></div>
    </div>
  </section>

  <section id="p-dec" class="hide">
    <div class="card">
      <label for="sus">의심 글 텍스트 (통째로 붙여넣기)</label>
      <textarea id="sus"></textarea>
      <div class="row"><button id="b-dec">확인하기</button></div>
      <div id="m-dec" class="msg"></div>
    </div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const tab = (s) => { $("p-sign").classList.toggle("hide", !s); $("p-dec").classList.toggle("hide", s); $("t-sign").classList.toggle("on", s); $("t-dec").classList.toggle("on", !s); };
$("t-sign").onclick = () => tab(true); $("t-dec").onclick = () => tab(false);
const post = async (path, body) => (await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
const say = (el, text, ok) => { el.textContent = text; el.className = "msg " + (ok ? "ok" : "bad"); };

$("b-paste").onclick = async () => {
  try { $("in").value = await navigator.clipboard.readText(); }
  catch { say($("m-sign"), "이 브라우저는 자동 붙여넣기를 막아요. 입력칸을 길게 눌러 붙여넣어 주세요.", false); }
};
$("b-sign").onclick = async () => {
  const r = await post("/api/sign", { text: $("in").value, id: $("id").value.trim() || null });
  if (!r.ok) return say($("m-sign"), r.error, false);
  $("out").value = r.signed;
  const junk = r.removed.length ? " · 정리한 이상한 문자: " + r.removed.map(x => x.kind + " " + x.count + "개").join(", ") : " · 정리할 이상한 문자 없음";
  say($("m-sign"), "완료! 숨은 ID: " + r.hidden.join(", ") + junk, true);
};
$("b-copy").onclick = async () => {
  const t = $("out").value; if (!t) return;
  try { await navigator.clipboard.writeText(t); }
  catch { $("out").focus(); $("out").select(); $("out").setSelectionRange(0, t.length); document.execCommand("copy"); }
  say($("m-copy"), "복사했어요. 숨은 문자까지 같이 복사됐어요 ✅", true);
};
$("b-dec").onclick = async () => {
  const r = await post("/api/decode", { text: $("sus").value });
  if (r.ids.length) say($("m-dec"), "내 거 맞아요! 숨은 ID: " + r.ids.join(", "), true);
  else say($("m-dec"), r.signature ? "숨은 ID는 지워졌지만 @croissmouse 서명 문구는 남아 있어요." : "숨은 ID도 서명 문구도 없어요.", false);
};
</script></body></html>`;

const json = (obj, status = 200) => Response.json(obj, { status });

const server = Bun.serve({
  hostname: ip,
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/") return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (req.method === "POST" && url.pathname === "/api/sign") {
      const { text, id } = await req.json().catch(() => ({}));
      if (typeof text !== "string" || !text.trim()) return json({ ok: false, error: "프롬프트를 넣어주세요." }, 400);
      const useId = typeof id === "string" && id ? id : autoId(text);
      const { signed, removed } = cleanAndSign(text, useId);
      return json({ ok: true, id: useId, signed, hidden: decodeHidden(signed), removed });
    }
    if (req.method === "POST" && url.pathname === "/api/decode") {
      const { text } = await req.json().catch(() => ({}));
      const t = typeof text === "string" ? text : "";
      return json({ ids: decodeHidden(t), signature: t.includes("@croissmouse") });
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`WMREADY http://${server.hostname}:${server.port}`);
