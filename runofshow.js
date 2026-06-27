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

// Judgment layer: decide what needs Brandon's eyes
function judge(cycleData) {
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

// First-person meeting minutes — A'NEW's voice about what she did this cycle
async function stampMinutes(cycleData, surface) {
  const ts = Date.now();
  const built = cycleData.built || 'nothing new';
  const parts = [];
  parts.push('This cycle I checked the air and it was ' + (cycleData.air ? 'flowing' : 'still') + '.');
  if (cycleData.built) parts.push('I dispatched a build and it landed: ' + cycleData.built + '.');
  if (cycleData.iman && cycleData.iman.newMail > 0) parts.push('Saw ' + cycleData.iman.newMail + ' new emails in the advisor inboxes.');
  if (surface.length) parts.push('Flagging for Brandon: ' + surface.join('; ') + '.');
  else parts.push('Nothing needs Brandon right now, everything is steady.');
  const chatter = parts.join(' ');
  try {
    await fetch(BU + '/rest/v1/aibe_brain', { method: 'POST', headers: Object.assign({}, bh(), { 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({ ham_uid: 'DC499D0C', agent_global: 'EANEW', stamp_type: 'MINUTES', source: 'eanew.minutes.' + ts, acl_stamp: 'MINUTES' + ts, importance: 7, summary: '[MINUTES] ' + chatter.slice(0, 80), content: JSON.stringify({ chatter: chatter, surface: surface, built: built, ts: ts }) }) });
  } catch(e) {}
  return chatter;
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
