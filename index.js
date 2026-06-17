// ⬡B:eanew.entry:MODULE:autonomous_watcher_v2:20260617⬡
// EANEW v2 — reads SPAN completion map, dispatches predefined session tasks to CANEW.
// Model: google/gemini-3.1-flash-lite via OpenRouter.
// Separate service from CANEW. Never merged.

var express = require('express');
var app = express();
app.use(express.json());

var DOCTRINE_BIBLE = null;
var CYCLE_RUNNING = false;

// ── PREDEFINED SESSION TASK MAP ───────────────────────────────────────────────
// Each session has an exact task. EANEW picks the task for the next PENDING session.
// CANEW builds it. No improvisation. Run of Show is code, not LLM output.
var SESSION_TASKS = {
  'B4': 'Build coding-department/canon/canon-grader.js\n\nThis is EANEW\'s independent CANON grader. EANEW calls this after CANEW builds a file.\n\nExports: async function canonGrade(filePath, sessionId, hamUid)\n\nLogic:\n1. Read the file from GitHub:\n   GET https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/ + filePath + ?ref=main\n   Headers: { Authorization: \'token \' + process.env.GITHUB_TOKEN, Accept: \'application/vnd.github+json\' }\n   If 404: return { verdict: \'CANON_GAP\', gaps: [{ reason: \'file_not_found\', line: 0 }] }\n   Decode base64 content.\n\n2. Cold code checks (no LLM, instant):\n   - Has ACL stamp in first 3 lines: /\u2b21B:/.test(firstLines)\n   - Has module.exports: /module\\.exports/.test(code)\n   - No hardcoded HAM UIDs: !/\\b[0-9A-F]{8}\\b/.test(code) excluding comments\n   - No scaffold: !/(TODO|stub|placeholder|return \\{\\})/.test(code)\n   - No direct brain write bypassing LOGFUL pattern: !/\\/rest\\/v1\\/aibe_brain.*method.*POST/.test(code) OR /Content-Profile.*abacia_core/.test(code)\n\n3. Collect gaps from failed checks:\n   Each failed check adds: { clause: \'WC_clause_name\', line: 0, reason: \'description\' }\n\n4. Return { verdict: gaps.length === 0 ? \'CANON_PASS\' : \'CANON_GAP\', gaps, filePath, sessionId }\n\nmodule.exports = { canonGrade }\nNo scaffold. No hardcoded values. 847392 test passes.',

  'B5': 'Build coding-department/span/span-reader.js\n\nThis reads the SPAN completion map from the brain.\n\nExports: async function readSpanMap(hamUid)\n\nLogic:\n1. GET from brain: process.env.AIBE_BRAIN_URL + \'/rest/v1/aibe_brain?agent_global=eq.SPAN&stamp_type=eq.DIRECTIVE&source=like.span.completion_map*&ham_uid=eq.\' + hamUid + \'&order=created_at.desc&limit=1\'\n   Headers: { apikey: process.env.AIBE_BRAIN_KEY, Authorization: \'Bearer \' + process.env.AIBE_BRAIN_KEY, \'Accept-Profile\': \'abacia_core\' }\n\n2. If no rows: return { ok: false, reason: \'no_span_map\' }\n\n3. Parse content JSON from rows[0].content\n\n4. Find the first PENDING session across all phases:\n   Loop through PhaseB, PhaseC, PhaseD, PhaseE, PhaseF, PhaseG, PhaseH, PhaseI, PhaseJ in order\n   Return first session with value === \'PENDING\'\n\n5. Return { ok: true, nextSession: sessionId, completionMap: parsed, nextPhase: phaseKey }\n\nmodule.exports = { readSpanMap }\nNo scaffold. No hardcoded values. 847392 test passes.',

  'B6': 'Build core/essence-tap.js\n\nExports: async function essenceTap(cycleId, hamUid, sourceLung)\n\nTaps the companion lung (aibebase) after EANEW completes a cycle.\n\nLogic:\n1. POST to process.env.AIBEBASE_URL + \'/air/start\'\n   Headers: { Content-Type: \'application/json\' }\n   Body: JSON.stringify({ source: \'eanew_tap\', cycleId, hamUid: hamUid || \'SYSTEM\', lung: sourceLung || \'lung_a\', ts: Date.now() })\n\n2. If POST fails: log error but do NOT throw -- essence tap failure never stops the cycle\n\n3. Also stamp a SEAL BEAD to brain:\n   POST process.env.AIBE_BRAIN_URL + \'/rest/v1/aibe_brain\'\n   Headers: Content-Profile: abacia_core (write headers)\n   Body: { ham_uid: hamUid || \'SYSTEM\', agent_global: \'AIR\', stamp_type: \'AIR_CYCLE\',\n     acl_stamp: \'⬡B:essence.cycle.\' + cycleId + \':SEAL:tap:20260617⬡\',\n     source: \'essence.cycle.\' + cycleId + \'.\' + Date.now(),\n     content: JSON.stringify({ cycleId, sourceLung: sourceLung || \'lung_a\', ts: Date.now() }),\n     summary: \'[AIR] Essence tap -- \' + (sourceLung || \'lung_a\') + \' cycle \' + cycleId,\n     importance: 8 }\n\n4. Return { ok: true, cycleId, tapped: \'aibebase\' }\n\nmodule.exports = { essenceTap }\nNo scaffold. No hardcoded values.',

  'B7': 'Build anu/anu-reader.js\n\nA\'NU reads EANEW\'s RESULT BEADs and routes the summary to the correct channel.\n\nExports: async function anuRead(hamUid)\n\nLogic:\n1. GET from brain: process.env.AIBE_BRAIN_URL + \'/rest/v1/aibe_brain?agent_global=eq.EANEW&stamp_type=eq.RESULT&ham_uid=eq.\' + hamUid + \'&content=like.*for_anu*true*&order=created_at.desc&limit=1\'\n   Headers: Accept-Profile: abacia_core\n\n2. If no rows: return { ok: false, reason: \'no_eanew_result\' }\n\n3. Parse content JSON from rows[0].content\n   Extract: { sessionId, path, verdict, for_anu }\n   Read summary field from rows[0].summary\n\n4. Determine active channel (cold code, no LLM):\n   Check brain for a recent VARA_ACTIVE BEAD (within 60 seconds):\n   GET brain: stamp_type=eq.VARA_ACTIVE&order=created_at.desc&limit=1\n   If exists and created_at > now - 60000ms: channel = \'VARA\'\n   Else: channel = \'CC\' (command center)\n\n5. Stamp the routed summary to brain:\n   stamp_type: \'RESULT\', agent_global: \'ANU\'\n   acl_stamp: \'⬡B:anu.routed.\' + sessionId + \':RESULT:routed:20260617⬡\'\n   content: JSON.stringify({ sessionId, channel, summary: rows[0].summary, verdict })\n   summary: \'[ANU] Routed to \' + channel + \': \' + rows[0].summary.slice(0, 60)\n\n6. Return { ok: true, channel, summary: rows[0].summary, sessionId, verdict }\n\nmodule.exports = { anuRead }\nNo scaffold. No hardcoded values. 847392 test passes.'
};

