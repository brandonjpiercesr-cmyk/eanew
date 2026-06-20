// ⬡B:eanew.entry:MODULE:lac_full_v3:20260617⬡
// EANEW v3 -- The Life Assistant Code. Always on. Goes around the room.
// Model: google/gemini-3.1-flash-lite + Groq 70B (THINK) via OpenRouter.
// Separate service from CANEW. Never merged. Never builds. Only watches.

var express = require('express');
var app = express();
app.use(express.json());

var DOCTRINE_BIBLE = null;
var CYCLE_RUNNING = false;
var LAST_CYCLE_TS = null;

// ── PREDEFINED SESSION TASK MAP ───────────────────────────────────────────────
var SESSION_TASKS = {
  'B4': 'Build coding-department/canon/canon-grader.js\n\nExports: async function canonGrade(filePath, sessionId, hamUid)\n\n1. Read file from GitHub: GET https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/ + filePath + ?ref=main\n   Headers: { Authorization: "token " + process.env.GITHUB_TOKEN, Accept: "application/vnd.github+json" }\n   If 404: return { verdict: "CANON_GAP", gaps: [{ reason: "file_not_found" }] }\n   Decode base64.\n\n2. Cold checks: ACL stamp in first 3 lines, module.exports present, no hardcoded HAM UIDs (\\b[0-9A-F]{8}\\b), no scaffold (TODO/stub/placeholder), no DC499D0C or 9B69CF65 literals.\n\n3. Return { verdict: gaps.length === 0 ? "CANON_PASS" : "CANON_GAP", gaps, filePath, sessionId }\n\nmodule.exports = { canonGrade }\nNo scaffold. No hardcoded values. 847392 test passes.',

  'B5': 'Build coding-department/span/span-reader.js\n\nExports: async function readSpanMap(hamUid)\n\n1. GET brain: AIBE_BRAIN_URL + /rest/v1/aibe_brain?agent_global=eq.SPAN&stamp_type=eq.DIRECTIVE&source=like.span.completion_map*&ham_uid=eq. + hamUid + &order=created_at.desc&limit=1\n   Headers: apikey + Authorization + Accept-Profile: abacia_core\n2. If no rows: return { ok: false, reason: "no_span_map" }\n3. Parse content. Find first PENDING session across PhaseB through PhaseJ.\n4. Return { ok: true, nextSession, completionMap, nextPhase }\n\nmodule.exports = { readSpanMap }\nNo hardcoded values. 847392 test passes.',

  'B6': 'Build core/essence-tap.js\n\nExports: async function essenceTap(cycleId, hamUid, sourceLung)\n\n1. POST AIBEBASE_URL + /air/start body { source: "eanew_tap", cycleId, hamUid, lung: sourceLung || "lung_a", ts: Date.now() }\n2. Stamp AIR_CYCLE BEAD to brain (Content-Profile: abacia_core): agent_global AIR, summary [AIR] Essence tap + sourceLung + cycleId\n3. Return { ok: true, cycleId, tapped: "aibebase" }\nOn failure: log but never throw.\n\nmodule.exports = { essenceTap }\nNo hardcoded values.',

  'B7': 'Build anu/anu-reader.js\n\nExports: async function anuRead(hamUid)\n\n1. GET brain EANEW RESULT BEADs: filter for_anu true in content, order desc, limit 1\n2. Parse content. Determine channel: check VARA_ACTIVE BEAD within 60s -> VARA, else CC\n3. Stamp ANU RESULT BEAD with channel and summary\n4. Return { ok: true, channel, summary, sessionId, verdict }\n\nmodule.exports = { anuRead }\nNo hardcoded values. 847392 test passes.'
};

// ── AGENT MAP ─────────────────────────────────────────────────────────────────
var AGENT_MAP = {
  'CANEW':  { role: 'coding dept -- builds files, commits, deploys when EANEW dispatches', tier: 'C3', wake: 'POST /canew/build' },
  'MACE':   { role: 'architecture decisions -- multi-file or ambiguous doctrine questions', tier: 'C2' },
  'CANON':  { role: 'grades code against Wonder Contract -- CANON_PASS or CANON_GAP', tier: 'C2' },
  'SPAN':   { role: 'roadmap sequencer -- reads completion map, identifies next session', tier: 'C2' },
  'PAM':    { role: 'privacy gate -- checks output before it exits', tier: 'C2' },
  'SHADOW': { role: 'hallucination check on all outbound', tier: 'C2' },
  'WRIT':   { role: 'voice law -- no em dash, Coffee Shop Test on all copy', tier: 'C2' },
  'THINK':  { role: 'deep deliberation -- Groq 70B, fires on complex holds or ambiguous routing', tier: 'C2' },
  'QUILL':  { role: 'quality final review before any surface to Brandon', tier: 'C2' },
  'IMAN':   { role: 'email advisor -- monitors advisor inboxes per world, stamps results to brain. EANEW reads results, never queries inboxes directly.', tier: 'C2' },
  'WREN':   { role: 'SMS monitor -- inbound and outbound text via Telnyx, stamps to brain. EANEW reads results.', tier: 'C2' },
  'VARA':   { role: 'voice channel -- ElevenLabs bridge, active when Brandon is talking', tier: 'C2' },
  'ANU':    { role: 'face -- reads EANEW RESULT BEADs and routes to correct channel (CC, VARA, WREN)', tier: 'C3_face' },
  'ANEW':   { role: 'mind -- compiles C2 reports, never speaks directly to Brandon', tier: 'C3_mind' },
  'TIM':    { role: 'C0 substrate ONNX confidence scorer, in-process, nanoseconds', tier: 'C0' },
  'EANEW':  { role: 'LAC -- autonomous watcher. Wakes, goes around the room, dispatches, surfaces, sleeps. Never builds.', tier: 'C3_lac' }
};

