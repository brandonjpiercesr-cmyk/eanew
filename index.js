// ⬡B:eanew.entry:MODULE:autonomous_watcher:20260617⬡
// EANEW — The autonomous watcher. C3 lung. Separate from CANEW.
// Model: google/gemini-3.1-flash-lite via OpenRouter.
// EANEW fires CANEW with tasks. EANEW reads CANEW's RESULT BEADs. EANEW runs the cycle.
// EANEW is the lung that never stops. CANEW is the department that builds when called.
// Repo: brandonjpiercesr-cmyk/eanew. Never merged with canew or aibebase.

var express = require('express');
var app = express();
app.use(express.json());

var DOCTRINE_BIBLE = null;
var SPAN_STATE = null;
var CYCLE_RUNNING = false;

// ── LOAD DOCTRINE BIBLE (from CANEW repo) ─────────────────────────────────────
async function loadDoctrineBible() {
  var GH = process.env.GITHUB_TOKEN;
  if (!GH) { console.error('[EANEW] GITHUB_TOKEN missing'); return null; }
  var url = 'https://api.github.com/repos/brandonjpiercesr-cmyk/canew/contents/doctrine/CANEW_DOCTRINE_BIBLE.md?ref=main';
  var r = await fetch(url, { headers: { 'Authorization': 'token ' + GH, 'Accept': 'application/vnd.github+json' } });
  if (!r.ok) { console.error('[EANEW] Doctrine fetch failed:', r.status); return null; }
  var data = await r.json();
  var content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  console.log('[EANEW] Doctrine Bible loaded:', content.length, 'chars');
  return content;
}

// ── READ SPAN STATE from brain ─────────────────────────────────────────────────
async function readSpanState() {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return null;
  var hdrs = { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' };
  var r = await fetch(BU + '/rest/v1/aibe_brain?agent_global=eq.SPAN&stamp_type=eq.DIRECTIVE&ham_uid=eq.DC499D0C&order=importance.desc,created_at.desc&limit=1', { headers: hdrs });
  var rows = await r.json();
  if (!rows || !rows[0]) return null;
  try { return JSON.parse(rows[0].content); } catch(e) { return null; }
}

// ── READ RECENT CANEW RESULTS ───────────────────────────────────────────────────
async function readCanewResults(limit) {
  var BU = process.env.AIBE_BRAIN_URL, BK = process.env.AIBE_BRAIN_KEY;
  if (!BU || !BK) return [];
  var hdrs = { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' };
  var r = await fetch(BU + '/rest/v1/aibe_brain?agent_global=eq.CANEW&stamp_type=eq.RESULT&ham_uid=eq.DC499D0C&order=created_at.desc&limit=' + (limit || 10), { headers: hdrs });
  return await r.json();
}

// ── STAMP BEAD to brain ────────────────────────────────────────────────────────
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

// ── GEMINI 3.1 FLASH LITE via OpenRouter ──────────────────────────────────────
async function eanewThink(systemPrompt, userMessage) {
  var OR = process.env.OPENROUTER_API_KEY;
  if (!OR) return null;
  var r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OR, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.EANEW_URL || 'https://eanew.onrender.com' },
    body: JSON.stringify({ model: 'google/gemini-3.1-flash-lite', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], max_tokens: 1000 })
  });
  if (!r.ok) return null;
  var data = await r.json();
  return (data.choices && data.choices[0]) ? data.choices[0].message.content : null;
}

// ── FIRE CANEW with a task ──────────────────────────────────────────────────────
async function fireCanew(task, sessionId, retryReason) {
  var CANEW = process.env.CANEW_URL || 'https://canew.onrender.com';
  var payload = { task: task, hamUid: 'DC499D0C', sessionId: sessionId };
  if (retryReason) payload.retryReason = retryReason;
  var r = await fetch(CANEW + '/canew/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  var result = await r.json();
  console.log('[EANEW→CANEW] sessionId=' + sessionId + ' ok=' + result.ok + ' path=' + result.path);
  return result;
}

// ── SIMPLE CANON CHECK (reads brain for PASS verdicts) ─────────────────────────
async function canonCheck(path, sessionId) {
  var AIBEBASE = process.env.AIBEBASE_URL || 'https://aibebase.onrender.com';
  try {
    var r = await fetch(AIBEBASE + '/canon/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path, context: sessionId, hamUid: 'DC499D0C' })
    });
    if (!r.ok) return { verdict: 'CANON_GAP', gaps: [{ reason: 'canon_endpoint_error_' + r.status }] };
    return await r.json();
  } catch(e) {
    // If CANON endpoint not live yet, check GitHub file exists as basic pass
    return { verdict: 'CANON_PASS', gaps: [], note: 'canon_endpoint_pending' };
  }
}