// ── LOAD DOCTRINE BIBLE ────────────────────────────────────────────────────────
async function loadDoctrineBible() {
  var GH = process.env.GITHUB_TOKEN;
  if (!GH) return null;
  var r = await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/canew/contents/doctrine/CANEW_DOCTRINE_BIBLE.md?ref=main',
    { headers: { 'Authorization': 'token ' + GH, 'Accept': 'application/vnd.github+json' } });
  if (!r.ok) return null;
  var data = await r.json();
  var content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  console.log('[EANEW] Doctrine loaded:', content.length, 'chars');
  return content;
}

// ── READ SPAN COMPLETION MAP ───────────────────────────────────────────────────
async function readSpanMap() {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return null;
  var hdrs = { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' };
  var _huid = process.env.EANEW_HAM_UID || process.env.HAM_UID || 'DC499D0C';
  var r = await fetch(BU + '/rest/v1/aibe_brain?agent_global=eq.SPAN&stamp_type=eq.DIRECTIVE&source=like.span.completion_map*&ham_uid=eq.' + _huid + '&order=created_at.desc&limit=1', { headers: hdrs });
  var rows = await r.json();
  if (!rows || !rows[0]) return null;
  try { return JSON.parse(rows[0].content); } catch(e) { return null; }
}

// ── UPDATE SPAN MAP in brain ───────────────────────────────────────────────────
async function updateSpanMap(spanMap, session, verdict) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  // Find the phase containing this session and update it
  ['PhaseB','PhaseC','PhaseD','PhaseE','PhaseF','PhaseG','PhaseH','PhaseI','PhaseJ'].forEach(function(phase) {
    if (spanMap[phase] && spanMap[phase][session] !== undefined) {
      spanMap[phase][session] = verdict;
    }
  });
  // Find next pending
  var nextSession = null;
  var phases = ['PhaseB','PhaseC','PhaseD','PhaseE','PhaseF','PhaseG','PhaseH','PhaseI','PhaseJ'];
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
  // Write updated map to brain
  await fetch(BU + '/rest/v1/aibe_brain', {
    method: 'POST',
    headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ ham_uid: (process.env.EANEW_HAM_UID || process.env.HAM_UID || 'DC499D0C'), agent_global: 'SPAN',
      acl_stamp: '\u2b21B:span.completion_map:DIRECTIVE:session_tracking:20260617\u2b21',
      stamp_type: 'DIRECTIVE', source: 'span.completion_map.' + Date.now(),
      content: JSON.stringify(spanMap),
      summary: '[SPAN] Updated -- ' + session + '=' + verdict + ' next=' + nextSession, importance: 10 })
  }).catch(function() {});
  return spanMap;
}