function getAgentContext() {
  return Object.keys(AGENT_MAP).map(function(k) {
    return k + ' (' + AGENT_MAP[k].tier + '): ' + AGENT_MAP[k].role;
  }).join('\n');
}

// ── HAM UID RESOLVER ──────────────────────────────────────────────────────────
function resolveHam() {
  return process.env.EANEW_HAM_UID || process.env.HAM_UID || 'DC499D0C';
}

// ── LOAD DOCTRINE BIBLE ───────────────────────────────────────────────────────
async function loadDoctrineBible() {
  var GH = process.env.GITHUB_TOKEN;
  if (!GH) return null;
  try {
    var r = await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/canew/contents/doctrine/CANEW_DOCTRINE_BIBLE.md?ref=main',
      { headers: { Authorization: 'token ' + GH, Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    var data = await r.json();
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  } catch(e) { console.error('[EANEW] Doctrine load error:', e.message); return null; }
}

// ── BRAIN READ (generic) ──────────────────────────────────────────────────────
async function brainRead(query) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return [];
  var hdrs = { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' };
  return await fetch(BU + '/rest/v1/aibe_brain?' + query, { headers: hdrs })
    .then(function(r) { return r.json(); }).catch(function() { return []; });
}

// ── BRAIN WRITE ───────────────────────────────────────────────────────────────
async function brainWrite(bead) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return null;
  // Guarantee no orphan: every cycle bead carries a typed edge inside its content.
  // content is stored as a JSON string; parse, ensure edges[], re-stringify.
  try {
    var co = bead.content;
    if (typeof co === 'string') { try { co = JSON.parse(co); } catch (e) { co = { data: co }; } }
    if (co === null || typeof co !== 'object') co = { data: co };
    if (!Array.isArray(co.edges) || co.edges.length === 0) {
      var ham = bead.ham_uid || 'unknown_ham';
      var ag = bead.agent_global || 'EANEW';
      co.edges = [{ type: 'contains', target: ag + '.' + ham + '.cycle_log' }];
    }
    bead.content = JSON.stringify(co);
  } catch (e) { /* never block the heartbeat on edge-stamping */ }
  var r = await fetch(BU + '/rest/v1/aibe_brain', {
    method: 'POST',
    headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(bead)
  });
  var rows = await r.json();
  return rows[0];
}

// ── DOCTRINE-FED DELIBERATION (Gemini Flash Lite -- doctrine as system prefix) ─
async function deliberate(question, context, urgency) {
  var OR = process.env.OPENROUTER_API_KEY;
  if (!OR) return { answer: 'no_openrouter_key', confident: false };

  // Feed her the doctrine. This is the meat. 38K chars of context.
  var docPrefix = DOCTRINE_BIBLE
    ? 'DOCTRINE CONTEXT (authoritative -- always follow this):\n\n' + DOCTRINE_BIBLE.slice(0, 12000) + '\n\n---\n\n'
    : '';

  var agentCtx = 'AGENT MAP:\n' + getAgentContext() + '\n\n';

  var systemPrompt = docPrefix + agentCtx +
    'You are EANEW, the autonomous Life Assistant Code (LAC) for the A\u2019NEW ecosystem. ' +
    'You wake up, go around the room, check on your team, dispatch to CANEW when code is needed, ' +
    'surface to A\u2019NU when Brandon needs to know something. ' +
    'You never build. You watch. Answer in 2-3 sentences max. Be specific and direct.';

  try {
    var model = urgency === 'high' ? 'groq/llama-3.1-70b-versatile' : 'google/gemini-3.1-flash-lite';
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OR, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.AIBEBASE_URL || 'https://aibebase.onrender.com' },
      body: JSON.stringify({
        model: model, max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'CONTEXT FROM LOGFUL:\n' + context + '\n\nQUESTION: ' + question }
        ]
      })
    });
    var d = await r.json();
    var answer = d.choices && d.choices[0] ? d.choices[0].message.content.trim() : 'no_answer';
    return { answer: answer, confident: true, model: model };
  } catch(e) { return { answer: 'deliberation_error: ' + e.message.slice(0,60), confident: false }; }
}

// ── SYSTEM HEALTH CHECK ───────────────────────────────────────────────────────
async function checkSystemHealth() {
  var base = process.env.AIBEBASE_URL || 'https://aibebase.onrender.com';
  var canew = process.env.CANEW_URL || 'https://canew.onrender.com';
  var checks = [
    { name: 'canew',         url: canew + '/health' },
    { name: 'aibebase',      url: base + '/health' },
    { name: 'advisors_bdif', url: base + '/advisors/bdif/health' },
    { name: 'advisors_gmg',  url: base + '/advisors/gmg/health' },
    { name: 'advisors_med',  url: base + '/advisors/mediators/health' },
    { name: 'advisors_mha',  url: base + '/advisors/mh_action/health' }
  ];
  var results = {};
  for (var i = 0; i < checks.length; i++) {
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function(){ctrl.abort();}, 4000);
      var r = await fetch(checks[i].url, { signal: ctrl.signal }).finally(function(){clearTimeout(timer);});
      var body = {};
      try { body = await r.json(); } catch(e) {}
      results[checks[i].name] = r.ok ? 'up' : 'degraded_' + r.status;
    } catch(e) { results[checks[i].name] = 'unreachable'; }
  }
  return results;
}

