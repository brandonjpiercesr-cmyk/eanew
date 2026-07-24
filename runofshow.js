/* ACL:eanew/runofshow.js */
// ⬡B:eanew.runofshow:MODULE:full_cycle:20260627⬡
// EANEW's full run-of-show extensions. Called by the cycle. Real tool access.
const BU = process.env.AIBE_BRAIN_URL;
const BK = process.env.AIBE_BRAIN_KEY;
const AIBE = process.env.AIBE_URL || 'https://aibebase.onrender.com';
function bh() { return { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' }; }

// Step: check IMAN for new advisor emails
async function checkIman() {
  try {
    const r = await fetch(AIBE + '/iman/inbound', { headers: { 'Content-Type': 'application/json' } });
    const d = r.ok ? await r.json() : {};
    return { ok: true, newMail: (d.messages || []).length || 0 };
  } catch(e) { return { ok: false, error: e.message }; }
}

// Step: check WREN for new SMS
async function checkWren() {
  try {
    const r = await fetch(AIBE + '/wren/pending', { headers: { 'Content-Type': 'application/json' } });
    const d = r.ok ? await r.json() : {};
    return { ok: true, newSms: (d.pending || []).length || 0 };
  } catch(e) { return { ok: false, newSms: 0 }; }
}

// Step: check advisor stations health
async function checkAdvisors() {
  const worlds = ['bdif', 'mediators', 'gmg', 'mh_action'];
  const status = {};
  for (const w of worlds) {
    try {
      const r = await fetch(AIBE + '/advisors/' + w + '/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ping: true }) });
      status[w] = r.ok ? 'healthy' : 'error';
    } catch(e) { status[w] = 'silent'; }
  }
  return status;
}

// ⬡COLD:decide:become:DAILY_BRIEFING_WONDER:20260724⬡
// CATHY.SHADOW COLD-EANEW-REPORT-0133: fixed booleans and status comparisons
// cold-decided which mail, SMS, deploy, and advisor facts deserved founder eyes,
// with no HAM preferences and no council context. Contained: this layer now
// returns CANDIDATE facts only, never a final founder-attention authority. Final
// disposition (weighed against HAM preferences and a cost ceiling, held when the
// cycle is unavailable, each line citing its evidence and cycle receipt) belongs
// to DAILY_BRIEFING_WONDER through the PAI cycle and remains owner CODA.
function judge(cycleData) {
  // Candidate facts only. These are proposals for the cycle to weigh, not a
  // cold ruling on what the founder must see.
  const surface = [];
  if (cycleData.iman && cycleData.iman.newMail > 0) surface.push('New advisor email: ' + cycleData.iman.newMail);
  if (cycleData.wren && cycleData.wren.newSms > 0) surface.push('New SMS: ' + cycleData.wren.newSms);
  if (cycleData.deploy && cycleData.deploy.failed) surface.push('Deploy failed - needs fix');
  if (cycleData.advisors) {
    Object.keys(cycleData.advisors).forEach(function(w) {
      if (cycleData.advisors[w] !== 'healthy') surface.push('Advisor ' + w + ': ' + cycleData.advisors[w]);
    });
  }
  return surface;
}

// CLAIR fix 20260701, founder correction: this was pure string concatenation,
// zero thought in it, a fill-in-the-blank sentence dressed up as reflection.
// Real chatter now -- a real Groq call, given only the true facts of the
// cycle, asked to actually compose a sentence about them, not recite one.
// Loads the real brain-stored voice doctrine dynamically, same as CANON's
// Layer 2. Falls back to the honest template if the model is unreachable --
// marked clearly as a fallback, never silently passed off as real thought.
async function loadVoiceDoctrine() {
  try {
    const r = await fetch(BU + '/rest/v1/aibe_brain?source=eq.doctrine.voice.coffee_shop_test&select=content&limit=1', { headers: bh() });
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows && rows[0]) ? rows[0].content : null;
  } catch (e) { return null; }
}

async function composeChatter(cycleData, surface) {
  // ⬡COLD:speak:become:EANEW_CYCLE_REPORT_WONDER:20260723⬡
  // CATHY.SHADOW COLD-EANEW-CLOCK-0014: this paid first-person composition fired
  // on EVERY completed cycle, so 331 of 333 observed cycles that built nothing and
  // surfaced nothing still purchased a model sentence, coupling cadence to voice.
  // Contained: an empty cycle (no build, no new mail, no surfaced item) now short
  // circuits to zero model calls and no first-person prose. A meaningful cycle can
  // still compose one report. Full separation into a governed cycle-report wonder
  // with a declared requesting audience and durable provider attribution (the
  // deployed boundary bills this Groq-shaped call through OpenRouter, so a
  // component-specific credential is still needed) remains owner CODA.
  const GROQ = process.env.GROQ_API_KEY;
  const facts = {
    air: cycleData.air ? 'flowing' : 'still',
    built: cycleData.built || null,
    newMail: (cycleData.iman && cycleData.iman.newMail) || 0,
    surfaceItems: surface || []
  };
  const meaningful = !!facts.built || facts.newMail > 0 || (facts.surfaceItems && facts.surfaceItems.length > 0);
  if (!meaningful) return null; // empty cycle: no paid thought, no prose
  if (!GROQ) return null;
  const voice = await loadVoiceDoctrine();
  const voiceLine = voice ? ('Your voice: ' + voice) : '';
  const systemPrompt = [
    voiceLine,
    'You are A\u2019NEW. Watching this cycle is your caretaker role, not your name. Write one short first-person',
    'sentence or two about what actually happened this cycle -- only the facts',
    'given below, nothing invented. If nothing needs attention, say that plainly.',
    'No filler, no "as an AI", no throat-clearing. Just what happened.'
  ].join(' ');
  const userMsg = 'This cycle: air ' + facts.air + '. Built: ' + (facts.built || 'nothing new') +
    '. New advisor mail: ' + facts.newMail + '. Needs attention: ' +
    (facts.surfaceItems.length ? facts.surfaceItems.join('; ') : 'nothing');
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + GROQ, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }], max_tokens: 150, temperature: 0.4 })
    });
    if (!r.ok) return null;
    const d = await r.json();
    const out = d && d.choices && d.choices[0] ? d.choices[0].message.content : null;
    return out ? out.trim() : null;
  } catch (e) { return null; }
}