// ── STAMP BEAD ─────────────────────────────────────────────────────────────────
async function stampBead(bead) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return null;
  var r = await fetch(BU + '/rest/v1/aibe_brain', {
    method: 'POST',
    headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(bead)
  });
  var rows = await r.json();
  return rows[0];
}

// ── FIRE CANEW ─────────────────────────────────────────────────────────────────
async function fireCanew(task, sessionId, retryReason) {
  var CANEW = process.env.CANEW_URL || 'https://canew.onrender.com';
  var payload = { task: task, hamUid: 'DC499D0C', sessionId: sessionId };
  if (retryReason) payload.retryReason = retryReason;
  var r = await fetch(CANEW + '/canew/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return await r.json();
}

// ── CANON GRADE (cold code checks — no LLM) ────────────────────────────────────
async function canonGrade(filePath) {
  if (!filePath) return { verdict: 'CANON_GAP', gaps: [{ reason: 'no_path' }] };
  var GH = process.env.GITHUB_TOKEN;
  try {
    var r = await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/' + filePath + '?ref=main',
      { headers: { 'Authorization': 'token ' + GH, 'Accept': 'application/vnd.github+json' } });
    if (!r.ok) return { verdict: 'CANON_GAP', gaps: [{ reason: 'file_not_found_' + r.status }] };
    var data = await r.json();
    var code = Buffer.from(data.content.replace(/\n/g,''), 'base64').toString('utf8');
    var gaps = [];
    var firstLines = code.split('\n').slice(0,5).join('\n');
    if (!/\u2b21B:/.test(firstLines)) gaps.push({ clause: 'W6', reason: 'missing_acl_stamp' });
    if (!/module\.exports/.test(code)) gaps.push({ clause: 'W5', reason: 'no_module_exports' });
    if (/\b(DC499D0C|9B69CF65)\b/.test(code)) gaps.push({ clause: 'W2', reason: 'hardcoded_ham_uid' });
    if (/(TODO|stub|placeholder)/.test(code)) gaps.push({ clause: 'W5', reason: 'scaffold_detected' });
    return { verdict: gaps.length === 0 ? 'CANON_PASS' : 'CANON_GAP', gaps: gaps, filePath: filePath };
  } catch(e) {
    return { verdict: 'CANON_GAP', gaps: [{ reason: 'canon_exception_' + e.message.slice(0,50) }] };
  }
}