// ── TEAM ACTIVITY READER ──────────────────────────────────────────────────────
async function readTeamActivity(hamUid) {
  var twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  return await brainRead(
    'agent_global=in.(IMAN,WREN,CANEW,ANU,ANEW,BDIF,MEDIATORS,GMG,MH_ACTION)' +
    '&ham_uid=eq.' + hamUid +
    '&created_at=gte.' + twoHoursAgo +
    '&order=created_at.desc&limit=40'
  );
}

// ── FOUNDER DETECTION ─────────────────────────────────────────────────────────
// Check if Brandon has been heard from recently (OMI, CARA, VARA BEADs)
async function checkFounderPresence(hamUid) {
  var fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  var rows = await brainRead(
    'stamp_type=in.(OMI_HEARD,CARA_MESSAGE,VARA_ACTIVE)' +
    '&ham_uid=eq.' + hamUid +
    '&created_at=gte.' + fiveMinutesAgo +
    '&order=created_at.desc&limit=5'
  );
  if (!rows.length) return { present: false };
  var latest = rows[0];
  var parsed = {};
  try { parsed = JSON.parse(latest.content); } catch(e) {}
  return {
    present: true,
    channel: latest.stamp_type,
    message: parsed.text || parsed.transcript || parsed.message || '',
    ts: latest.created_at
  };
}

// ── INBOUND PROCESSOR ─────────────────────────────────────────────────────────
// When IMAN/WREN stamps something new, route it
async function processInbound(teamActivity, hamUid) {
  var routed = [];
  var inboundTypes = ['IMAN', 'WREN'];

  for (var i = 0; i < teamActivity.length; i++) {
    var row = teamActivity[i];
    if (!inboundTypes.includes(row.agent_global)) continue;

    // Check if this inbound has already been processed
    var alreadyProcessed = await brainRead(
      'source=like.eanew.inbound.processed.' + row.id + '*&limit=1'
    );
    if (alreadyProcessed.length) continue;

    var content = {};
    try { content = JSON.parse(row.content); } catch(e) {}

    // Route based on agent
    var routeSummary = '';
    if (row.agent_global === 'IMAN') {
      routeSummary = '[EANEW] New email via IMAN: ' + (content.subject || row.summary || 'no subject').slice(0,60);
    } else if (row.agent_global === 'WREN') {
      routeSummary = '[EANEW] New SMS via WREN: ' + (content.body || content.text || row.summary || 'no body').slice(0,60);
    }

    // Surface to A'NU
    await brainWrite({
      ham_uid: hamUid,
      agent_global: 'EANEW',
      stamp_type: 'RESULT',
      acl_stamp: '\u2b21B:eanew.inbound.routed.' + row.agent_global + ':RESULT:routed:20260617\u2b21',
      source: 'eanew.inbound.processed.' + row.id + '.' + Date.now(),
      content: JSON.stringify({ for_anu: true, original_bead_id: row.id, agent: row.agent_global, content: content }),
      summary: routeSummary,
      importance: 8
    });

    routed.push({ agent: row.agent_global, id: row.id });
  }
  return routed;
}

// ── BRAIN CODE CONTEXT ────────────────────────────────────────────────────────
// Before deliberating on a hold, read relevant code BEADs for context
async function getBrainCodeContext(topic, hamUid) {
  var rows = await brainRead(
    'stamp_type=in.(RESULT,AIR_CYCLE,LOGFUL)' +
    '&summary=like.*' + encodeURIComponent(topic.slice(0,20)) + '*' +
    '&ham_uid=eq.' + hamUid +
    '&order=created_at.desc&limit=10'
  );
  return rows.map(function(r) { return r.summary; }).join('\n');
}

// ── SPAN MAP ──────────────────────────────────────────────────────────────────
async function readSpanMap() {
  var hamUid = resolveHam();
  var rows = await brainRead(
    'agent_global=eq.SPAN&stamp_type=eq.DIRECTIVE&source=like.span.completion_map*' +
    '&ham_uid=eq.' + hamUid + '&order=created_at.desc&limit=1'
  );
  if (!rows || !rows[0]) return null;
  try { return JSON.parse(rows[0].content); } catch(e) { return null; }
}

async function updateSpanMap(spanMap, session, verdict) {
  var hamUid = resolveHam();
  Object.keys(spanMap).filter(function(k){return k.match(/^Phase[A-Z]+$/);}).forEach(function(phase) {
    if (spanMap[phase] && spanMap[phase][session] !== undefined) {
      spanMap[phase][session] = verdict;
    }
  });
  var nextSession = null;
  var phases = Object.keys(spanMap).filter(function(k){return k.match(/^Phase[A-Z]+$/);}).sort();
  for (var i = 0; i < phases.length; i++) {
    var p = spanMap[phases[i]];
    if (p) {
      var keys = Object.keys(p);
      for (var j = 0; j < keys.length; j++) {
        if (p[keys[j]] === 'PENDING') { nextSession = keys[j]; break; }
      }
    }
    if (nextSession) break;
  }
  spanMap.next_session = nextSession;
  await brainWrite({
    ham_uid: hamUid, agent_global: 'SPAN',
    acl_stamp: '\u2b21B:span.completion_map:DIRECTIVE:session_tracking:20260617\u2b21',
    stamp_type: 'DIRECTIVE', source: 'span.completion_map.' + Date.now(),
    content: JSON.stringify(spanMap),
    summary: '[SPAN] Updated -- ' + session + '=' + verdict + ' next=' + nextSession,
    importance: 10
  });
  return spanMap;
}

