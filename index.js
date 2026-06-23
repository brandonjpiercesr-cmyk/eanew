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
    var nextTaskResp=await fetch(AIBEBASE+'/span/next-task?hamUid=DC499D0C',{headers:{'Content-Type':'application/json'}}).then(function(x){return x.ok?x.json():null;}).catch(function(){return null;});
    var drained=0;
    if(nextTaskResp&&nextTaskResp.task){
      var task=nextTaskResp.task;
      var taskSpec=(task.spec||task.task||'');
      var buildResp=await fetch(CANEW+'/canew/build',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({task:taskSpec,repo:task.repo||'anew',hamUid:'DC499D0C',sessionId:'eanew_'+Date.now()})
      }).then(function(x){return x.json();}).catch(function(e){return {ok:false,err:e.message};});
      if(buildResp&&buildResp.ok){drained=1;}
      r.checks.tasks={drained:drained,task:task.label||task.source,buildOk:!!(buildResp&&buildResp.ok),buildPath:buildResp&&buildResp.path};
    } else {
      r.checks.tasks={drained:0,note:'span_had_nothing'};
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
app.post('/cycle',async function(req,res){try{res.json(await cycle());}catch(e){res.status(500).json({error:e.message});}});
var PORT=process.env.PORT||4000;
app.listen(PORT,function(){
  console.log('[EANEW] C4/C5 active essence watcher alive on '+PORT+' -- THE BIND doctrine');
  cycle();
  setInterval(cycle,MS);
});
