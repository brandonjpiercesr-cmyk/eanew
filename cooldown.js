// ⧆B:eanew.cooldown:MODULE:backoff:20260628⧆
// Cooldown module — prevents Overseer from hammering brain when queue is empty
// Keyholder wire-fix: Overseer was making 3+ brain queries every 5s with empty queue,
// saturating Supabase and causing system-wide 2-12 second response times.
// ⬡B:eanew:WIRE:funneled_to_one_bank:20260716⬡ Table and schema from env, legacy defaults.
var BEAD_TBL = process.env.BEAD_TABLE || 'aibe_brain'; // funnel: one department, one bank
var BR_SCHEMA = process.env.BRAIN_SCHEMA || BR_SCHEMA;


async function shouldSkipCycle(brainUrl, brainKey) {
  if (!brainUrl || !brainKey) return false;
  var bh = { apikey: brainKey, Authorization: 'Bearer ' + brainKey, 'Accept-Profile': BR_SCHEMA };
  try {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(); }, 5000);
    var r = await fetch(
      brainUrl + '/rest/v1/'+BEAD_TBL+'?stamp_type=eq.SPAN_DISPATCH_COOLDOWN&source=like.eanew.cooldown*&order=created_at.desc&limit=1&select=content',
      { headers: bh, signal: ctrl.signal }
    );
    var rows = await r.json();
    if (!rows || !rows.length) return false;
    var c = rows[0].content || {};
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch(e) {} }
    var age = Date.now() - (c.ts || 0);
    return age < 5 * 60 * 1000; // skip if stamped less than 5 minutes ago
  } catch(e) { return false; }
}

async function stampCooldown(brainUrl, brainKey, hamUid) {
  if (!brainUrl || !brainKey) return;
  var bh = { apikey: brainKey, Authorization: 'Bearer ' + brainKey,
    'Accept-Profile': BR_SCHEMA, 'Content-Profile': BR_SCHEMA,
    'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
  var bead = { ham_uid: hamUid || process.env.HAM_UID || 'SYSTEM',
    agent_global: 'EANEW', stamp_type: 'SPAN_DISPATCH_COOLDOWN',
    source: 'eanew.cooldown.' + Date.now(),
    acl_stamp: '⧆B:eanew:COOLDOWN:backoff:20260628⧆',
    importance: 1, summary: '[COOLDOWN] queue empty — backing off',
    content: JSON.stringify({ ts: Date.now(), reason: 'empty_queue' }) };
  try {
    await fetch(brainUrl + '/rest/v1/'+BEAD_TBL+'',
      { method: 'POST', headers: bh, body: JSON.stringify(bead) });
  } catch(e) {}
}

module.exports = { shouldSkipCycle: shouldSkipCycle, stampCooldown: stampCooldown };