// ── FIRE CANEW ────────────────────────────────────────────────────────────────
async function fireCanew(task, sessionId, retryReason, repo) {
  var CANEW = process.env.CANEW_URL || 'https://canew.onrender.com';
  var hamUid = resolveHam();
  var payload = { task: task, hamUid: hamUid, sessionId: sessionId, repo: repo || 'anew' };
  if (retryReason) payload.retryReason = retryReason;
  var r = await fetch(CANEW + '/canew/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await r.json();
}

// ── CANON GRADE ───────────────────────────────────────────────────────────────
async function canonGrade(filePath) {
  if (!filePath) return { verdict: 'CANON_GAP', gaps: [{ reason: 'no_path' }] };
  var GH = process.env.GITHUB_TOKEN;
  try {
    var r = await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/' + filePath + '?ref=main',
      { headers: { Authorization: 'token ' + GH, Accept: 'application/vnd.github+json' } });
    if (!r.ok) return { verdict: 'CANON_GAP', gaps: [{ reason: 'file_not_found_' + r.status }] };
    var data = await r.json();
    var code = Buffer.from(data.content.replace(/\n/g,''), 'base64').toString('utf8');
    var gaps = [];
    if (!/\u2b21B:/.test(code.split('\n').slice(0,5).join('\n'))) gaps.push({ clause: 'W6', reason: 'missing_acl_stamp' });
    if (!/module\.exports/.test(code)) gaps.push({ clause: 'W5', reason: 'no_module_exports' });
    if (/\b(DC499D0C|9B69CF65)\b/.test(code)) gaps.push({ clause: 'W2', reason: 'hardcoded_ham_uid' });
    if (/(TODO|stub|placeholder)/.test(code)) gaps.push({ clause: 'W5', reason: 'scaffold_detected' });
    return { verdict: gaps.length === 0 ? 'CANON_PASS' : 'CANON_GAP', gaps: gaps, filePath: filePath };
  } catch(e) {
    return { verdict: 'CANON_GAP', gaps: [{ reason: 'canon_exception: ' + e.message.slice(0,50) }] };
  }
}

// ── ESSENCE TAP ───────────────────────────────────────────────────────────────
async function essenceTap(cycleId) {
  var hamUid = resolveHam();
  var AIBEBASE = process.env.AIBEBASE_URL || 'https://aibebase.onrender.com';
  try {
    await fetch(AIBEBASE + '/air/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'eanew_tap', cycleId: cycleId, hamUid: hamUid, lung: 'lung_a', ts: Date.now() })
    });
  } catch(e) { /* never stops the cycle */ }
  await brainWrite({
    ham_uid: hamUid, agent_global: 'AIR',
    acl_stamp: '\u2b21B:essence.cycle.' + cycleId + ':SEAL:tap:20260617\u2b21',
    stamp_type: 'AIR_CYCLE', source: 'essence.cycle.' + cycleId + '.' + Date.now(),
    content: JSON.stringify({ cycleId: cycleId, lung: 'lung_a', ts: Date.now() }),
    summary: '[AIR] Essence lung_a tap -- cycle ' + cycleId, importance: 8
  });
}

// ── MEETING MINUTES ───────────────────────────────────────────────────────────
// First-person AGENT voice. Every cycle. No exceptions.
async function stampMeetingMinutes(hamUid, cycleResult, startTime, extras) {
  var elapsed = Date.now() - startTime;
  var narrative = '';
  extras = extras || {};

  if (cycleResult && cycleResult.session) {
    narrative = 'I woke up and checked SPAN. Session ' + cycleResult.session + ' was waiting. ' +
      'I dispatched it to CANEW and waited for her to build. ' +
      'CANON graded the result: ' + (cycleResult.verdict || 'unknown') + '. ' +
      (cycleResult.path ? 'File built: ' + cycleResult.path + '. ' : '') +
      'I tapped aibebase. Back to sleep. Cycle took ' + elapsed + 'ms.';
  } else if (cycleResult && cycleResult.status === 'life_check') {
    var f = cycleResult.findings || {};
    var health = extras.health || {};
    var down = Object.keys(health).filter(function(k){return health[k] !== 'up';});
    narrative = 'I woke up and went around the room. SPAN had nothing for CANEW. ' +
      'I ran health checks -- ' + (down.length ? down.join(', ') + ' unreachable' : 'all services up') + '. ' +
      'I read the team\'s recent stamps: ' + (f.holds||0) + ' hold(s), ' + (f.errors||0) + ' error(s), ' + (f.normal||0) + ' normal. ' +
      (extras.founderPresent ? 'Brandon is present on ' + extras.founderChannel + '. ' : '') +
      (extras.inboundRouted && extras.inboundRouted.length ? 'Routed ' + extras.inboundRouted.length + ' inbound message(s) to A\'NU. ' : '') +
      (cycleResult.dispatched ? 'Dispatched a fix task after deliberating. ' : '') +
      (cycleResult.surfaced ? 'Surfaced item(s) to A\'NU for Brandon. ' : '') +
      'I tapped aibebase. Cycle complete in ' + elapsed + 'ms.';
  } else {
    narrative = 'Cycle ran in ' + elapsed + 'ms. ' + JSON.stringify(cycleResult||{}).slice(0, 100);
  }

  await brainWrite({
    ham_uid: hamUid, agent_global: 'EANEW',
    acl_stamp: '\u2b21B:eanew.meeting.minutes:LOGFUL:cycle_log:20260617\u2b21',
    stamp_type: 'LOGFUL',
    source: 'eanew.minutes.' + Date.now(),
    content: JSON.stringify({ narrative: narrative, elapsed_ms: elapsed, extras: extras }),
    summary: '[EANEW MINUTES] ' + narrative.slice(0, 120),
    importance: 6
  });
}

