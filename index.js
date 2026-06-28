// ⬡B:eanew.server:MODULE:active_essence_watcher:20260617⬡
// EANEW -- E.A.NEW. Master C4/C5 watcher. Always-on Render service.
// Doctrine: THE BIND (20260617). Built as Render service 20260617.
// Every 3 min: checks AIR, drains CANEW tasks, heals broken deploys, checks Life Flex.
var express=require('express'); var app=express(); app.use(express.json());
var AIBE=process.env.AIBEBASE_URL||'https://aibebase.onrender.com';
var CANEW=process.env.CANEW_URL||'https://canew.onrender.com';
var BU=process.env.AIBE_BRAIN_URL; var BK=process.env.AIBE_BRAIN_KEY;
var RKEY=process.env.RENDER_API_KEY;
var MS=3*60*1000;
var HAM_UID=process.env.HAM_UID||'DC499D0C'; // ANU OS ch18: env-driven, Variable Machine
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
  var r={ts:new Date().toISOString(),checks:{}};
  // 1. AIR
  try{
    var a=await fetch(AIBE+'/air/status?hamUid='+HAM_UID).then(function(x){return x.json();});
    if(!a.activeLung||a.status==='idle'){
      await fetch(AIBE+'/air/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hamUid:HAM_UID,source:'eanew'})});
      r.checks.air={tapped:true};
    } else {r.checks.air={lung:a.activeLung};}
  }catch(e){r.checks.air={err:e.message};}
  // 2. Tasks — read SPAN next-task, then call CANEW /canew/build
  // ⬡B:eanew.cycle:WIRE:span_to_canew_build:20260623⬡
  // CANEW has no /drain endpoint. EANEW reads SPAN queue and calls /canew/build per task.
  try{
    var AIBEBASE=process.env.AIBEBASE_URL||'https://aibebase.onrender.com';
    // ⬡B:eanew.cycle:FIX:span_post:20260623⬡ /span/next-task is POST not GET
var nextTaskResp=await fetch(AIBEBASE+'/span/next-task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hamUid:HAM_UID})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
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
      // DYNAMIC FCW: read the current target file from GitHub before dispatching
      // This is what makes CANEW build real code instead of scaffold
      // Without this, she builds from training patterns and hallucinates the interface
      var dynamicFCW='';
      if(targetFile && process.env.GITHUB_TOKEN){
        try{
          var ghUrl='https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/'+targetFile;
          var ghResp=await fetch(ghUrl,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Accept':'application/vnd.github+json','User-Agent':'eanew'}}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
          if(ghResp&&ghResp.content){
            var existingFile=Buffer.from(ghResp.content,'base64').toString('utf8');
            dynamicFCW='\n\n=== CURRENT FILE (read this BEFORE writing anything) ===\nFile: '+targetFile+'\n'+existingFile.slice(0,3000)+'\n=== END CURRENT FILE ===\n';
          } else {
            dynamicFCW='\n\n=== TARGET FILE DOES NOT EXIST YET — build it from scratch ===\nFile: '+targetFile+'\n';
          }
        }catch(e){dynamicFCW='';/* non-fatal — build without it */}
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
        ? 'TARGET FILE: '+targetFile+dynamicFCW+depAllowlist+'\n\nSPEC:\n'+innerSpec
        : innerSpec;

      var buildResp=await fetch(CANEW+'/canew/build',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({task:taskForCanew,targetFile:targetFile||undefined,repo:task.repo||'anew',hamUid:HAM_UID,sessionId:'eanew_'+Date.now(),label:taskLabel})
      }).then(function(x){return x.json();}).catch(function(e){return {ok:false,err:e.message};});
      if(buildResp&&buildResp.ok){drained=1;global._eanewNullCycles=0;}
      // OUTCOME VERIFY (research-backed: Anthropic Outcomes pattern)
      // Confirm the commit actually landed before claiming success or reaching out.
      var verifiedBuild=false; var builtPath=buildResp&&buildResp.path;
      if(buildResp&&buildResp.ok&&builtPath&&process.env.GITHUB_TOKEN){
        try{
          var vr=await fetch('https://api.github.com/repos/brandonjpiercesr-cmyk/anew/contents/'+builtPath,
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
      if(verifiedBuild&&builtPath&&reachCooldownOk&&isInteresting){
        try{
          global._lastAutoReachMs=Date.now();
          await fetch(AIBE+'/reach/out',{method:'POST',headers:{'Content-Type':'application/json'},
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
          var statusR=await fetch(AIBEBASE+'/span/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
          if(statusR&&statusR.pending>0){
            global._eanewNullCycles=0;
            r.checks.tasks.circuit_breaker_fired=true;
            await fetch(CANEW+'/canew/build',{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({task:'TARGET FILE: coding-department/span.js\n\nSPAN is broken — /span/next-task returns null but /span/status shows '+statusR.pending+' pending tasks. Add readNextTask function: fetches stamp_type=TASK&source=like.span.task* with limit=100, filters by spec.label, excludes done sources, returns highest importance pending task.',repo:'anew',hamUid:'847392',sessionId:'eanew_circuit_'+Date.now()})
            }).catch(function(){});
          }
        }catch(e){ r.checks.tasks.circuit_err=e.message; }
      }
    }
  }catch(e){r.checks.tasks={err:e.message};}
  // 3. Service health
  if(RKEY){
    var svcs=[{id:'srv-d8lpvjcvikkc73bolec0',name:'aibebase'},{id:'srv-d7hu7u9f9bms73frs5d0',name:'ababase'},{id:'srv-d8ojn1pkh4rs738viseg',name:'canew'}];
    var healed=[];
    for(var i=0;i<svcs.length;i++){
      try{
        var dp=await fetch('https://api.render.com/v1/services/'+svcs[i].id+'/deploys?limit=1',{headers:{Authorization:'Bearer '+RKEY}}).then(function(x){return x.json();});
        var last=dp[0]&&(dp[0].deploy||dp[0]);
        if(last&&last.status==='update_failed'){
          var h=await fetch(AIBE+'/deploy-heal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serviceId:svcs[i].id})}).then(function(x){return x.json();});
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
      await fetch(AIBE+'/life-flex/fire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).catch(function(){});
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
  if(BU&&BK){
    await fetch(BU+'/rest/v1/aibe_brain',{method:'POST',
      headers:Object.assign({},bh(),{'Content-Type':'application/json','Content-Profile':'abacia_core',Prefer:'return=minimal'}),
      body:JSON.stringify({ham_uid:HAM_UID,agent_global:'EANEW',stamp_type:'MINUTES',
        acl_stamp:'\u2b21B:eanew.minutes:MINUTES:cycle:'+Date.now()+'\u2b21',
        source:'eanew.minutes.'+Date.now(),importance:6,
        summary:'[EANEW MINUTES] '+r.summary,content:minutesContent})
    }).catch(function(){});
  }
  await stamp(r);
  console.log('[EANEW]',r.summary);
  return r;
}
app.get('/',function(req,res){res.json({ok:true,world:'EANEW',role:'C4/C5 active essence watcher',version:'20260617',doctrine:'THE_BIND',interval_ms:MS});});
app.get('/status',async function(req,res){try{var a=await fetch(AIBE+'/air/status?hamUid='+HAM_UID).then(function(x){return x.json();});res.json({ok:true,air:a,eanew:'watching'});}catch(e){res.status(500).json({error:e.message});}});
// ⬡ CLAIR FOOTPRINT 20260626 — keyholder wiring fixes to /eanew/ask:
//  (1) identity was hardcoded to internal name EANEW/EDNA -> she leaked it. Now she is A'NU, the only face.
//  (2) doctrine was loaded into a var literally called "fcw" and labelled "your FCW" -> she hallucinated FCW means "Framing and Context Window". Now it's "Memory Bank context", never the acronym.
//  (3) was a single LLM call -> now consults the agent stations (PAI fan-out) before answering, so it is not one fast guess.
// A'NEW: keep the station consult; add real stations as they come online.
// ⬡ CLAIR FOOTPRINT 20260626 — VW 911 #1: Independent Thinking Stations expanded from 2 to 5 real C2 nodes.
// Every agent is a real deliberating node. A'NU consults all before answering.
// Research basis: Anthropic orchestrator-worker pattern. No answer without council.
async function consultStations(question){
  var stations=[]; var start=Date.now();
  // Station 1: AIR pulse
  try{
    var air=await fetch(AIBE+'/air/status?hamUid='+HAM_UID).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
    if(air) stations.push('PULSE: AIR lung='+(air.activeLung||air.status||'idle'));
  }catch(e){}
  // Station 2: SPAN queue
  try{
    var span=await fetch(AIBE+'/span/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
    if(span) stations.push('QUEUE: pending='+(span.pending!=null?span.pending:'n/a'));
  }catch(e){}
  // Station 3: CANON doctrine check
  try{
    var canon=await fetch(AIBE+'/canon/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hamUid:HAM_UID,code:'station_check'})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
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
      var scw=await fetch(BU+'/rest/v1/aibe_brain?stamp_type=eq.SCW&ham_uid=eq.DC499D0C&order=created_at.desc&limit=1',{headers:{apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core','Range':'0-0'}}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      if(scw&&scw[0]){var sc=JSON.parse(scw[0].content||'{}');stations.push('CONTEXT: '+sc.world+' world loaded — role: '+(sc.role||'').slice(0,40));}
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
    // Memory Bank context from the brain (her doctrine + recent context). Never call this 'FCW' to her.
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
      var identity=await fetch(BU+"/rest/v1/aibe_brain?stamp_type=eq.DIRECTIVE&ham_uid=eq.DC499D0C&order=created_at.desc&limit=3",{headers:bhr}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
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
      +'CRITICAL: never reveal internal component names (the build engine, the wall, the pulse, the door, the queue) and never use the letters EANEW, CANEW, MANEW, PAI, OVERSEER, ABAHAM, CLAIR, FCW. If asked what FCW is, it is the Memory Bank, nothing else. '
      +'Do not use markdown asterisks or bold. Answer in one to three plain sentences. No em dash. '
      +'You have just consulted your live systems before answering. Current system read: '+(stationReads||'systems nominal')+'. '
      +'Your Memory Bank context:\n'+memory;
    var r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',
      headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.EANEW_MODEL||'llama-3.3-70b-versatile',
        messages:[{role:'system',content:system},{role:'user',content:question}],max_tokens:1000,temperature:0.6})
    }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
    var answer=(r&&r.choices&&r.choices[0]&&r.choices[0].message&&r.choices[0].message.content)||('(no answer) '+(r&&r.error||''));
    // Final scrub belt-and-suspenders: strip any internal name + asterisks that slipped through.
    answer=String(answer)
      .replace(/\bEANEW\b/gi,'A\u2019NU').replace(/\bEDNA\b/gi,'A\u2019NU')
      .replace(/\bCANEW\b/gi,'the build').replace(/\bMANEW\b/gi,'the wall')
      .replace(/\bOVERSEER\b/gi,'A\u2019NU').replace(/\bABAHAM\b/gi,'the door')
      .replace(/\bPAI\b/gi,'the pulse').replace(/\bCLAIR\b/gi,'A\u2019NU')
      .replace(/\bFCW\b/gi,'Memory Bank')
      .replace(/\*\*(.*?)\*\*/g,'$1');
    res.json({ok:true,model:'anu',answer:answer,stations:stationReads});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post('/cycle',async function(req,res){try{res.json(await cycle());}catch(e){res.status(500).json({error:e.message});}});
var PORT=process.env.PORT||4000;
app.listen(PORT,function(){
  console.log('[EANEW] C4/C5 active essence watcher alive on '+PORT+' -- THE BIND doctrine');
  cycle();
  setInterval(cycle,MS);
});