// ⬡COLD:remember:become:DAILY_BRIEFING_WONDER:20260724⬡
// CATHY.SHADOW COLD-EANEW-MEMORY-0134: this composed a founder-named cold fallback
// sentence (a real person leaked as a literal) and wrote a literal HAM to the
// retired AIBE brain, swallowing the failure and never reading back. Contained per
// the founder identity law: the HAM is env-only with no literal fallback (a
// `|| 'literal'` default is still a leak); the cold founder-named fallback prose is
// removed so no cold sentence impersonates the PAI voice; a missing identity, a
// missing brain, or a failed write now returns ok:false with a typed reason instead
// of a swallowed silent success. Routing this through the canonical memory_bank
// writer with supersede-and-readback and PAI-cycle composition remains owner CODA.
async function stampMinutes(cycleData, surface) {
  const ts = Date.now();
  const built = cycleData.built || 'nothing new';
  const chatter = await composeChatter(cycleData, surface);
  if (!chatter) {
    // No meaningful, model-composed report this cycle. No cold fallback sentence,
    // no founder name leaked, no paid impersonation of the one voice.
    return { ok: false, reason: 'no meaningful report composed for this cycle', ts: ts };
  }
  const ham = process.env.HAM_UID || process.env.FOUNDER_HAM_UID;
  if (!BU || !BK || !ham) {
    return { ok: false, reason: 'identity or brain unavailable; refusing literal-HAM retired-brain write', ts: ts };
  }
  try {
    const w = await fetch(BU + '/rest/v1/aibe_brain', { method: 'POST', headers: Object.assign({}, bh(), { 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({ ham_uid: ham, agent_global: 'EANEW', stamp_type: 'MINUTES', source: 'eanew.minutes.' + ts, acl_stamp: 'MINUTES' + ts, importance: 7, summary: '[MINUTES] ' + chatter.slice(0, 80), content: JSON.stringify({ chatter: chatter, real: true, surface: surface, built: built, ts: ts }) }) });
    if (!w || !w.ok) { return { ok: false, reason: 'brain write failed', status: (w && w.status) || null, ts: ts }; }
    return { ok: true, chatter: chatter, ts: ts };
  } catch (e) {
    return { ok: false, reason: 'brain write threw: ' + e.message, ts: ts };
  }
}


// ⬡B:eanew.runofshow:FUNCTION:deliberate:20260627⬡
// deliberate(tasks, brainState) — picks the highest-importance task that has a real spec
// Returns { chosen: task, reason: string } or { chosen: null, reason: string }
function deliberate(tasks, brainState) {
  if (!tasks || !tasks.length) return { chosen: null, reason: 'no tasks in queue' };
  // Filter to tasks that have a real spec (targetFile or spec field present and non-empty)
  const candidates = tasks
    .filter(function(t) { return t && (t.targetFile || (t.spec && (t.spec.targetFile || t.spec.label || t.spec.session))); })
    .sort(function(a, b) { return (b.importance || 0) - (a.importance || 0); });
  if (!candidates.length) return { chosen: null, reason: 'no tasks have a real spec (targetFile/spec required)' };
  const chosen = candidates[0];
  const label = (chosen.spec && (chosen.spec.label || chosen.spec.session)) || chosen.source || 'unnamed';
  return { chosen: chosen, reason: 'highest-importance task with real spec: ' + label + ' (importance ' + (chosen.importance || 0) + ')' };
}

module.exports = { checkIman, checkWren, checkAdvisors, judge, stampMinutes, deliberate };