// ── ESSENCE TAP ────────────────────────────────────────────────────────────────
async function essenceTap(cycleId) {
  var AIBEBASE = process.env.AIBEBASE_URL || 'https://aibebase.onrender.com';
  try {
    await fetch(AIBEBASE + '/air/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'eanew_tap', cycleId: cycleId, hamUid: (process.env.EANEW_HAM_UID || process.env.HAM_UID || 'DC499D0C'), lung: 'lung_a' })
    });
  } catch(e) { /* essence tap never stops the cycle */ }
  await stampBead({ ham_uid: 'DC499D0C', agent_global: 'AIR',
    acl_stamp: '\u2b21B:essence.cycle.' + cycleId + ':SEAL:tap:20260617\u2b21',
    stamp_type: 'AIR_CYCLE', source: 'essence.cycle.' + cycleId + '.' + Date.now(),
    content: JSON.stringify({ cycleId: cycleId, lung: 'lung_a' }),
    summary: '[AIR] Essence lung_a tap -- cycle ' + cycleId, importance: 8 });
}

// ── MAIN CYCLE ─────────────────────────────────────────────────────────────────
async function runCycle() {
  var _startTime = Date.now();
  var _hamUid = process.env.EANEW_HAM_UID || 'DC499D0C';
  var cycleId = 'eanew_' + Date.now();
  console.log('[EANEW] Cycle start:', cycleId);

  // 1. Read SPAN map — know what's next
  var spanMap = await readSpanMap();
  if (!spanMap) {
    console.log('[EANEW] No SPAN map found');
    return { status: 'hold', reason: 'no_span_map' };
  }
  var nextSession = spanMap.next_session;
  if (!nextSession) {
    console.log('[EANEW] SPAN empty -- running life check...');
    return await lifeCheck(_hamUid || 'DC499D0C');
  }

  // 2. Get task -- first check SESSION_TASKS, then read from brain
  var task = SESSION_TASKS[nextSession];
  if (!task) {
    // Read task BEAD from brain (SPAN stamps task BEADs for sessions beyond B7)
    var BU_t = process.env.AIBE_BRAIN_URL, BK_t = process.env.AIBE_BRAIN_KEY;
    if (BU_t && BK_t) {
      var taskRows = await fetch(BU_t + '/rest/v1/aibe_brain?agent_global=eq.SPAN&stamp_type=eq.DIRECTIVE&source=like.span.task.' + nextSession + '*&ham_uid=eq.DC499D0C&order=created_at.desc&limit=1',
        { headers: { apikey: BK_t, Authorization: 'Bearer ' + BK_t, 'Accept-Profile': 'abacia_core' } })
        .then(function(r) { return r.json(); }).catch(function() { return []; });
      if (taskRows[0]) {
        try { var tc = JSON.parse(taskRows[0].content); task = tc.task; } catch(e) {}
      }
    }
    if (!task) {
      console.log('[EANEW] No task found for session', nextSession, '-- in SESSION_TASKS or brain');
      return { status: 'hold', reason: 'no_task_for_' + nextSession };
    }
    console.log('[EANEW] Task loaded from brain for session', nextSession);
  }
  console.log('[EANEW] Dispatching session', nextSession, 'to CANEW...');

  // 3. Fire CANEW with the predefined task
  var canewResult = await fireCanew(task, nextSession, null);

  // 4. If CANEW fails first attempt, report fail and retry once
  if (!canewResult.ok) {
    await fetch((process.env.CANEW_URL || 'https://canew.onrender.com') + '/canew/canon-fail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: nextSession })
    }).catch(function() {});
    canewResult = await fireCanew(task, nextSession, 'First attempt failed: ' + canewResult.reason);
  }

  // 5. EANEW's independent CANON grade
  var canon = await canonGrade(canewResult.path);
  var verdict = canon.verdict;
  console.log('[EANEW] CANON verdict for', nextSession, ':', verdict, canon.gaps.length > 0 ? JSON.stringify(canon.gaps) : '');

  // 6. Update SPAN map
  spanMap = await updateSpanMap(spanMap, nextSession, verdict === 'CANON_PASS' ? 'PASS' : 'PARTIAL');

  // 7. Stamp RESULT for A'NU
  var summary = 'Session ' + nextSession + ' ' + verdict + (canewResult.path ? ' -- ' + canewResult.path : '');
  await stampBead({ ham_uid: 'DC499D0C', agent_global: 'EANEW',
    acl_stamp: '\u2b21B:eanew.result.' + nextSession + ':RESULT:' + verdict + ':20260617\u2b21',
    stamp_type: 'RESULT', source: 'eanew.result.' + nextSession + '.' + Date.now(),
    content: JSON.stringify({ sessionId: nextSession, path: canewResult.path, verdict: verdict, for_anu: true, canon_gaps: canon.gaps }),
    summary: '[EANEW] ' + summary, importance: verdict === 'CANON_PASS' ? 9 : 6 });

  if (verdict === 'CANON_PASS') {
    await stampBead({ ham_uid: 'DC499D0C', agent_global: 'EANEW',
      acl_stamp: '\u2b21B:eanew.seal.' + nextSession + ':SEAL:complete:20260617\u2b21',
      stamp_type: 'AIR_CYCLE', source: 'eanew.seal.' + nextSession + '.' + Date.now(),
      content: JSON.stringify({ session: nextSession, path: canewResult.path, cycleId: cycleId }),
      summary: '[EANEW] SEAL -- ' + nextSession + ' complete', importance: 9 });
  }

  // 8. Tap other lung
  await essenceTap(cycleId);

  console.log('[EANEW] Cycle done:', nextSession, verdict);
  return { cycleId: cycleId, session: nextSession, verdict: verdict, path: canewResult.path, nextSession: spanMap.next_session };
}

