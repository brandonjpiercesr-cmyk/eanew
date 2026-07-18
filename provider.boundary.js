// ⬡B:eanew.provider_boundary:LAW:the_last_groq_door_closes:20260717⬡
// FOUNDER LAW 20260717: no Groq, no Google. eanew is the parked watcher and the last
// service still reaching Groq: 3 fetch sites, one of them on llama-3.1-8b-instant which
// Groq retires 20260816 anyway. eanew has no ladder or Ornith of its own, so this
// boundary reroutes banned-provider chat calls straight to Qwen on OpenRouter, an
// approved open-weight API. Self-contained, fetch-only (eanew uses no axios for models).
// Installed at the first line of index.js. Zero per-caller edits. Anthropic passes through.

var BANNED = ['api.groq.com', 'generativelanguage.googleapis.com', 'api.deepseek.com', 'api.x.ai'];

function isBanned(url) {
  var u = String(url || '');
  for (var i = 0; i < BANNED.length; i++) if (u.indexOf(BANNED[i]) !== -1) return true;
  return false;
}

function install() {
  if (globalThis.__eanewProviderBoundaryInstalled) return;
  var realFetch = globalThis.fetch;
  if (typeof realFetch !== 'function') return;
  globalThis.fetch = async function (url, init) {
    if (!isBanned(url)) return realFetch.apply(this, arguments);
    var parsed = null;
    try { parsed = init && init.body ? JSON.parse(init.body) : null; } catch (e) { parsed = null; }
    var msgs = parsed && Array.isArray(parsed.messages) ? parsed.messages : null;
    if (!msgs || !process.env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: { message: 'banned_provider_blocked_at_boundary' } }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    try {
      var body = {
        model: process.env.QWEN_MODEL || 'qwen/qwen3-235b-a22b',
        messages: msgs,
        max_tokens: parsed.max_tokens || 300,
        temperature: typeof parsed.temperature === 'number' ? parsed.temperature : 0.4
      };
      if (parsed.response_format) body.response_format = parsed.response_format;
      var r = await realFetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
      var d = await r.json();
      if (d && d.choices) { d._rerouted_from_banned_provider = true; return new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response(JSON.stringify({ error: { message: 'reroute_failed' } }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: 'provider_boundary_error: ' + String(e && e.message || e) } }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  };
  globalThis.__eanewProviderBoundaryInstalled = true;
}

module.exports = { install: install, isBanned: isBanned, BANNED: BANNED };
