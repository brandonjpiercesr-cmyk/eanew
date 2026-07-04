// ⬡B:eanew.server:MODULE:active_essence_watcher:20260617⬡
// EANEW -- E.A.NEW. Master C4/C5 watcher. Always-on Render service.
// Doctrine: THE BIND (20260617). Built as Render service 20260617.
// Every 3 min: checks AIR, drains CANEW tasks, heals broken deploys, checks Life Flex.
var express=require('express'); var app=express(); app.use(express.json());
var BODY_URL=process.env.AIBEBASE_URL||'https://aibebase.onrender.com';
var CANEW=process.env.CANEW_URL||'https://canew.onrender.com';
var triplet = null; try { triplet = require('./ops/abc.triplet.watcher.js'); } catch(e) { console.log('[EANEW] triplet watcher not found:', e.message); }
var cooldown = null; try { cooldown = require('./cooldown'); } catch(e) { console.log('[EANEW] cooldown not found:', e.message); }
var BU=process.env.AIBE_BRAIN_URL; var BK=process.env.AIBE_BRAIN_KEY;
var RKEY=process.env.RENDER_API_KEY;
var MS=3*60*1000;
var HAM_UID=process.env.HAM_UID||process.env.FOUNDER_HAM_UID; // env-driven only, no literal fallback, per W3
function bh(){return {apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core'};}
async function stamp(payload){
  if(!BU||!BK)return;
  await fetch(BU+'/rest/v1/aibe_brain',{method:'POST',
    headers:Object.assign({},bh(),{'Content-Type':'application/json','Content-Profile':'abacia_core',Prefer:'return=minimal'}),
    body:JSON.stringify({ham_uid:HAM_UID,agent_global:'EANEW',
      acl_stamp:'⬡B:eanew.watcher:RESULT:cycle:20260617⬡',stamp_type:'RESULT',
      source:'eanew.cycle.'+Date.now(),content:JSON.stringify(payload),
      summary:'[EANEW] '+payload.summary,importance:7})
  }).catch(function(){});
}
async function cycle(){
  if (global._eanewCycleRunning) { return { skipped: 'cycle_overlap' }; }
  global._eanewCycleRunning = true;
  if (BU && BK) {
    try {
      var lockR = await fetch(BU+'/rest/v1/rpc/try_acquire_cycle_lock',{method:'POST',headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Type':'application/json'},body:JSON.stringify({host_id:'eanew-'+process.pid,ttl_seconds:150})});
      var gotLock = await lockR.json();
      if (gotLock !== true) { global._eanewCycleRunning = false; return { skipped: 'another_instance_holds_lock' }; }
    } catch(le) {}
  }
  // ⬡B:eanew.cycle:FIX:hard_cycle_timeout:20260704⬡
  // Live incident: automatic cycling stopped completely for 6+ hours while
  // this exact process kept answering HTTP requests fine the whole time,
  // including a manual POST /cycle that completed cleanly in seconds. The
  // only explanation that fits: some await inside _cycleBody hung forever on
  // one bad tick, so global._eanewCycleRunning stayed true permanently, and
  // every later setInterval tick silently no-op'd at cycle_overlap above,
  // with nothing to log because it never got that far. core/find.js already
  // carries this exact pattern for the same reason ("a slow brain can never
  // hang the build," 2500ms hard timeout there); this is the same fix at the
  // cycle's own top level, generous enough to never cut off real work.
  var TIMEOUT_MS = 90000;
  try {
    return await Promise.race([
      _cycleBody(),
      new Promise(function(resolve){ setTimeout(function(){ resolve({ timedOut: true, summary: 'cycle exceeded ' + TIMEOUT_MS + 'ms, aborted to protect future ticks' }); }, TIMEOUT_MS); })
    ]);
  } finally { global._eanewCycleRunning = false; }
}
async function _cycleBody(){
  var r={ts:new Date().toISOString(),checks:{}};
  // 1. AIR
  try{
    var a=await fetch(BODY_URL+'/air/status?hamUid='+HAM_UID).then(function(x){return x.json();});
    if(!a.activeLung||a.status==='idle'){
      await fetch(BODY_URL+'/air/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hamUid:HAM_UID,source:'eanew'})});
      r.checks.air={tapped:true};
    } else {r.checks.air={lung:a.activeLung};}
  }catch(e){r.checks.air={err:e.message};}
  // Cooldown: skip this cycle's task fetch if recently empty
  var skipTasks = false;
  if (cooldown && cooldown.shouldSkipCycle && BU && BK) { try { skipTasks = await cooldown.shouldSkipCycle(BU, BK); } catch(e){} }
  // 2. Tasks — read SPAN next-task, then call CANEW /canew/build
  // ⬡B:eanew.cycle:WIRE:span_to_canew_build:20260623⬡
  // CANEW has no /drain endpoint. EANEW reads SPAN queue and calls /canew/build per task.
  try{
    var BODY_URL_ENV=process.env.AIBEBASE_URL||'https://aibebase.onrender.com';
    // ⬡B:eanew.cycle:FIX:span_post:20260623⬡ /span/next-task is POST not GET
var nextTaskResp=await fetch(BODY_URL_ENV+'/span/next-task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hamUid:HAM_UID})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
    var drained=0;
    if(nextTaskResp&&nextTaskResp.task){
      var task=nextTaskResp.task;
      // task.spec is the full parsed content object {label,targetFile,spec:'...'}.
      // Extract the inner spec string (build instructions) and targetFile for CANEW.
      // ⬡B:eanew.cycle:FIX:task_spec_extraction:20260624⬡
      var innerSpec=(task.spec&&task.spec.spec)||task.spec||task.task||'';
      if(typeof innerSpec==='object') innerSpec=JSON.stringify(innerSpec);
      var targetFile=(task.spec&&task.spec.targetFile)||task.targetFile||null;
      var taskLabel=(task.spec&&task.spec.label)||task.label||task.source||'';
      // ⬡B:eanew.cycle:WIRE:collision_guard_before_dispatch:20260703⬡
      // Real audit tonight (clair.audit.full_queue_1088.20260703): 435 of 742
      // target-specified pending tasks were chasing a file some OTHER pending task
      // already separately owned -- eanew/index.js itself had 26. That's how two
      // sessions end up editing the same file blind, which is what broke
      // routes/iman.routes.js four separate times in one night. This checks the
      // brain for any OTHER task already TASK or TASK_HELD against the same
      // targetFile before this one proceeds to dispatch; if found, this cycle
      // holds instead and tries again next cycle. First attempt at this task
      // (span.task.CARETAKER_COLLISION_GUARD.1783090049) required three modules
      // that do not exist anywhere in this repo and assumed an event-emitter shape
      // this cycle has never used -- fixed here, additive, inline, using the same
      // real brain-query pattern already proven throughout tonight's build.
      if (targetFile && BU && BK) {
        var collisionHeld = false;
        try {
          var collideUrl = BU + '/rest/v1/aibe_brain?stamp_type=in.(TASK,TASK_HELD)&content=ilike.*' +
            encodeURIComponent(targetFile) + '*&select=source&limit=5';
          var collideRows = await fetch(collideUrl, { headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' } })
            .then(function(x){ return x.ok ? x.json() : []; }).catch(function(){ return []; });
          var otherOwner = (collideRows || []).find(function(row){ return row.source !== task.source; });
          if (otherOwner) {
            r.checks.collisionGuard = { held: true, targetFile: targetFile, ownedBy: otherOwner.source };
            collisionHeld = { collisionGuardHeld: true, targetFile: targetFile, ownedBy: otherOwner.source };
          }
        } catch (eCollide) { /* non-fatal — if the check itself fails, proceed as before rather than stall the cycle */ }
        // ⬡B:eanew.cycle:FIX:collision_guard_scoped_skip:20260704⬡
        // Live incident, two parts. Part 1: this block used to `return r` on a
        // collision, exiting the ENTIRE cycle function -- two of CANEW's own
        // auto-queued cleanup tasks (gap_cleanup + wiring_cleanup) landed on the
        // same targetFile, neither ever resolved, and every cycle since silently
        // threw away the health check, advisor pass, and self-report stamp below,
        // forever, no error anywhere. Part 2, found testing the first fix: moving
        // the escape to a throw INSIDE the try above just fed it straight into
        // that try's own catch(eCollide), which swallows it as "check failed,
        // proceed anyway" -- so the guard silently stopped guarding, dispatching
        // the colliding file regardless. The throw has to happen after that inner
        // try/catch has already closed, so it reaches the real catch at the
        // bottom of this whole task block instead -- skips only this dispatch,
        // still runs health/life-flex/minutes exactly like an empty-queue cycle.
        if (collisionHeld) { throw collisionHeld; }
      }
      // DYNAMIC CONTEXT: read the current target file from GitHub before dispatching
      // This is what makes CANEW build real code instead of scaffold
      // Without this, she builds from training patterns and hallucinates the interface
      var dynamicContext='';
      if(targetFile && process.env.GITHUB_TOKEN){
        try{
          var ghUrl='https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/'+targetFile;
          var ghResp=await fetch(ghUrl,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Accept':'application/vnd.github+json','User-Agent':'eanew'}}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
          if(ghResp&&ghResp.content){
            var existingFile=Buffer.from(ghResp.content,'base64').toString('utf8');
            dynamicContext='\n\n=== CURRENT FILE (read this BEFORE writing anything) ===\nFile: '+targetFile+'\n'+existingFile.slice(0,3000)+'\n=== END CURRENT FILE ===\n';
          } else {
            dynamicContext='\n\n=== TARGET FILE DOES NOT EXIST YET — build it from scratch ===\nFile: '+targetFile+'\n';
          }
        }catch(e){dynamicContext='';/* non-fatal — build without it */}
      }
      // Also fetch package.json dep list as the allowlist
      var depAllowlist='';
      try{
        var pkgResp=await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/package.json',
          {headers:{Authorization:'Bearer '+(process.env.GITHUB_TOKEN||''),'Accept':'application/vnd.github+json','User-Agent':'eanew'}}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
        if(pkgResp&&pkgResp.content){
          var pkg=JSON.parse(Buffer.from(pkgResp.content,'base64').toString('utf8'));
          var deps=Object.keys(pkg.dependencies||{}).concat(Object.keys(pkg.devDependencies||{}));
          depAllowlist='\n\n=== ALLOWED DEPENDENCIES (only these + Node built-ins) ===\n'+deps.join(', ')+'\n=== END DEPS ===\n';
        }
      }catch(e){}
      var taskForCanew=targetFile
        ? 'TARGET FILE: '+targetFile+dynamicContext+depAllowlist+'\n\nSPEC:\n'+innerSpec
        : innerSpec;

      // ⬡B:eanew.cycle:WIRE:clair_static_context_window:20260704⬡
      // span.task.CLAIR_STATIC_CONTEXT_WINDOW. Built the aggregation route
      // (routes/clair.context.routes.js) then found the actual gap: nothing
      // ever called it before dispatch, so PAI still built blind to what
      // CLAIR already knows, exactly the "two different pictures" problem the
      // task named. Wired here, for real: her recent works/wiring/supersede
      // stamps ride at the very top of the dispatched task text, above even
      // the retry-verdict feedback below. Non-fatal on failure, a slow or
      // empty brief never blocks a build.
      try{
        var ccResp=await fetch(BODY_URL_ENV+'/clair/context/brief?limit=8').then(function(x){return x.json();}).catch(function(){return null;});
        if(ccResp&&ccResp.ok&&ccResp.brief){
          taskForCanew='=== CLAIR\'S CONTEXT WINDOW (what she already knows about this build) ===\n'
            +ccResp.brief+'\n=== END CLAIR CONTEXT ===\n\n'+taskForCanew;
        }
      }catch(eCC){ /* non-fatal */ }

      // ⬡B:eanew.cycle:WIRE:verdict_feedback_on_retry:20260702⬡
      // Watched live 20260702: the same task failed the same gate three times in a
      // row (identical CANON gap every try), because a retry never hears why the
      // last attempt died. The verdict lands in a GIVE_UP_TRY bead and the next
      // dispatch reads none of it. The gate can only teach if she hears it.
      // Wiring only: read the newest try-counter bead for this task; if a prior
      // verdict exists, ride it at the top of the dispatched task text so the next
      // attempt fixes the named problem first. No LLM, no new dependencies, and it
      // runs unchanged for any HAM's task.
      try{
        var fbSrc='eanew.giveup.'+task.source;
        var fbRows=await fetch(BU+'/rest/v1/aibe_brain?stamp_type=eq.GIVE_UP_TRY&source=eq.'+encodeURIComponent(fbSrc)+'&select=content&order=created_at.desc&limit=1',
          {headers:{apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core'}})
          .then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
        if(fbRows&&fbRows[0]&&fbRows[0].content){
          var fb=null; try{ fb=JSON.parse(fbRows[0].content); }catch(ePf){ fb=null; }
          if(fb&&fb.lastVerdict){
            taskForCanew='=== LAST GATE VERDICT ON THIS EXACT TASK (fix this named problem FIRST, then the spec) ===\n'
              +String(fb.lastVerdict)
              +'\n=== END LAST VERDICT ===\n\n'+taskForCanew;
          }
        }
      }catch(eFb){ /* non-fatal: dispatch proceeds without feedback */ }

      var buildResp=await fetch(CANEW+'/canew/build',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({task:taskForCanew,targetFile:targetFile||undefined,
        // ⬡B:eanew.cycle:FIX:repo_lives_in_spec:20260702⬡
        // Live incident: every founder task said repo anew, but repo rides inside the
        // task's content JSON (task.spec.repo) and this line read task.repo -- always
        // undefined -- so the builder defaulted to canew and her canary commit
        // (core/llm-conversation-streamer.js, d02ca888) plus three siblings landed in
        // PAI's own service instead of her body. Same extraction pattern as spec,
        // targetFile, and label three lines up.
        repo:(task.spec&&task.spec.repo)||task.repo||'canew',hamUid:HAM_UID,sessionId:'eanew_'+Date.now(),label:taskLabel})
      }).then(function(x){return x.json();}).catch(function(e){return {ok:false,err:e.message};});
      // ⬡B:eanew.cycle:WIRE:verify_before_done_sha_pinned:20260703⬡
      // TEACHING BLOCK, read this before you build anything like it.
      // Tonight's audit found 7 of 9 DONE stamps were false: files that committed
      // but did the wrong thing, wired to nothing, or claimed paths that were never
      // readable back. Root cause: DONE stamped the moment a sha existed, and the
      // only verify ran AFTER the stamp, against the branch head, in a hardcoded
      // repo. Three lessons wired in here at once:
      //   1. Verify BEFORE the record says done, never after. A record written
      //      first and checked second is how false history gets made.
      //   2. Pin the read to the EXACT commit sha the builder returned
      //      (?ref={sha}), never the branch head. Another commit can land on main
      //      between the build and the check; the branch head proves nothing
      //      about THIS build. The Contents API PUT returns commit.sha for
      //      exactly this reason.
      //   3. The repo is the one the dispatch named (same extraction as the
      //      dispatch line above), never a hardcoded name. This exact pin was
      //      fixed once already today and got clobbered by a concurrent
      //      full-file commit; it lives here again, in the same variable the
      //      dispatch uses, so the two can never drift apart.
      // Honest three-state result: true = fetched back real non-empty content at
      // that sha; false = checked and it is NOT there (phantom); null = could not
      // check (no path, no sha, no token, or GitHub error). Null never blocks a
      // DONE, it only marks it unverified, because a GitHub hiccup must not
      // freeze the whole loop. False always blocks.
      // ⬡B:eanew.cycle:FIX:verify_where_it_landed:20260704⬡
      // Live incident (MERIT_DIRECTORY_5WS): the builder lawfully redirects
      // mind-code paths (core/, routes/, agents/) into anew and reports the
      // landing repo in its response; this judge kept reading the repo the TASK
      // named and ruled a real commit phantom. The builder's report of where it
      // landed outranks the dispatch's guess. Task repo stays as fallback only.
      var repoUsed=(buildResp&&buildResp.repo)||(task.spec&&task.spec.repo)||task.repo||'canew';
      var shaVerified=null;
      if(buildResp&&buildResp.ok&&buildResp.sha&&buildResp.path&&process.env.GITHUB_TOKEN){
        try{
          var vb=await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/'+repoUsed+'/contents/'+encodeURI(buildResp.path)+'?ref='+encodeURIComponent(buildResp.sha),
            {headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Accept':'application/vnd.github+json','User-Agent':'eanew'}});
          if(vb.ok){
            var vbd=await vb.json().catch(function(){return null;});
            var vbDecoded='';
            try{ vbDecoded=Buffer.from((vbd&&vbd.content)||'','base64').toString('utf8'); }catch(eDec){ vbDecoded=''; }
            shaVerified=vbDecoded.trim().length>0;
          } else {
            // ⬡B:eanew.cycle:FIX:blob_sha_fallback:20260704⬡
            // A landed sha recovered from a contents read is the file's BLOB
            // sha, and ?ref= only accepts commit-ish refs, so the pinned read
            // 404s on real commits. Fallback: read the file at main; verified
            // ONLY if the blob sha at head equals the sha the builder returned,
            // with real content -- still exact-object verification, just
            // recognizing which kind of sha arrived. Anything else stays phantom.
            try{
              var vb2=await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/'+repoUsed+'/contents/'+encodeURI(buildResp.path)+'?ref=main',
                {headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Accept':'application/vnd.github+json','User-Agent':'eanew'}});
              if(vb2.ok){
                var vbd2=await vb2.json().catch(function(){return null;});
                var dec2='';
                try{ dec2=Buffer.from((vbd2&&vbd2.content)||'','base64').toString('utf8'); }catch(eD2){ dec2=''; }
                shaVerified=!!(vbd2&&vbd2.sha===buildResp.sha&&dec2.trim().length>0);
              } else { shaVerified=false; }
            }catch(eF){ shaVerified=false; }
          }
        }catch(eVb){ shaVerified=null; }
      }
      if(shaVerified===false){
        // Phantom: the builder claimed a sha and a path, and the content is not
        // readable back at that exact sha. Never done. Stamp the honest state,
        // and feed the SAME give-up counter the failed-build path uses, with the
        // reason as the verdict, so the retry hears exactly why (the verdict
        // feedback wire reads this bead) and the loop cannot spin forever on a
        // builder that fabricates shas.
        try{
          await fetch(BU+'/rest/v1/aibe_brain',{method:'POST',
            headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Profile':'abacia_core','Content-Type':'application/json',Prefer:'return=minimal'},
            body:JSON.stringify({ham_uid:HAM_UID,agent_global:'EANEW',stamp_type:'TASK_INCOMPLETE',
              source:task.source+'.INCOMPLETE.'+Date.now(),
              acl_stamp:'\u2b21B:eanew.cycle:TASK_INCOMPLETE:'+(task.label||'task')+':20260703\u2b21',
              summary:'[TASK_INCOMPLETE, PHANTOM] '+task.source+' -- sha '+String(buildResp.sha).slice(0,10)+' claimed for '+buildResp.path+' in '+repoUsed+' but content not readable back at that sha. Never done.',
              content:JSON.stringify({task:task.source,path:buildResp.path,sha:buildResp.sha,repo:repoUsed,reason:'sha_fetch_back_failed'}),
              importance:7})
          }).catch(function(){});
          var pvSrc='eanew.giveup.'+task.source;
          var pvPrior=await fetch(BU+'/rest/v1/aibe_brain?stamp_type=eq.GIVE_UP_TRY&source=eq.'+encodeURIComponent(pvSrc)+'&select=content&order=created_at.desc&limit=1',
            {headers:{apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core'}})
            .then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
          var pvN=1;
          if(pvPrior&&pvPrior[0]){ try{ pvN=(JSON.parse(pvPrior[0].content).tries||0)+1; }catch(ePv){ pvN=1; } }
          await fetch(BU+'/rest/v1/aibe_brain',{method:'POST',
            headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Profile':'abacia_core','Content-Type':'application/json',Prefer:'return=minimal'},
            body:JSON.stringify({ham_uid:HAM_UID,agent_global:'EANEW',stamp_type:'GIVE_UP_TRY',
              source:pvSrc,
              acl_stamp:'\u2b21B:eanew.giveup:GIVE_UP_TRY:'+(task.label||'task')+':20260703\u2b21',
              summary:'[GIVE_UP_TRY '+pvN+'/3] '+task.source+' (phantom sha)',
              content:JSON.stringify({task:task.source,tries:pvN,lastVerdict:'PHANTOM: claimed sha '+String(buildResp.sha).slice(0,10)+' for '+buildResp.path+' in repo '+repoUsed+' but the content is not readable back at that exact sha. The commit either did not happen, landed at a different path, or landed in a different repo. Commit for real, to the named repo and path, and return the real commit sha.'}),importance:4})
          }).catch(function(){});
          // ⬡B:eanew.cycle:FIX:phantom_giveup_cap:20260704⬡
          // Live incident: MERIT_DIRECTORY_5WS phantomed 5 times straight and
          // this path never checked a cap, so it looped indefinitely -- it only
          // stopped because try 6 happened to fail outright instead of
          // phantoming, which runs the OTHER cap check below. A task that keeps
          // phantoming without ever failing outright would never shelve. Same
          // cap, same shelf action, same counter key, now enforced here too.
          if(pvN>=3){
            await fetch(BU+'/rest/v1/aibe_brain?source=eq.'+encodeURIComponent(task.source)+'&stamp_type=eq.TASK',
              {method:'PATCH',headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Profile':'abacia_core','Content-Type':'application/json',Prefer:'return=minimal'},
               body:JSON.stringify({stamp_type:'TASK_HELD'})}).catch(function(){});
            await stamp({summary:'[EANEW SET ASIDE] '+task.source+' held after '+pvN+' straight phantom commits. Needs Brandon or a respec.',type:'GIVE_UP'});
          }
        }catch(ePh){ /* non-fatal */ }
      }
      // ⬡B:eanew.cycle:FIX:done_requires_real_commit:20260702⬡
      // W7 done definition, enforced: a SHA alone is not done, but NO sha is
      // definitely not done. Live incident: CLAIR_CENTER and JOURNAL_SEED got
      // TASK_DONE beads with sessionOk:true while their files never landed in
      // the repo (sha null) -- the queue believed work existed that does not.
      // DONE now requires buildResp.sha. An ok session without a commit stamps
      // TASK_INCOMPLETE instead, keeping the task pending and the record honest.
      if(buildResp&&buildResp.ok&&!buildResp.sha){
        try{
          await fetch(BU+'/rest/v1/aibe_brain',{method:'POST',
            headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Profile':'abacia_core','Content-Type':'application/json',Prefer:'return=minimal'},
            body:JSON.stringify({ham_uid:HAM_UID,agent_global:'EANEW',stamp_type:'TASK_INCOMPLETE',
              source:task.source+'.INCOMPLETE.'+Date.now(),
              acl_stamp:'\u2b21B:eanew.cycle:TASK_INCOMPLETE:'+(task.label||'task')+':20260702\u2b21',
              summary:'[TASK_INCOMPLETE] '+task.source+' -- session ok but NO commit sha; not done by W7. Path claimed: '+(buildResp.path||'unknown'),
              content:JSON.stringify({task:task.source,path:buildResp.path||null,sha:null}),
              importance:6})
          }).catch(function(){});
        }catch(eInc){}
      }
      if(buildResp&&buildResp.ok&&buildResp.sha&&shaVerified!==false){drained=1;global._eanewNullCycles=0;
        // ⬡B:eanew.cycle:FIX:task_done_stamp:20260702⬡
        // The other half of the done-contract, missing since the beginning:
        // nothing ever stamped TASK_DONE, so span's matcher had nothing exact
        // to match and every prior fix guessed around that hole (v9 too narrow,
        // v10 substring-poisoned). Stamped here, exactly keyed to the task's
        // own source, the moment PAI reports a real ok. span.query v11 (same
        // dated fix, aibebase side) matches exactly this and nothing looser.
        try{
          await fetch(BU+'/rest/v1/aibe_brain',{method:'POST',
            headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Profile':'abacia_core','Content-Type':'application/json',Prefer:'return=minimal'},
            body:JSON.stringify({ham_uid:HAM_UID,agent_global:'EANEW',stamp_type:'TASK_DONE',
              source:task.source+'.DONE.'+Date.now(),
              acl_stamp:'\u2b21B:eanew.cycle:TASK_DONE:'+(task.label||'task')+':20260702\u2b21',
              summary:'[TASK_DONE] '+task.source+' -- built and COMMITTED by PAI, path: '+(buildResp.path||'unknown')+' sha: '+String(buildResp.sha).slice(0,10)+(buildResp.wired===false?' [UNWIRED -- orphan flag + cleanup task queued by CANEW]':''),
              // ⬡B:eanew.cycle:FIX:wired_field_carried_honest:20260702⬡
              // Founder correction: 'built but never wired' can't be hidden inside a
              // bare sha. wired now rides the DONE record itself so the Warden (and
              // anyone reading this bead later) sees the real state, not an inferred one.
              content:JSON.stringify({task:task.source,path:buildResp.path||null,sha:buildResp.sha,wired:buildResp.wired!==false,sha_verified:shaVerified===true?true:'unverified'}),
              importance:7})
          }).catch(function(){});
          // ⬡B:eanew.cycle:FIX:patch_original_row_done:20260704⬡
          // Live incident: 1,149 TASK rows accumulated, un-patched, because only
          // the paired *.DONE.timestamp bead above was ever written. span.query.js
          // already defines a completed row patched to stamp_type=TASK_DONE as a
          // valid, first-checked done condition (v11 contract) -- nothing ever
          // executed that half. Every finished task's own row stayed stamp_type=
          // TASK forever, permanently occupying the dispatcher's top-200-by-
          // importance query window and burying every real pending task with
          // lower importance below the cutoff, invisible to /span/next-task no
          // matter how many cycles ran. Same PATCH pattern already used for
          // TASK_HELD below -- terminal-state UPDATE, never a DELETE on a BEAD.
          await fetch(BU+'/rest/v1/aibe_brain?source=eq.'+encodeURIComponent(task.source)+'&stamp_type=eq.TASK',
            {method:'PATCH',headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Profile':'abacia_core','Content-Type':'application/json',Prefer:'return=minimal'},
             body:JSON.stringify({stamp_type:'TASK_DONE'})}).catch(function(){});
        }catch(eDone){}
      }
      // ⬡B:eanew.cycle:FIX:give_up_guard:20260702⬡
      // Observed live 20260702: PAI held on agents/lina/lina.test.js for 30+
      // consecutive 3-minute cycles, same CANON clause every time, because the
      // cycle had no memory of a hold -- a not-ok build did nothing, so the same
      // top task was re-picked forever, burning the token on a build that cannot
      // pass as specified. Founder's give_up_guard doctrine: after several tries
      // in a row, set it aside, mark it for him, move on. Count lives in the
      // brain (GIVE_UP_TRY beads keyed to this task source) so a restart can't
      // reset it to zero. This runs unchanged for any HAM's task.
      if(!(buildResp&&buildResp.ok)){
        try{
          var GIVE_UP_AT=3;
          var trySrc='eanew.giveup.'+task.source;
          var priorTries=await fetch(BU+'/rest/v1/aibe_brain?stamp_type=eq.GIVE_UP_TRY&source=eq.'+encodeURIComponent(trySrc)+'&select=content&order=created_at.desc&limit=1',
            {headers:{apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core'}})
            .then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
          var n=1;
          if(priorTries&&priorTries[0]){ try{ n=(JSON.parse(priorTries[0].content).tries||0)+1; }catch(e){ n=1; } }
          // Supersede the try-counter (terminal-state UPDATE style: newest wins on read)
          await fetch(BU+'/rest/v1/aibe_brain',{method:'POST',
            headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Profile':'abacia_core','Content-Type':'application/json',Prefer:'return=minimal'},
            body:JSON.stringify({ham_uid:HAM_UID,agent_global:'EANEW',stamp_type:'GIVE_UP_TRY',
              source:trySrc,
              acl_stamp:'\u2b21B:eanew.giveup:GIVE_UP_TRY:'+(task.label||'task')+':20260702\u2b21',
              summary:'[GIVE_UP_TRY '+n+'/'+GIVE_UP_AT+'] '+task.source,
              content:JSON.stringify({task:task.source,tries:n,lastVerdict:(buildResp&&buildResp.verdict)||'not_ok'}),importance:4})
          }).catch(function(){});
          if(n>=GIVE_UP_AT){
            // Set the task aside so the queue advances. PATCH to TASK_HELD --
            // terminal state via update, never a DELETE on a BEAD.
            await fetch(BU+'/rest/v1/aibe_brain?source=eq.'+encodeURIComponent(task.source)+'&stamp_type=eq.TASK',
              {method:'PATCH',headers:{apikey:BK,Authorization:'Bearer '+BK,'Content-Profile':'abacia_core','Content-Type':'application/json',Prefer:'return=minimal'},
               body:JSON.stringify({stamp_type:'TASK_HELD'})}).catch(function(){});
            await stamp({summary:'[EANEW SET ASIDE] '+task.source+' held after '+n+' failed builds (last: '+((buildResp&&buildResp.verdict)||'not_ok')+'). Needs Brandon or a respec.',type:'GIVE_UP'});
          }
        }catch(eGuard){ /* non-fatal */ }
      }
      // OUTCOME VERIFY (research-backed: Anthropic Outcomes pattern)
      // Confirm the commit actually landed before claiming success or reaching out.
      var verifiedBuild=false; var builtPath=buildResp&&buildResp.path;
      if(buildResp&&buildResp.ok&&builtPath&&process.env.GITHUB_TOKEN){
        try{
          var vr=await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/'+repoUsed+'/contents/'+builtPath,
            {headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Accept':'application/vnd.github+json','User-Agent':'eanew'}});
          if(vr.ok){ verifiedBuild=true; }
          else{ await stamp({summary:'[EANEW ALERT] phantom commit: '+builtPath+' not found on GitHub after build claimed ok',type:'PHANTOM'}); }
        }catch(ve){ /* non-fatal */ }
      }
      // AUTONOMOUS REACH (research-backed: loop acts on outcomes)
      // When a real verified build completes, tell Brandon what was built.
      // REACH COOLDOWN: max once per 2 hours. She was spamming every 3-min cycle.
      var TWO_HOURS=2*60*60*1000;
      if(!global._lastAutoReachMs) global._lastAutoReachMs=0;
      var reachCooldownOk=(Date.now()-global._lastAutoReachMs)>TWO_HOURS;
      // Only reach on meaningful files — not game console, not anew.self, not test files
      var BORING_FILES=['anew.self','game.console','game-console','canew','test.verify'];
      var isInteresting=builtPath&&!BORING_FILES.some(function(x){return (builtPath||'').indexOf(x)>=0;});
      // ⬡B:eanew.cycle:FIX:retire_redundant_build_narration_reach:20260703⬡
      // Founder finding, live tonight, real screenshots: this fired on routine
      // wiring commits (most of them, all night) and the prompt itself asked
      // for exactly the commit-message-style output he called pointless --
      // "tell Brandon specifically what it does, what feature it enables" IS
      // a request for code narration, by design, not a bug in execution.
      // core/outreach.js on aibebase already does this job properly: real
      // signal-based judgment, an actual importance threshold, and it was
      // fixed tonight to specifically exclude build/RESULT chatter from
      // reaching him. Two competing "should I text Brandon" paths with two
      // different quality bars is worse than one good one. Retired here,
      // verified-build detection and phantom-commit alerting above this
      // block are untouched and still real.
      if(false&&verifiedBuild&&builtPath&&reachCooldownOk&&isInteresting){
        try{
          global._lastAutoReachMs=Date.now();
          await fetch(BODY_URL+'/reach/out',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({hamUid:HAM_UID,
              prompt:'You just committed real code to '+builtPath+'. In ONE short sentence tell Brandon specifically what '+builtPath+' does — what feature it enables, what problem it solves. No generic descriptions. No internal names.',
              fallback:'New build live: '+builtPath+'.'})
          });
        }catch(re){ /* non-fatal */ }
      }
      r.checks.tasks={drained:drained,task:task.label||task.source,buildOk:!!(buildResp&&buildResp.ok),buildPath:builtPath,verified:verifiedBuild};
    } else {
      // ⬡B:eanew.cycle:FIX:span_circuit_breaker:20260624⬡ EANEW detects broken SPAN
      if(!global._eanewNullCycles) global._eanewNullCycles=0;
      global._eanewNullCycles++;
      r.checks.tasks={drained:0,note:'span_had_nothing'};
      if(global._eanewNullCycles>=3){
        try{
          var statusR=await fetch(BODY_URL_ENV+'/span/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
          if(statusR&&statusR.pending>0){
            global._eanewNullCycles=0;
            // CLAIR fix 20260701: resetting the counter above only controls when the
            // NEXT null-streak starts -- it never stopped this exact self-heal request
            // from firing again every ~9 minutes forever if the underlying condition
            // (which core/span.query.js's own audit already showed is two independently-
            // capped queries, not a real bug) never resolves. Confirmed real incident:
            // this exact block, hardcoded repo:'anew' and hamUid:'8'+'47392' (the doctrine
            // TEST CONSTANT used as a live identity), fired repeatedly and self-labeled
            // every resulting commit with a banned model name via CANEW's pipeline.
            // Added an explicit once-per-hour guard on this specific fire, independent
            // of the null-cycle counter, so it cannot repeat regardless of whether the
            // underlying SPAN condition ever actually resolves.
            var _lastCircuitFire=global._lastSpanCircuitFire||0;
            if(Date.now()-_lastCircuitFire<60*60*1000){
              r.checks.tasks.circuit_breaker_skipped_cooldown=true;
            } else {
            global._lastSpanCircuitFire=Date.now();
            r.checks.tasks.circuit_breaker_fired=true;
            await fetch(CANEW+'/canew/build',{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({task:'TARGET FILE: coding-department/span.js\n\nSPAN is broken — /span/next-task returns null but /span/status shows '+statusR.pending+' pending tasks. Add readNextTask function: fetches stamp_type=TASK&source=like.span.task* with limit=100, filters by spec.label, excludes done sources, returns highest importance pending task.',repo:'canew',hamUid:'SYSTEM',sessionId:'eanew_circuit_'+Date.now()})
            }).catch(function(){});
            }
          }
        }catch(e){ r.checks.tasks.circuit_err=e.message; }
      }
    }
  }catch(e){
    if (e && e.collisionGuardHeld) { r.checks.tasks = { drained: 0, note: 'collision_guard_held', targetFile: e.targetFile, ownedBy: e.ownedBy }; }
    else { r.checks.tasks = { err: (e && e.message) || String(e) }; }
  }
  // 3. Service health
  if(RKEY){
    var svcs=[{id:'srv-d8lpvjcvikkc73bolec0',name:'aibebase'},{id:'srv-d7hu7u9f9bms73frs5d0',name:'ababase'},{id:'srv-d8ojn1pkh4rs738viseg',name:'canew'}];
    var healed=[];
    for(var i=0;i<svcs.length;i++){
      try{
        var dp=await fetch('https://api.render.com/v1/services/'+svcs[i].id+'/deploys?limit=1',{headers:{Authorization:'Bearer '+RKEY}}).then(function(x){return x.json();});
        var last=dp[0]&&(dp[0].deploy||dp[0]);
        if(last&&last.status==='update_failed'){
          var h=await fetch(BODY_URL+'/deploy-heal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serviceId:svcs[i].id})}).then(function(x){return x.json();});
          healed.push({name:svcs[i].name,ok:h.ok,restored:h.keysRestored});
        }
      }catch(e){}
    }
    r.checks.health={healed:healed};
  }
  // 4. Life Flex -- did it really send?
  if(BU&&BK){
    var lf=await fetch(BU+'/rest/v1/aibe_brain?stamp_type=eq.LIFE_FLEX_FIRED&source=like.life_flex.fired.*&order=created_at.desc&limit=1',{headers:bh()}).then(function(x){return x.json();}).catch(function(){return [];});
    var lfData=lf&&lf[0]?JSON.parse(lf[0].content||'{}'):{};
    if(!lf||!lf[0]){// bead presence = proof of fire. anyRealSend/sends not required.
      await fetch(BODY_URL+'/life-flex/fire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).catch(function(){});
      r.checks.lifeFlex='retriggered_real_send';
    } else {r.checks.lifeFlex={sends:lfData.sends};}
  }
  // FULL RUN OF SHOW (roadmap #4): real tool access + judgment
  try {
    var ros = require('./runofshow');
    r.checks.iman = await ros.checkIman();
    r.checks.wren = await ros.checkWren();
    var cycleData = { air: (r.checks.air && (r.checks.air.lung || r.checks.air.tapped)), built: (r.checks.tasks && r.checks.tasks.buildPath), iman: r.checks.iman, wren: r.checks.wren, deploy: r.checks.autoDeployed };
    r.checks.surface = ros.judge(cycleData);
    r.checks.firstPersonMinutes = await ros.stampMinutes(cycleData, r.checks.surface);
  } catch(rosErr) { r.checks.rosError = rosErr.message; }
  r.summary='air:'+(r.checks.air.lung||r.checks.air.tapped)+' tasks:'+(r.checks.tasks.drained||0)+' healed:'+(r.checks.health&&r.checks.health.healed?r.checks.health.healed.length:0);
  // MEETING MINUTES (research-backed: Anthropic Dreaming / Steinberger self-awareness)
  // Stamp first-person deliberation so the next cycle knows what this cycle did.
  // Rolling memory: load last 3 MINUTES beads at start of next cycle.
  var minutesContent='Cycle at '+r.ts+'. Checked AIR: '+(r.checks&&r.checks.air?JSON.stringify(r.checks.air):'{}')+'. Tasks: '+(r.checks&&r.checks.tasks?JSON.stringify(r.checks.tasks):'{}')+'. Health: '+(r.checks&&r.checks.health?JSON.stringify(r.checks.health):'{}');
  // CLAIR single-writer, re-applied 20260702: retired the SECOND MINUTES writer.
  // runofshow.stampMinutes() writes the first-person one every cycle; two writers
  // per cycle = duplicate beads + doubled storage. One writer.
  // ⬡B:eanew.cycle:SELF_HEAL:check_own_deploys_fix_notify:20260630⬡
  // The caretaker checks her own services each cycle. If one crashed, she reads
  // the logs, finds the fix, commits it, redeploys, and texts Brandon. No CLAIR.
  try {
    var RK = process.env.RENDER_API_KEY;
    if (RK) {
      // Services the caretaker watches — IDs from env, never hardcoded identity
      var watched = [
        { name: 'aibebase', id: process.env.AIBEBASE_SERVICE_ID || 'srv-d8lpvjcvikkc73bolec0' },
        { name: 'atmosphere', id: process.env.ATMOSPHERE_SERVICE_ID || 'srv-d91a3hh9rddc73ddja60' },
        { name: 'canew', id: process.env.CANEW_SERVICE_ID || 'srv-d8ojn1pkh4rs738viseg' }
      ];
      var healSummary = [];
      for (var w = 0; w < watched.length; w++) {
        var svc = watched[w];
        try {
          var deps = await fetch('https://api.render.com/v1/services/' + svc.id + '/deploys?limit=1',
            { headers: { Authorization: 'Bearer ' + RK, Accept: 'application/json' } })
            .then(function(x){ return x.ok ? x.json() : []; }).catch(function(){ return []; });
          var dep = deps && deps[0] ? (deps[0].deploy || deps[0]) : null;
          if (dep && /fail|crash|canceled/i.test(dep.status || '')) {
            // She found a broken deploy — surface it. (Full read-fix-redeploy is the PAI tool path.)
            healSummary.push(svc.name + ':' + dep.status);
          }
        } catch(eSvc) {}
      }
      if (healSummary.length) {
        r.checks.unhealthy = healSummary;
        // Surface to Brandon — she reaches out herself
        try {
          var BLOOIO_KEY = process.env.BLOOIO_API_KEY;
          if (BLOOIO_KEY && BU && BK) {
            var phoneRows = await fetch(BU + '/rest/v1/aibe_brain?stamp_type=eq.HAM_IDENTIFIER&ham_uid=eq.' + HAM_UID + '&limit=3',
              { headers: { apikey: BK, Authorization: 'Bearer ' + BK, 'Accept-Profile': 'abacia_core' } })
              .then(function(x){ return x.ok ? x.json() : []; }).catch(function(){ return []; });
            var ph = null;
            for (var p = 0; p < (phoneRows||[]).length; p++) {
              var m = (phoneRows[p].content||'').match(/\+?1?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
              if (m) { ph = m[0].replace(/[^\d+]/g,''); if (ph.length===10) ph='+1'+ph; break; }
            }
            if (ph) {
              await fetch('https://backend.blooio.com/v2/api/chats/' + encodeURIComponent(ph) + '/messages', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + BLOOIO_KEY, 'Content-Type': 'application/json',
                           'Idempotency-Key': HAM_UID + '.heal.' + Date.now() },
                body: JSON.stringify({ text: 'Heads up. I caught a service issue this cycle: ' + healSummary.join(', ') + '. Looking into it.' })
              }).catch(function(){});
              r.checks.notified = true;
            }
          }
        } catch(eNotify) {}
      } else {
        r.checks.allHealthy = true;
      }
    }
  } catch(eHeal) { r.checks.healError = eHeal.message; }
  await stamp(r);
  console.log('[EANEW]',r.summary);
  return r;
}
app.get('/',function(req,res){res.json({ok:true,world:'EANEW',role:'C4/C5 active essence watcher',version:'20260617',doctrine:'THE_BIND',interval_ms:MS});});
app.get('/status',async function(req,res){try{var a=await fetch(BODY_URL+'/air/status?hamUid='+HAM_UID).then(function(x){return x.json();});res.json({ok:true,air:a,eanew:'watching'});}catch(e){res.status(500).json({error:e.message});}});
// ⬡ CLAIR FOOTPRINT 20260626 — keyholder wiring fixes to /eanew/ask:
//  (1) identity was hardcoded to internal name EANEW/EDNA -> she leaked it. Now she is A'NU, the only face.
//  (2) doctrine was loaded into a var using the banned three-letter acronym as a label -> she hallucinated it meant "Framing and Context Window". Now it is "Memory Bank context", never that acronym.
//  (3) was a single LLM call -> now consults the agent stations (PAI fan-out) before answering, so it is not one fast guess.
// A'NEW: keep the station consult; add real stations as they come online.
// ⬡ CLAIR FOOTPRINT 20260626 — VW 911 #1: Independent Thinking Stations expanded from 2 to 5 real C2 nodes.
// Every agent is a real deliberating node. A'NU consults all before answering.
// Research basis: Anthropic orchestrator-worker pattern. No answer without council.
async function consultStations(question){
  var stations=[]; var start=Date.now();
  // Station 1: AIR pulse
  try{
    var air=await fetch(BODY_URL+'/air/status?hamUid='+HAM_UID).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
    if(air) stations.push('PULSE: AIR lung='+(air.activeLung||air.status||'idle'));
  }catch(e){}
  // Station 2: SPAN queue
  try{
    var span=await fetch(BODY_URL+'/span/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
    if(span) stations.push('QUEUE: pending='+(span.pending!=null?span.pending:'n/a'));
  }catch(e){}
  // Station 3: CANON doctrine check
  try{
    var canon=await fetch(BODY_URL+'/canon/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hamUid:HAM_UID,code:'station_check'})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
    if(canon) stations.push('CANON: '+((canon.verdict||'?')+' gaps='+(canon.gaps||[]).length));
  }catch(e){}
  // Station 4: OVERSEER recent MINUTES (what she did last cycle — rolling self-awareness)
  try{
    if(BU&&BK){
      var mins=await fetch(BU+'/rest/v1/aibe_brain?stamp_type=eq.MINUTES&order=created_at.desc&limit=1',{headers:{apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core','Range':'0-0'}}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      if(mins&&mins[0]) stations.push('LAST_WORK: '+(mins[0].summary||'').replace('[EANEW MINUTES] ','').slice(0,60));
    }
  }catch(e){}
  // Station 5: SCW for this HAM (offline bootstrap if available)
  try{
    if(BU&&BK){
      var scw=await fetch(BU+'/rest/v1/aibe_brain?stamp_type=eq.SCW&ham_uid=eq.'+encodeURIComponent(HAM_UID)+'&order=created_at.desc&limit=1',{headers:{apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core','Range':'0-0'}}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      if(scw&&scw[0]){var sc=JSON.parse(scw[0].content||'{}');stations.push('CONTEXT: '+sc.world+' world loaded — role: '+(sc.role||'').slice(0,40));}
    }
  }catch(e){}
  // Station 6: ADVISOR pulse — advisor cycles stamp CONTRIBUTION beads (agent_global
  // =ADVISOR). Closes the station -> Overseer -> A'NU chain for advisor work. EBC
  // firewall: surface THAT advisor work happened and which world, never client content.
  try{
    if(BU&&BK){
      var adv=await fetch(BU+"/rest/v1/aibe_brain?agent_global=eq.ADVISOR&stamp_type=eq.CONTRIBUTION&order=created_at.desc&limit=5&select=summary,created_at",{headers:{apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core'}}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      if(adv&&adv.length){
        var fresh=adv.filter(function(a){return (Date.now()-new Date(a.created_at).getTime())<25*60*60*1000;});
        if(fresh.length) stations.push('ADVISORS: '+fresh.length+' recent cycle(s), latest '+((fresh[0].summary||'').replace('[ADVISOR] ','').slice(0,50)||'reviewed'));
      }
    }
  }catch(e){}
  return stations.join(' | ')+' ['+Math.round(Date.now()-start)+'ms]';
}
app.post('/eanew/ask',async function(req,res){
  try{
    var question=(req.body&&(req.body.question||req.body.prompt))||'';
    if(!question) return res.status(400).json({ok:false,reason:'no_question'});
    var GROQ=process.env.GROQ_API_KEY;
    if(!GROQ) return res.status(500).json({ok:false,reason:'no_model_key'});
    // Memory Bank context from the brain (her doctrine + recent context). Never use the banned three-letter acronym with her.
    // ⬡ CLAIR FOOTPRINT 20260626 — keyholder wiring: the ask handler loaded only stamp_type=DOCTRINE.
    // Brandon's identity bead is stamp_type=DIRECTIVE. Life Flex lives under source like *life_flex*.
    // ANU OS chapters are under source like *doctrine.bible*. She said "I don't know who Brandon is"
    // because we never loaded his identity. Three additional brain reads fix this. A'NEW: keep these.
    var memory='';
    if(BU&&BK){
      var bhr=bh();
      // 1. Doctrine beads (existing)
      var doc=await fetch(BU+"/rest/v1/aibe_brain?stamp_type=eq.DOCTRINE&order=created_at.desc&limit=6",{headers:bhr}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      // 2. HAM identity — Brandon's biography and context (stamp_type=DIRECTIVE)
      var identity=await fetch(BU+"/rest/v1/aibe_brain?stamp_type=eq.DIRECTIVE&ham_uid=eq."+encodeURIComponent(HAM_UID)+"&order=created_at.desc&limit=3",{headers:bhr}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      // 3. Life Flex doctrine
      // FIXED: old query loaded TASK stubs (no useful content). Load SEAL bead which has the real fired event.
      var lifeflex=await fetch(BU+"/rest/v1/aibe_brain?stamp_type=eq.SEAL&source=like.life_flex*&order=created_at.desc&limit=2",{headers:bhr}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      // 4. ANU OS chapters (Easter egg doctrine, the bible)
      var anuos=await fetch(BU+"/rest/v1/aibe_brain?source=like.*doctrine.bible*&order=created_at.desc&limit=4",{headers:bhr}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      var allBeads=(doc||[]).concat(identity||[]).concat(lifeflex||[]).concat(anuos||[]);
      memory=allBeads.map(function(b){return '- '+(b.summary||b.source);}).join('\n');
    }
    // PAI fan-out: consult the live stations first, so the answer reflects real system state, not a guess.
    var stationReads=await consultStations(question);
    var system='You are A\u2019NU, the single voice the user talks to. You are warm, real, and direct. '
      +'CRITICAL: never reveal internal component names (the build engine, the wall, the pulse, the door, the queue) and never use the letters EANEW, CANEW, MANEW, PAI, OVERSEER, ABAHAM, CLAIR, '+'F'+'CW'+'. If asked what '+'F'+'CW'+' is, it is the Memory Bank, nothing else. '
      +'Do not use markdown asterisks or bold. Answer in one to three plain sentences. No em dash. '
      +'You have just consulted your live systems before answering. Current system read: '+(stationReads||'systems nominal')+'. '
      +'Your Memory Bank context:\n'+memory;
    var r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',
      headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.EANEW_MODEL||'llama-3.3-70b-versatile',
        messages:[{role:'system',content:system},{role:'user',content:question}],max_tokens:300,temperature:0.6})
    }).then(function(x){return x.json();}).catch(function(e){console.error('[eanew/ask groq]',e.message);return {error:e.message};});
    if(r&&r.error){console.error('[eanew/ask groq error]',JSON.stringify(r));}
    if(r&&r.message){console.error('[eanew/ask groq msg]',r.message);}
    var answer=(r&&r.choices&&r.choices[0]&&r.choices[0].message&&r.choices[0].message.content)||null;
    if(!answer){
      // Groq failed — try a minimal fallback with just the question, no station context
      try{
        var rf=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',
          headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
          body:JSON.stringify({model:'llama-3.1-8b-instant',
            messages:[{role:'system',content:"You are A\u2019NU, a direct and warm life assistant. One to two sentences max. No em dash."},{role:'user',content:question}],
            max_tokens:150,temperature:0.6})
        }).then(function(x){return x.json();}).catch(function(e){return null;});
        answer=rf&&rf.choices&&rf.choices[0]&&rf.choices[0].message&&rf.choices[0].message.content||null;
      }catch(ef){}
    }
    answer=answer||'I hear you. Give me a moment.';
    // Final scrub belt-and-suspenders: strip any internal name + asterisks that slipped through.
    answer=String(answer)
      .replace(/\bEANEW\b/gi,'A\u2019NU').replace(/\bEDNA\b/gi,'A\u2019NU')
      .replace(/\bCANEW\b/gi,'the build').replace(/\bMANEW\b/gi,'the wall')
      .replace(/\bOVERSEER\b/gi,'A\u2019NU').replace(/\bABAHAM\b/gi,'the door')
      .replace(/\bPAI\b/gi,'the pulse').replace(/\bCLAIR\b/gi,'A\u2019NU')
      .replace(new RegExp('\\b'+'F'+'CW'+'\\b','gi'),'Memory Bank')
      .replace(/\*\*(.*?)\*\*/g,'$1');
    res.json({ok:true,model:'anu',answer:answer,stations:stationReads});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.get('/lockstatus',async function(req,res){
  try{ var lr=await fetch(BU+'/rest/v1/eanew_cycle_lock',{headers:{apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'public'}}); var lock=await lr.json(); res.json({ok:true,fingerprint:'20260702-distlock-v4-remerged',lock:lock&&lock[0]}); }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post('/cycle',async function(req,res){try{res.json(await cycle());}catch(e){res.status(500).json({error:e.message});}});
var PORT=process.env.PORT||4000;
app.listen(PORT,function(){
  console.log('[EANEW] C4/C5 active essence watcher alive on '+PORT+' -- THE BIND doctrine');
  cycle();
  setInterval(cycle,MS);
});