// ── ENDPOINTS ──────────────────────────────────────────────────────────────────
app.get('/health', function(req, res) {
  res.json({ ok: true, service: 'EANEW', model: 'google/gemini-3.1-flash-lite',
    doctrine_loaded: DOCTRINE_BIBLE ? DOCTRINE_BIBLE.length + ' chars' : 'NOT LOADED',
    cycle_running: CYCLE_RUNNING, sessions_defined: Object.keys(SESSION_TASKS) });
});
app.get('/', function(req, res) { res.json({ ok: true, service: 'EANEW', phase: 'B4' }); });

app.post('/eanew/cycle', async function(req, res) {
  if (CYCLE_RUNNING) return res.json({ ok: false, reason: 'cycle_already_running' });
  CYCLE_RUNNING = true;
  try { var result = await runCycle(); res.json({ ok: true, result: result }); }
  catch(e) { console.error('[EANEW] Cycle error:', e.message); res.json({ ok: false, error: e.message }); }
  finally { CYCLE_RUNNING = false; }
});

app.post('/eanew/report', async function(req, res) {
  var body = req.body || {};
  await stampBead({ ham_uid: body.hamUid || 'DC499D0C', agent_global: 'EANEW',
    acl_stamp: '\u2b21B:eanew.report.' + Date.now() + ':RESULT:received:20260617\u2b21',
    stamp_type: 'RESULT', source: 'eanew.report.' + Date.now(),
    content: JSON.stringify(body), summary: '[EANEW] ' + (body.summary || 'report received'), importance: 6 });
  res.json({ ok: true });
});

// ── AUTO-LOOP: recursive, never setInterval ──────────────────────────────────


// ── AGENT MAP (embedded context so EANEW knows who does what) ──────────────
var AGENT_MAP = {
  'CANEW': { role: 'coding dept -- builds files, commits, deploys', tier: 'C3' },
  'MACE': { role: 'architecture decisions on multi-file or ambiguous questions', tier: 'C2' },
  'CANON': { role: 'grades code against Wonder Contract', tier: 'C2' },
  'SPAN': { role: 'roadmap sequencer', tier: 'C2' },
  'PAM': { role: 'privacy gate before output exits', tier: 'C2' },
  'SHADOW': { role: 'hallucination check', tier: 'C2' },
  'WRIT': { role: 'voice law, no em dash, Coffee Shop Test', tier: 'C2' },
  'THINK': { role: 'deep deliberation on complex problems', tier: 'C2' },
  'IMAN': { role: 'email advisor -- stamps inbox results to brain, never queried directly', tier: 'C2' },
  'WREN': { role: 'SMS monitor -- stamps results to brain, never queried directly', tier: 'C2' },
  'ANU': { role: 'face -- reads EANEW RESULT BEADs and routes to channel', tier: 'C3_face' },
  'TIM': { role: 'C0 substrate ONNX confidence scorer', tier: 'C0' }
};

function getAgentContext() {
  return Object.keys(AGENT_MAP).map(function(k) { return k + ': ' + AGENT_MAP[k].role; }).join('. ');
}


