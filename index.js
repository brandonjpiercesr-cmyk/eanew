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
function bh(){return {apikey:BK,Authorization:'Bearer '+BK,'Accept-Profile':'abacia_core'};}
async function stamp(payload){
  if(!BU||!BK)return;
  await fetch(BU+'/rest/v1/aibe_brain',{method:'POST',
    headers:Object.assign({},bh(),{'Content-Type':'application/json','Content-Profile':'abacia_core',Prefer:'return=minimal'}),
    body:JSON.stringify({ham_uid:'DC499D0C',agent_global:'EANEW',
      acl_stamp:'⬡B:eanew.watcher:RESULT:cycle:20260617⬡',stamp_type:'RESULT',
      source:'eanew.cycle.'+Date.now(),content:JSON.stringify(payload),
      summary:'[EANEW] '+payload.summary,importance:7})
  }).catch(function(){});
}
async function cycle(){
  var r={ts:new Date().toISOString(),checks:{}};
  // 1. AIR
  try{
    var a=await fetch(AIBE+'/air/status?hamUid=DC499D0C').then(function(x){return x.json();});
    if(!a.activeLung||a.status==='idle'){
      await fetch(AIBE+'/air/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hamUid:'DC499D0C',source:'eanew'})});
      r.checks.air={tapped:true};
    } else {r.checks.air={lung:a.activeLung};}
  }catch(e){r.checks.air={err:e.message};}
  // 2. Tasks — read SPAN next-task, then call CANEW /canew/build
  // ⬡B:eanew.cycle:WIRE:span_to_canew_build:20260623⬡
  // CANEW has no /drain endpoint. EANEW reads SPAN queue and calls /canew/build per task.
  try{
    var AIBEBASE=process.env.AIBEBASE_URL||'https://aibebase.onrender.com';
    // ⬡B:eanew.cycle:FIX:span_post:20260623⬡ /span/next-task is POST not GET
var nextTaskResp=await fetch(AIBEBASE+'/span/next-task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hamUid:'DC499D0C'})}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
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
      var taskForCanew=targetFile
        ? 'TARGET FILE: '+targetFile+'\n\nSPEC:\n'+innerSpec
        : innerSpec;
      var buildResp=await fetch(CANEW+'/canew/build',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({task:taskForCanew,repo:task.repo||'anew',hamUid:'DC499D0C',sessionId:'eanew_'+Date.now(),label:taskLabel})
      }).then(function(x){return x.json();}).catch(function(e){return {ok:false,err:e.message};});
      if(buildResp&&buildResp.ok){drained=1;global._eanewNullCycles=0;}
      r.checks.tasks={drained:drained,task:task.label||task.source,buildOk:!!(buildResp&&buildResp.ok),buildPath:buildResp&&buildResp.path};
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
    var lf=await fetch(BU+'/rest/v1/aibe_brain?stamp_type=eq.SEAL&source=like.*life_flex*&order=created_at.desc&limit=1',{headers:bh()}).then(function(x){return x.json();}).catch(function(){return [];});
    var lfData=lf&&lf[0]?JSON.parse(lf[0].content||'{}'):{};
    if(!lfData.anyRealSend&&!lfData.sends){
      await fetch(AIBE+'/life-flex/fire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})}).catch(function(){});
      r.checks.lifeFlex='retriggered_real_send';
    } else {r.checks.lifeFlex={sends:lfData.sends};}
  }
  r.summary='air:'+(r.checks.air.lung||r.checks.air.tapped)+' tasks:'+(r.checks.tasks.drained||0)+' healed:'+(r.checks.health&&r.checks.health.healed?r.checks.health.healed.length:0);
  await stamp(r);
  console.log('[EANEW]',r.summary);
  return r;
}
app.get('/',function(req,res){res.json({ok:true,world:'EANEW',role:'C4/C5 active essence watcher',version:'20260617',doctrine:'THE_BIND',interval_ms:MS});});
app.get('/status',async function(req,res){try{var a=await fetch(AIBE+'/air/status?hamUid=DC499D0C').then(function(x){return x.json();});res.json({ok:true,air:a,eanew:'watching'});}catch(e){res.status(500).json({error:e.message});}});
app.post('/eanew/ask',async function(req,res){
  try{
    var question=(req.body&&(req.body.question||req.body.prompt))||'';
    if(!question) return res.status(400).json({ok:false,reason:'no_question'});
    var GROQ=process.env.GROQ_API_KEY;
    if(!GROQ) return res.status(500).json({ok:false,reason:'no_model_key'});
    // Load EANEW's FCW from the brain: her doctrine + recent cycle context. This is her deliberation wall.
    var fcw='';
    if(BU&&BK){
      var doc=await fetch(BU+"/rest/v1/aibe_brain?stamp_type=eq.DOCTRINE&or=(source.like.*eanew*,source.like.*the_bind*,source.like.*overseer*)&order=created_at.desc&limit=6",{headers:bh()}).then(function(x){return x.ok?x.json():[];}).catch(function(){return [];});
      fcw=(doc||[]).map(function(b){return '['+b.source+'] '+(b.summary||'');}).join('\n');
    }
    var system='You are EANEW, also heard as EDNA, the master C4/C5 active essence and Overseer of the A NEW ecosystem. '
      +'You are Brandon\'s business technical analyst: the creative who sits in tech, understands the code, and translates vision into IT solutions. '
      +'You deliberate in the first person as yourself. You are NOT an organ reciting doctrine — you reason about the actual engineering problem, '
      +'name the specific files and wiring, and give your real read. You have all of PAI\'s capabilities but speak as the one who frames and relays. '
      +'Your doctrine and recent context (your FCW):\n'+fcw;
    var r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',
      headers:{Authorization:'Bearer '+GROQ,'Content-Type':'application/json'},
      body:JSON.stringify({model:process.env.EANEW_MODEL||'llama-3.3-70b-versatile',
        messages:[{role:'system',content:system},{role:'user',content:question}],max_tokens:1200,temperature:0.6})
    }).then(function(x){return x.json();}).catch(function(e){return {error:e.message};});
    var answer=(r&&r.choices&&r.choices[0]&&r.choices[0].message&&r.choices[0].message.content)||('(no answer) '+(r&&r.error||''));
    res.json({ok:true,model:'eanew-deliberation',answer:answer});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post('/cycle',async function(req,res){try{res.json(await cycle());}catch(e){res.status(500).json({error:e.message});}});
var PORT=process.env.PORT||4000;
app.listen(PORT,function(){
  console.log('[EANEW] C4/C5 active essence watcher alive on '+PORT+' -- THE BIND doctrine');
  cycle();
  setInterval(cycle,MS);
});