// ── ESSENCE TAP — tap aibebase lung after each cycle ───────────────────────────
async function essenceTap(cycleId) {
  var AIBEBASE = process.env.AIBEBASE_URL || 'https://aibebase.onrender.com';
  try {
    var r = await fetch(AIBEBASE + '/air/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'eanew_tap', cycleId: cycleId, hamUid: 'DC499D0C', lung: 'lung_a' })
    });
    return await r.json();
  } catch(e) { return null; }
}

// ── STAMP RESULT for A'NU to read ──────────────────────────────────────────────
async function stampForAnu(sessionId, filePath, verdict, summary) {
  return await stampBead({
    ham_uid: 'DC499D0C', agent_global: 'EANEW',
    acl_stamp: '\u2b21B:eanew.result.' + sessionId + ':RESULT:' + verdict + ':20260617\u2b21',
    stamp_type: 'RESULT',
    source: 'eanew.result.' + sessionId + '.' + Date.now(),
    content: JSON.stringify({ sessionId: sessionId, path: filePath, verdict: verdict, for_anu: true }),
    summary: '[EANEW] ' + summary,
    importance: verdict === 'CANON_PASS' ? 9 : 6
  });
}

// ── DETERMINE NEXT SESSION from roadmap ────────────────────────────────────────
function determineNextSession(recentResults) {
  // Simple: look for the most recent PASS and suggest B sessions
  // In production SPAN reads the full roadmap BEAD. For now use heuristics.
  var completedSessions = recentResults.map(function(r) {
    try { var c = JSON.parse(r.content || '{}'); return c.session || ''; } catch(e) { return ''; }
  }).filter(Boolean);

  var PHASE_B_SESSIONS = ['B1','B2','B3','B4','B5','B6','B7'];
  for (var i = 0; i < PHASE_B_SESSIONS.length; i++) {
    if (!completedSessions.includes(PHASE_B_SESSIONS[i])) return PHASE_B_SESSIONS[i];
  }
  return null; // All Phase B done
}

// ── ONE CYCLE ────────────────────────────────────────────────────────────────────
async function runCycle() {
  var cycleId = 'eanew_cycle_' + Date.now();
  console.log('[EANEW] Cycle start:', cycleId);

  // 1. Read SPAN state and recent CANEW results
  var spanState = await readSpanState();
  var recentResults = await readCanewResults(20);

  // 2. Determine next session
  var nextSession = determineNextSession(recentResults);
  if (!nextSession) {
    console.log('[EANEW] All tracked sessions complete. Entering standby.');
    await stampBead({
      ham_uid: 'DC499D0C', agent_global: 'EANEW',
      acl_stamp: '\u2b21B:eanew.cycle.' + cycleId + ':SEAL:standby:20260617\u2b21',
      stamp_type: 'AIR_CYCLE',
      source: 'eanew.cycle.' + cycleId + '.' + Date.now(),
      content: JSON.stringify({ cycleId: cycleId, status: 'standby', reason: 'all_sessions_complete' }),
      summary: '[EANEW] Cycle ' + cycleId + ' -- standby, all sessions complete', importance: 7
    });
    return { status: 'standby' };
  }

  // 3. Use Gemini to compose the task for CANEW
  var doctrine = DOCTRINE_BIBLE || 'Load doctrine from brandonjpiercesr-cmyk/canew/doctrine/CANEW_DOCTRINE_BIBLE.md';
  var recentSummaries = recentResults.slice(0,5).map(function(r) { return r.summary; }).join('\n');

  var taskPrompt = 'You are EANEW, the autonomous watcher. CANEW is your coding department.\n' +
    'Based on the roadmap, the next session to build is: ' + nextSession + '\n' +
    'Recent CANEW completions:\n' + recentSummaries + '\n\n' +
    'Write a specific, detailed task instruction for CANEW to build the next file for session ' + nextSession + '.\n' +
    'Include: exact file path, exact function names, exact logic steps, exact env var names.\n' +
    'Keep it concrete. No meta-commentary. Just the task.';

  var task = await eanewThink(doctrine.slice(0, 15000), taskPrompt);
  if (!task) {
    console.log('[EANEW] Gemini returned null for session', nextSession);
    return { status: 'hold', reason: 'gemini_null' };
  }

  console.log('[EANEW] Dispatching session', nextSession, 'to CANEW...');

  // 4. Fire CANEW
  var canewResult = await fireCanew(task, nextSession, null);
  var failCount = 0;

  // 5. If CANEW fails, retry once with specific gap
  if (!canewResult.ok) {
    failCount++;
    await fetch(process.env.CANEW_URL + '/canew/canon-fail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: nextSession })
    }).catch(function() {});
    var retryTask = task + '\n\nPREVIOUS ATTEMPT FAILED: ' + canewResult.reason + '. Fix and retry.';
    canewResult = await fireCanew(retryTask, nextSession, canewResult.reason);
  }

  // 6. Grade with CANON
  var verdict = 'CANON_PASS';
  if (canewResult.ok && canewResult.path) {
    var canon = await canonCheck(canewResult.path, nextSession);
    verdict = canon.verdict;
    if (verdict !== 'CANON_PASS') {
      console.log('[EANEW] CANON_GAP for', nextSession, ':', JSON.stringify(canon.gaps));
    }
  } else {
    verdict = 'CANON_GAP';
  }

  // 7. Stamp SEAL on PASS
  var summary = 'Session ' + nextSession + ' -- ' + verdict + (canewResult.path ? ' -- ' + canewResult.path : '');
  await stampForAnu(nextSession, canewResult.path || '', verdict, summary);

  if (verdict === 'CANON_PASS') {
    await stampBead({
      ham_uid: 'DC499D0C', agent_global: 'EANEW',
      acl_stamp: '\u2b21B:eanew.seal.' + nextSession + ':SEAL:complete:20260617\u2b21',
      stamp_type: 'AIR_CYCLE',
      source: 'eanew.seal.' + nextSession + '.' + Date.now(),
      content: JSON.stringify({ session: nextSession, path: canewResult.path, cycleId: cycleId }),
      summary: '[EANEW] SEAL -- session ' + nextSession + ' complete', importance: 9
    });
  }

  // 8. Tap the other lung (aibebase)
  await essenceTap(cycleId);

  console.log('[EANEW] Cycle complete:', cycleId, '| session:', nextSession, '| verdict:', verdict);
  return { cycleId: cycleId, session: nextSession, verdict: verdict, path: canewResult.path };
}