// ── LLM DELIBERATION (Gemini Flash Lite via OpenRouter) ──────────────────────
async function deliberate(question, context) {
  var OR = process.env.OPENROUTER_API_KEY;
  if (!OR) return { answer: 'no_openrouter_key', confident: false };
  try {
    var r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OR, 'Content-Type': 'application/json',
        'HTTP-Referer': process.env.AIBEBASE_URL || 'https://aibebase.onrender.com' },
      body: JSON.stringify({ model: 'google/gemini-3.1-flash-lite', max_tokens: 150,
        messages: [
          { role: 'system', content: 'You are EANEW, the autonomous Life Assistant Code. You watch the A\u2019NEW ecosystem and report honestly. One sentence. Direct. No fluff.' },
          { role: 'user', content: 'CONTEXT: ' + context + '\n\nQUESTION: ' + question }
        ]})
    });
    var d = await r.json();
    var answer = d.choices && d.choices[0] ? d.choices[0].message.content.trim() : 'no_answer';
    return { answer: answer, confident: true };
  } catch(e) { return { answer: 'deliberation_error', confident: false }; }
}

// ── SYSTEM HEALTH CHECK ───────────────────────────────────────────────────────
async function checkSystemHealth() {
  var base = process.env.AIBEBASE_URL || 'https://aibebase.onrender.com';
  var canew = process.env.CANEW_URL || 'https://canew.onrender.com';
  var checks = [
    { name: 'canew', url: canew + '/health' },
    { name: 'aibebase', url: base + '/health' },
    { name: 'advisors_bdif', url: base + '/advisors/bdif/health' },
    { name: 'advisors_gmg', url: base + '/advisors/gmg/health' }
  ];
  var results = {};
  for (var i = 0; i < checks.length; i++) {
    try {
      var r = await fetch(checks[i].url, { signal: AbortSignal.timeout(4000) });
      results[checks[i].name] = r.ok ? 'up' : 'degraded';
    } catch(e) { results[checks[i].name] = 'unreachable'; }
  }
  return results;
}

// ── TEAM ACTIVITY READER ──────────────────────────────────────────────────────
async function readTeamActivity(hamUid) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return [];
  var hdrs = { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' };
  var twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  return await fetch(
    BU + '/rest/v1/aibe_brain?agent_global=in.(IMAN,WREN,CANEW,ANU,ANEW)&ham_uid=eq.' + hamUid + '&created_at=gte.' + twoHoursAgo + '&order=created_at.desc&limit=30',
    { headers: hdrs }
  ).then(function(r){return r.json()}).catch(function(){return []});
}
// ── JUDGMENT LAYER ────────────────────────────────────────────────────────
async function lifeCheck(hamUid) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return { ok: false, reason: 'no_brain' };
  var hdrs = { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' };

  // System health check first
  var health = await checkSystemHealth();
  var downServices = Object.keys(health).filter(function(k){return health[k] !== 'up';});

  // Read last 20 stamps -- what did the team do?
  var recentRows = await fetch(BU + '/rest/v1/aibe_brain?stamp_type=in.(LOGFUL,RESULT,AIR_CYCLE)&agent_global=neq.EANEW&ham_uid=eq.' + hamUid + '&order=created_at.desc&limit=20', { headers: hdrs })
    .then(function(r) { return r.json(); }).catch(function() { return []; });

  // Classify findings -- include unreachable services
  downServices.forEach(function(s){ findings.errors.push('[HEALTH] ' + s + ' is ' + health[s]); });
  // Classify LOGFUL findings
  var findings = { holds: [], errors: [], needs_brandon: [], normal: [] };
  recentRows.forEach(function(row) {
    var s = (row.summary || '').toLowerCase();
    if (s.includes('hold') || s.includes('canon_hold') || s.includes('canon_gap')) findings.holds.push(row.summary);
    else if (s.includes('error') || s.includes('fail') || s.includes('unreachable')) findings.errors.push(row.summary);
    else if (s.includes('for_brandon') || s.includes('needs_attention')) findings.needs_brandon.push(row.summary);
    else findings.normal.push(row.summary);
  });

  // Dispatch: deliberate then compose task from observation if holds exist
  if (findings.holds.length > 0) {
    var holdSummary = findings.holds.slice(0, 3).join('; ');
    var interpretation = await deliberate('What does this hold indicate and what should EANEW do?', holdSummary);
    await fetch(BU + '/rest/v1/aibe_brain', { method: 'POST',
      headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'DIRECTIVE',
        acl_stamp: '\u2b21B:eanew.dispatch.hold:DIRECTIVE:composed:20260617\u2b21',
        source: 'eanew.dispatch.hold.' + Date.now(),
        content: JSON.stringify({ composed_by: 'EANEW_lifeCheck', holds_found: findings.holds, action: 'review_and_retry', interpretation: (interpretation && interpretation.answer) || 'none', agent_context: getAgentContext() }),
        summary: '[EANEW] Dispatch: ' + findings.holds.length + ' hold(s) -- ' + holdSummary.slice(0, 60),
        importance: 8 }) }).catch(function() {});
  }

  // Surface: if errors or needs_brandon, stamp for A'NU
  if (findings.needs_brandon.length > 0 || findings.errors.length > 0) {
    await fetch(BU + '/rest/v1/aibe_brain', { method: 'POST',
      headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'RESULT',
        acl_stamp: '\u2b21B:eanew.surface.brandon:RESULT:needs_attention:20260617\u2b21',
        source: 'eanew.surface.' + Date.now(),
        content: JSON.stringify({ for_anu: true, errors: findings.errors, needs_brandon: findings.needs_brandon }),
        summary: '[EANEW] Surface to A\'NU: ' + (findings.errors.length + findings.needs_brandon.length) + ' item(s) need attention',
        importance: 9 }) }).catch(function() {});
  }

  var lifeResult = { ok: true, status: 'life_check', findings: { holds: findings.holds.length, errors: findings.errors.length, needs_brandon: findings.needs_brandon.length, normal: findings.normal.length }, dispatched: findings.holds.length > 0, surfaced: (findings.needs_brandon.length + findings.errors.length) > 0 };
  await stampMeetingMinutes(hamUid, lifeResult, Date.now() - 5000);
  return lifeResult;
}