// ── LIFE CHECK ────────────────────────────────────────────────────────────────
// Runs when SPAN has nothing. The room check. The actual LAC work.
async function lifeCheck(hamUid, cycleId) {
  var lifeStart = Date.now();
  var extras = {};

  // Step 1: Health check -- are my services alive?
  var health = await checkSystemHealth();
  extras.health = health;
  var downServices = Object.keys(health).filter(function(k){ return health[k] !== 'up'; });

  // Step 2: Is the founder present?
  var founder = await checkFounderPresence(hamUid);
  extras.founderPresent = founder.present;
  extras.founderChannel = founder.channel;
  if (founder.present && founder.message) {
    // Founder is talking. Surface immediately.
    await brainWrite({
      ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'RESULT',
      acl_stamp: '\u2b21B:eanew.founder.active:RESULT:surface:20260617\u2b21',
      source: 'eanew.founder.' + Date.now(),
      content: JSON.stringify({ for_anu: true, founder_channel: founder.channel, message: founder.message }),
      summary: '[EANEW] Founder active on ' + founder.channel + ': ' + founder.message.slice(0,60),
      importance: 10
    });
  }

  // Step 3: Read LOGFUL -- what did the team do?
  var logfulRows = await brainRead(
    'stamp_type=in.(LOGFUL,RESULT,AIR_CYCLE)&agent_global=neq.EANEW' +
    '&ham_uid=eq.' + hamUid + '&order=created_at.desc&limit=20'
  );

  // Step 4: Read team activity (IMAN, WREN, advisors, CANEW)
  var teamActivity = await readTeamActivity(hamUid);

  // Step 5: Process inbound (IMAN/WREN new messages)
  var inboundRouted = await processInbound(teamActivity, hamUid);
  extras.inboundRouted = inboundRouted;

  // Step 6: Classify all findings
  var findings = { holds: [], errors: [], needs_brandon: [], normal: [] };

  // Health errors go first
  downServices.forEach(function(s){ findings.errors.push('[HEALTH] ' + s + ': ' + health[s]); });

  // LOGFUL classification
  logfulRows.forEach(function(row) {
    var s = (row.summary || '').toLowerCase();
    if (s.includes('hold') || s.includes('canon_gap') || s.includes('canon_hold')) findings.holds.push(row.summary);
    else if (s.includes('error') || s.includes('fail') || s.includes('unreachable')) findings.errors.push(row.summary);
    else if (s.includes('for_brandon') || s.includes('needs_attention')) findings.needs_brandon.push(row.summary);
    else findings.normal.push(row.summary);
  });

  // Team activity classification
  teamActivity.forEach(function(row) {
    var s = (row.summary || '').toLowerCase();
    if (s.includes('error') || s.includes('fail')) {
      if (!findings.errors.includes(row.summary)) findings.errors.push('[TEAM] ' + row.summary);
    }
  });

  // Step 7: Deliberate on holds -- use doctrine-fed Gemini, escalate to Groq 70B if urgent
  if (findings.holds.length > 0) {
    var holdSummary = findings.holds.slice(0, 5).join('\n');
    var codeCtx = await getBrainCodeContext(findings.holds[0], hamUid);
    var urgency = findings.holds.length > 3 ? 'high' : 'normal';
    var interpretation = await deliberate(
      'What do these holds indicate and what specific action should EANEW take?',
      'HOLDS FOUND:\n' + holdSummary + '\n\nRECENT BRAIN CONTEXT:\n' + codeCtx,
      urgency
    );

    await brainWrite({
      ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'DIRECTIVE',
      acl_stamp: '\u2b21B:eanew.dispatch.hold:DIRECTIVE:deliberated:20260617\u2b21',
      source: 'eanew.dispatch.hold.' + Date.now(),
      content: JSON.stringify({
        composed_by: 'EANEW_lifeCheck',
        holds_found: findings.holds,
        action: 'review_and_retry',
        interpretation: interpretation.answer,
        deliberation_model: interpretation.model || 'unknown',
        agent_context: getAgentContext()
      }),
      summary: '[EANEW] Deliberated: ' + interpretation.answer.slice(0, 80),
      importance: 8
    });
  }

  // Step 8: Surface errors and Brandon items to A'NU
  if (findings.needs_brandon.length > 0 || findings.errors.length > 0) {
    await brainWrite({
      ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'RESULT',
      acl_stamp: '\u2b21B:eanew.surface.brandon:RESULT:needs_attention:20260617\u2b21',
      source: 'eanew.surface.' + Date.now(),
      content: JSON.stringify({ for_anu: true, errors: findings.errors, needs_brandon: findings.needs_brandon }),
      summary: '[EANEW] Surface to A\'NU: ' + (findings.errors.length + findings.needs_brandon.length) + ' item(s)',
      importance: 9
    });
    // ── PIPE FIX: Command TAP reach when surfacing high-priority items ──────────
    if (findings.needs_brandon && findings.needs_brandon.length > 0) {
      try {
        var atmR = await fetch(BU + '/rest/v1/aibe_brain?agent_global=eq.ATMOSPHERE&ham_uid=eq.' + hamUid + '&order=created_at.desc&limit=1', { headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' } });
        var atmD = await atmR.json();
        var bPhone = atmD && atmD[0] && JSON.parse(atmD[0].content || '{}').phone;
        if (bPhone) {
          var tapMsg = findings.needs_brandon[0] ? findings.needs_brandon[0].slice(0, 140) : "Hey — I found something for you.";
          await fetch('https://aibebase.onrender.com/tap/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: bPhone, message: tapMsg, hamUid: hamUid }) });
        }
      } catch(e) { /* tap failure never breaks cycle */ }
    }
  }

  // Step 9: Tap the other lung
  await essenceTap(cycleId);

  var lifeResult = {
    ok: true, status: 'life_check',
    findings: { holds: findings.holds.length, errors: findings.errors.length, needs_brandon: findings.needs_brandon.length, normal: findings.normal.length },
    dispatched: findings.holds.length > 0,
    surfaced: (findings.needs_brandon.length + findings.errors.length) > 0,
    inbound_routed: inboundRouted.length,
    founder_present: founder.present
  };

  // Step 10: Meeting minutes (first-person AGENT voice)
  await stampMeetingMinutes(hamUid, lifeResult, lifeStart, extras);

  return lifeResult;
}

// ── MAIN RUN CYCLE ────────────────────────────────────────────────────────────

// ── CLAIR PIPE FIX: deploy-poll-verify (runtime, not a file) ─────────────────
// EANEW makes the real Render deploy call after CANON_PASS, polls to live, verifies.
// This is the act-read-loop the relay uses. Done = live, not committed.
async function deployAndVerify(targetSvc) {
  var RK = process.env.RENDER_API_KEY;
  if (!RK) return { deployed: false, reason: 'no render key' };
  var svc = targetSvc || 'srv-d8lpvjcvikkc73bolec0'; // aibebase by default
  try {
    var trig = await fetch('https://api.render.com/v1/services/' + svc + '/deploys', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + RK, 'Content-Type': 'application/json' }, body: '{}'
    });
    var td = await trig.json();
    var deployId = td.id;
    if (!deployId) return { deployed: false, reason: 'no deploy id' };
    // Poll up to 18 times (3 min)
    for (var i = 0; i < 18; i++) {
      await new Promise(function(r){ setTimeout(r, 10000); });
      var pr = await fetch('https://api.render.com/v1/services/' + svc + '/deploys/' + deployId, {
        headers: { 'Authorization': 'Bearer ' + RK }
      });
      var pd = await pr.json();
      var status = pd.status;
      if (status === 'live') {
        // Verify health
        try {
          var hr = await fetch('https://aibebase.onrender.com/health');
          var hd = await hr.json();
          return { deployed: true, status: 'live', health: hd.status, deployId: deployId };
        } catch(e) { return { deployed: true, status: 'live', health: 'unverified', deployId: deployId }; }
      }
      if (status === 'update_failed' || status === 'canceled' || status === 'build_failed') {
        return { deployed: false, status: status, deployId: deployId };
      }
    }
    return { deployed: false, status: 'timeout', deployId: deployId };
  } catch(e) { return { deployed: false, reason: e.message }; }
}

async function runCycle() {
  var hamUid = resolveHam();
  var cycleId = 'eanew_' + Date.now();
  var cycleStart = Date.now();
  LAST_CYCLE_TS = cycleStart;
  console.log('[EANEW] Cycle start:', cycleId, 'HAM:', hamUid);

  // Step 0 (run-of-show): reach the human. The reach IS the surface; the cycle drives it.
  // When a reach test is active, EANEW taps the reach sweep so each cycle reaches Brandon once
  // per channel (the sweep is one-per-channel, council-gated). Reaching flows from the cycle.
  if (process.env.REACH_TEST_ACTIVE === 'on') {
    try {
      var reachBase = process.env.AIBEBASE_URL || 'https://aibebase.onrender.com';
      // mint the intents for this cycle's reach, then sweep to send one per channel
      await fetch(reachBase + '/reach/test/tick', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hamUid: hamUid, startedAt: new Date(Date.now() - 1800000).toISOString() })
      }).catch(function () {});
      var sweepResp = await fetch(reachBase + '/reach/sweep', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hamUid: hamUid })
      });
      var sweepData = await sweepResp.json().catch(function () { return {}; });
      console.log('[EANEW] Cycle reach: swept', (sweepData && sweepData.processed) || 0, 'mode', (sweepData && sweepData.mode) || '?');
    } catch (e) {
      console.error('[EANEW] cycle reach error (cycle continues):', e && e.message);
    }
  }

  // Step 1: Check SPAN -- is there roadmap work?
  var spanMap = await readSpanMap();
  if (!spanMap) {
    console.log('[EANEW] No SPAN map -- entering life check');
    return await lifeCheck(hamUid, cycleId);
  }

  var nextSession = spanMap.next_session;
  if (!nextSession) {
    console.log('[EANEW] SPAN empty -- entering life check');
    return await lifeCheck(hamUid, cycleId);
  }

  // Step 2: Get predefined task
  var task = SESSION_TASKS[nextSession];
  if (!task) {
    var taskRows = await brainRead(
      'agent_global=eq.SPAN&stamp_type=eq.DIRECTIVE&source=like.span.task.' + nextSession + '*' +
      '&ham_uid=eq.' + hamUid + '&order=created_at.desc&limit=1'
    );
    if (taskRows[0]) {
      var taskRepo = 'anew';
    try { var tc = JSON.parse(taskRows[0].content); task = tc.task; if (tc.repo) taskRepo = tc.repo; } catch(e) {}
    }
    if (!task) {
      console.log('[EANEW] No task for session', nextSession);
      return { status: 'hold', reason: 'no_task_for_' + nextSession };
    }
  }

  console.log('[EANEW] Dispatching', nextSession, 'to CANEW...');

  // Step 3: Fire CANEW
  var canewResult = await fireCanew(task, nextSession, null, taskRepo);
  if (!canewResult.ok) {
    canewResult = await fireCanew(task, nextSession, 'retry: first attempt failed -- ' + canewResult.reason, taskRepo);
  }

  // Step 4: Grade with CANON -- if GAP, deliberate and retry up to 3 times
  var canon = await canonGrade(canewResult.path);
  var verdict = canon.verdict;
  console.log('[EANEW] CANON:', nextSession, verdict, canon.gaps ? JSON.stringify(canon.gaps) : '');

  // EANEW catches the gap and fixes the task herself -- up to 3 attempts
  var retryTask = task;
  var retryAttempt = 0;
  while (verdict !== 'CANON_PASS' && retryAttempt < 3) {
    retryAttempt++;
    console.log('[EANEW] CANON_GAP attempt', retryAttempt, '-- deliberating on fix...');

    // Deliberate on what went wrong and how to fix the task
    var gapContext = 'CANON found these gaps: ' + JSON.stringify(canon.gaps || []) + '. The task was: ' + retryTask.slice(0, 500);
    var fixAdvice = await deliberate('CANEW built this but CANON flagged gaps. What specific change to the task description would fix these gaps? Be precise and short.', gapContext, 'normal');

    // Rewrite the task with the fix advice prepended
    retryTask = 'IMPORTANT FIX FOR RETRY ' + retryAttempt + ': ' + fixAdvice.answer + '\n\nORIGINAL TASK:\n' + retryTask;

    // Retry CANEW with the improved task
    canewResult = await fireCanew(retryTask, nextSession + '_retry' + retryAttempt, 'gap_fix: ' + (canon.gaps || []).map(function(g){return g.reason}).join(', '), taskRepo);
    if (!canewResult.ok) break;

    // Regrade
    canon = await canonGrade(canewResult.path);
    verdict = canon.verdict;
    console.log('[EANEW] CANON retry', retryAttempt, ':', verdict);
  }

  // Step 5: Update SPAN
  spanMap = await updateSpanMap(spanMap, nextSession, verdict === 'CANON_PASS' ? 'PASS' : 'PARTIAL');

  // Step 6: Stamp result for A'NU
  await brainWrite({
    ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'RESULT',
    acl_stamp: '\u2b21B:eanew.result.' + nextSession + ':RESULT:' + verdict + ':20260617\u2b21',
    source: 'eanew.result.' + nextSession + '.' + Date.now(),
    content: JSON.stringify({ sessionId: nextSession, path: canewResult.path, verdict: verdict, for_anu: true, canon_gaps: canon.gaps }),
    summary: '[EANEW] Session ' + nextSession + ' ' + verdict + (canewResult.path ? ' -- ' + canewResult.path : ''),
    importance: verdict === 'CANON_PASS' ? 9 : 6
  });

  if (verdict === 'CANON_PASS') {
    // Step 6b: DEPLOY. A committed file is not done. EANEW triggers the real deploy,
    // polls to live, verifies health. If it fails, the build is NOT sealed.
    var deployResult = { deployed: false, status: 'not_attempted' };
    var pathStr = canewResult.path || '';
    var needsDeploy = pathStr && (pathStr.indexOf('.js') > -1) && pathStr.indexOf('coding-department/') === -1;
    if (needsDeploy) {
      deployResult = await deployAndVerify('srv-d8lpvjcvikkc73bolec0');
    }
    await brainWrite({
      ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'AIR_CYCLE',
      acl_stamp: '\u2b21B:eanew.seal.' + nextSession + ':SEAL:complete:20260617\u2b21',
      source: 'eanew.seal.' + nextSession + '.' + Date.now(),
      content: JSON.stringify({ session: nextSession, path: canewResult.path, cycleId: cycleId, deploy: deployResult }),
      summary: '[EANEW] SEAL -- ' + nextSession + (needsDeploy ? (deployResult.deployed ? ' deployed LIVE' : ' DEPLOY FAILED: ' + (deployResult.status||deployResult.reason)) : ' (no deploy needed)'),
      importance: 9
    });
    // If deploy failed, surface it -- this build is not actually done
    if (needsDeploy && !deployResult.deployed) {
      await brainWrite({
        ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'RESULT',
        acl_stamp: '\u2b21B:eanew.deploy.failed:RESULT:needs_attention:20260619\u2b21',
        source: 'eanew.deploy.failed.' + Date.now(),
        content: JSON.stringify({ for_anu: true, needs_brandon: ['Build ' + nextSession + ' passed CANON but the deploy failed: ' + (deployResult.status || deployResult.reason) + '. The code is committed but not live.'], session: nextSession }),
        summary: '[EANEW] Deploy failed for ' + nextSession + ' -- committed but not live', importance: 9
      });
    }
  }

  // Step 7: Tap other lung
  await essenceTap(cycleId);

  // Step 8: Meeting minutes
  var cycleResult = { session: nextSession, verdict: verdict, path: canewResult.path };
  await stampMeetingMinutes(hamUid, cycleResult, cycleStart, {});

  console.log('[EANEW] Cycle done:', nextSession, verdict);
  return { cycleId: cycleId, session: nextSession, verdict: verdict, path: canewResult.path, nextSession: spanMap.next_session };
}

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────
app.get('/health', function(req, res) {
  res.json({
    ok: true, service: 'EANEW', version: 'v3',
    model: 'google/gemini-3.1-flash-lite (normal) / groq/llama-3.1-70b-versatile (high urgency)',
    doctrine_loaded: DOCTRINE_BIBLE ? DOCTRINE_BIBLE.length + ' chars' : 'NOT LOADED',
    cycle_running: CYCLE_RUNNING,
    last_cycle: LAST_CYCLE_TS ? new Date(LAST_CYCLE_TS).toISOString() : 'never',
    sessions_defined: Object.keys(SESSION_TASKS),
    agents_known: Object.keys(AGENT_MAP).length,
    ham_uid: resolveHam()
  });
});