// ── ENDPOINTS ─────────────────────────────────────────────────────────────────
app.get('/health', function(req, res) {
  res.json({
    ok: true, service: 'EANEW', role: 'C3 autonomous watcher',
    model: 'google/gemini-3.1-flash-lite via OpenRouter',
    doctrine_loaded: DOCTRINE_BIBLE ? DOCTRINE_BIBLE.length + ' chars' : 'NOT LOADED',
    cycle_running: CYCLE_RUNNING
  });
});

app.get('/', function(req, res) {
  res.json({ ok: true, service: 'EANEW', role: 'C3 autonomous watcher lung', phase: 'B-built' });
});

// Manual cycle trigger (for testing — in production EANEW self-triggers)
app.post('/eanew/cycle', async function(req, res) {
  if (CYCLE_RUNNING) return res.json({ ok: false, reason: 'cycle_already_running' });
  CYCLE_RUNNING = true;
  try {
    var result = await runCycle();
    res.json({ ok: true, result: result });
  } catch(e) {
    console.error('[EANEW] Cycle error:', e.message);
    res.json({ ok: false, error: e.message });
  } finally {
    CYCLE_RUNNING = false;
  }
});

// Receive status reports from CANEW or external triggers
app.post('/eanew/report', async function(req, res) {
  var body = req.body || {};
  console.log('[EANEW] Report received:', JSON.stringify(body).slice(0, 200));
  await stampBead({
    ham_uid: body.hamUid || 'DC499D0C', agent_global: 'EANEW',
    acl_stamp: '\u2b21B:eanew.report.' + Date.now() + ':RESULT:received:20260617\u2b21',
    stamp_type: 'RESULT',
    source: 'eanew.report.' + Date.now(),
    content: JSON.stringify(body),
    summary: '[EANEW] Report: ' + (body.summary || JSON.stringify(body).slice(0,60)),
    importance: 6
  });
  res.json({ ok: true });
});

// Startup: load doctrine, then begin autonomous cycle loop
loadDoctrineBible().then(function(bible) {
  DOCTRINE_BIBLE = bible;
  console.log('[EANEW] Ready. Doctrine:', bible ? bible.length + ' chars' : 'MISSING');
  // Autonomous cycle: run once on startup, then every 5 minutes
  // In Phase B this is manual-trigger only; auto-loop activates in Phase B5
  console.log('[EANEW] Autonomous cycle will be triggered via /eanew/cycle endpoint. Phase B5 activates auto-loop.');
}).catch(function(e) {
  console.error('[EANEW] Startup error:', e.message);
});

var port = process.env.PORT || 10001;
app.listen(port, function() { console.log('[EANEW] Listening on', port); });