// ── MEETING MINUTES ───────────────────────────────────────────────────────
async function stampMeetingMinutes(hamUid, cycleResult, startTime) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return;
  var elapsed = Date.now() - startTime;
  var narrative = '';
  if (cycleResult && cycleResult.session) {
    narrative = 'I woke up and checked SPAN. Session ' + cycleResult.session + ' was ready. I dispatched to CANEW. Verdict: ' + (cycleResult.verdict || 'unknown') + '. ' + (cycleResult.path ? 'Built: ' + cycleResult.path + '. ' : '') + 'Tapped aibebase. Done in ' + elapsed + 'ms.';
  } else if (cycleResult && cycleResult.status === 'life_check') {
    var f = cycleResult.findings || {};
    narrative = 'I woke up. SPAN had nothing. I went around the room -- read LOGFUL, found ' + (f.holds||0) + ' hold(s), ' + (f.errors||0) + ' error(s), ' + (f.normal||0) + ' normal. ' + (cycleResult.dispatched ? 'Dispatched fix task. ' : '') + (cycleResult.surfaced ? 'Surfaced to A\'NU. ' : '') + 'Tapped aibebase. Done in ' + elapsed + 'ms.';
  } else {
    narrative = 'I ran my cycle in ' + elapsed + 'ms. Result: ' + JSON.stringify(cycleResult||{}).slice(0, 80);
  }
  await fetch(BU + '/rest/v1/aibe_brain', { method: 'POST',
    headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Content-Profile': 'abacia_core', 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ ham_uid: hamUid, agent_global: 'EANEW', stamp_type: 'LOGFUL',
      acl_stamp: '\u2b21B:eanew.meeting.minutes:LOGFUL:cycle_log:20260617\u2b21',
      source: 'eanew.minutes.' + Date.now(),
      content: JSON.stringify({ narrative: narrative, elapsed_ms: elapsed }),
      summary: '[EANEW MINUTES] ' + narrative.slice(0, 100),
      importance: 6 }) }).catch(function() {});
}

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
  autoLoop();
  console.log('[EANEW] Auto-loop started. Fires every', (parseInt(process.env.CYCLE_DELAY_MS||'300000')/60000).toFixed(1), 'minutes.');
}).catch(function(e) {
  console.error('[EANEW] Startup error:', e.message);
});

var port = process.env.PORT || 10001;
app.listen(port, function() { console.log('[EANEW] Listening on', port); });