app.get('/', function(req, res) { res.json({ ok: true, service: 'EANEW', version: 'v3' }); });

app.post('/eanew/cycle', async function(req, res) {
  if (CYCLE_RUNNING) return res.json({ ok: false, reason: 'cycle_already_running' });
  CYCLE_RUNNING = true;
  try {
    var result = await runCycle();
    res.json({ ok: true, result: result });
  } catch(e) {
    console.error('[EANEW] Cycle error:', e.message);
    res.json({ ok: false, error: e.message });
  } finally { CYCLE_RUNNING = false; }
});

app.post('/eanew/report', async function(req, res) {
  var body = req.body || {};
  var hamUid = resolveHam();
  await brainWrite({
    ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'RESULT',
    acl_stamp: '\u2b21B:eanew.report.' + Date.now() + ':RESULT:received:20260617\u2b21',
    source: 'eanew.report.' + Date.now(),
    content: JSON.stringify(body),
    summary: '[EANEW] ' + (body.summary || 'report received'), importance: 6
  });
  res.json({ ok: true });
});

// ── CONSULT: present a finding/vision to EANEW, get her business-analyst read ──
// No cycle, no CANEW dispatch, no outbound. Exposes her deliberation as a channel.
app.post('/eanew/ask', async function(req, res) {
  var body = req.body || {};
  var question = body.question || '';
  if (!question) return res.json({ ok: false, reason: 'no_question' });
  var context = body.context || '';
  var hamUid = body.hamUid || resolveHam();
  var OR = process.env.OPENROUTER_API_KEY;
  if (!OR) return res.json({ ok: false, reason: 'no_openrouter_key' });
  var model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite';
  var docPrefix = DOCTRINE_BIBLE ? 'DOCTRINE CONTEXT (authoritative -- always follow):\n\n' + DOCTRINE_BIBLE.slice(0, 12000) + '\n\n---\n\n' : '';
  var systemPrompt = docPrefix + 'AGENT MAP:\n' + getAgentContext() + '\n\n' +
    'You are EANEW, the autonomous Life Assistant Code for the A\u2019NEW ecosystem, acting as Brandon\u2019s business technical analyst. ' +
    'A finding or vision is presented to you. Give your read: name the IT solution, say where it sequences against SPAN and whether it should go now, ' +
    'state what CANEW would actually build, and call any risk. You never build -- you analyze and direct. Be specific and direct, 4-6 sentences.';
  try {
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OR, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.AIBEBASE_URL || 'https://aibebase.onrender.com' },
      body: JSON.stringify({ model: model, max_tokens: 500, messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'PRESENTED:\n' + question + (context ? '\n\nCONTEXT:\n' + context : '') }
      ]})
    });
    var d = await r.json();
    var answer = d.choices && d.choices[0] ? d.choices[0].message.content.trim() : ('no_answer: ' + JSON.stringify(d).slice(0, 200));
    await brainWrite({
      ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'RESULT',
      acl_stamp: '\u2b21B:eanew.consult.' + Date.now() + ':RESULT:ba_read:20260619\u2b21',
      source: 'eanew.consult.' + Date.now(),
      content: JSON.stringify({ question: question, answer: answer, model: model }),
      summary: '[EANEW] BA read: ' + question.slice(0, 80), importance: 7
    });
    res.json({ ok: true, answer: answer, model: model });
  } catch (e) { res.json({ ok: false, error: e.message.slice(0, 140) }); }
});

// ── AUTO-LOOP: recursive, never setInterval ───────────────────────────────────
async function autoLoop() {
  try {
    if (!CYCLE_RUNNING) { await runCycle(); }
  } catch(e) {
    console.error('[EANEW] Auto-loop error:', e.message);
  }
  var delay = parseInt(process.env.CYCLE_DELAY_MS || '300000');
  setTimeout(autoLoop, delay);
}

loadDoctrineBible().then(function(b) {
  DOCTRINE_BIBLE = b;
  console.log('[EANEW] Doctrine loaded:', b ? b.length + ' chars' : 'MISSING');
  console.log('[EANEW] Agents known:', Object.keys(AGENT_MAP).length);
  console.log('[EANEW] HAM:', resolveHam());
  autoLoop();
  console.log('[EANEW] Auto-loop started. Fires every', (parseInt(process.env.CYCLE_DELAY_MS||'300000')/60000).toFixed(1), 'min.');
}).catch(function(e) { console.error('[EANEW] Startup error:', e.message); });

var port = process.env.PORT || 10001;
app.listen(port, function() { console.log('[EANEW] Listening on', port); });
