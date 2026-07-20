'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const serviceAlert=require('../core/caretaker/service-alert.js');

function response(status,data){return{ok:status>=200&&status<300,status:status,
  json:async function(){return data;}};}

function incident(overrides){return Object.assign({hamUid:'DC499D0C',
  serviceId:'srv-aibebase',serviceName:'aibebase',deployId:'dep-build-001',
  status:'build_failed',commitId:'a'.repeat(40),
  deployCreatedAt:'2026-07-20T00:45:00.000Z'},overrides||{});}

function harness(options){
  options=options||{};var calls=[],accepted=new Map(),acceptedCount=0;
  async function fakeFetch(rawUrl,init){
    var url=new URL(rawUrl);assert.equal(url.pathname,'/reach/incident');
    var body=JSON.parse(init.body);calls.push({body:body,headers:init.headers});
    var prior=accepted.get(body.requestId);
    var cycleId=body.hamUid+'.incident.'+body.requestId.slice(-12);
    var result={ok:true,accepted:true,pending:false,reused:!!prior,
      requestId:body.requestId,cycleId:cycleId,
      incidentSource:'reach.incident.'+body.hamUid+'.'+body.requestId.slice('eanew.render.'.length),
      terminalSource:'reach.incident.terminal.'+body.hamUid+'.'+body.requestId.slice('eanew.render.'.length),
      candidateSource:'reach.candidate.'+body.hamUid+'.'+cycleId};
    if(options.mode==='fail')return response(503,{ok:false,reason:'server_unavailable'});
    if(options.mode==='pending')return response(202,{ok:false,pending:true,
      requestId:body.requestId,reason:'reach_incident_reconciliation_pending'});
    if(options.mode==='held')return response(201,{ok:true,accepted:false,held:true,
      pending:false,reused:false,requestId:body.requestId,cycleId:cycleId,
      reason:'reach_incident_intake_held',terminalSource:result.terminalSource});
    if(!prior){accepted.set(body.requestId,result);acceptedCount++;}
    if(options.mode==='lost_first'&&calls.length===1)throw new Error('response_lost');
    return response(prior?200:201,result);
  }
  return{calls:calls,accepted:accepted,acceptedCount:function(){return acceptedCount;},
    config:{baseUrl:'https://aibebase.test',key:'test-shared-key',fetch:fakeFetch,
      now:function(){return 1784512800000;},
      randomUUID:function(){return'nonce.00000000000000000001';},timeoutMs:5000}};
}

test('persistent failed deploy keeps one stable body and one server incident',async function(){
  var h=harness();
  var first=await serviceAlert.submitServiceAlert(incident(),h.config);
  var second=await serviceAlert.submitServiceAlert(incident(),h.config);
  var third=await serviceAlert.submitServiceAlert(incident(),h.config);
  assert.equal(first.reachSubmitted,true);assert.equal(first.duplicateHeld,false);
  assert.equal(second.reachSubmitted,true);assert.equal(second.duplicateHeld,true);
  assert.equal(third.duplicateHeld,true);assert.equal(h.acceptedCount(),1);
  assert.equal(h.calls.length,3);
  assert.deepEqual(h.calls.map(function(call){return call.body;}),
    [h.calls[0].body,h.calls[0].body,h.calls[0].body]);
});

test('parallel observations share one signed HTTP intake',async function(){
  var h=harness();var results=await Promise.all([
    serviceAlert.submitServiceAlert(incident(),h.config),
    serviceAlert.submitServiceAlert(incident(),h.config),
    serviceAlert.submitServiceAlert(incident(),h.config)]);
  assert.equal(results.every(function(result){return result.reachSubmitted;}),true);
  assert.equal(h.calls.length,1);assert.equal(h.acceptedCount(),1);
});

test('restart reuses stable server terminal while new deploy creates a new identity',async function(){
  var h=harness();
  var first=await serviceAlert.submitServiceAlert(incident(),h.config);
  var restart=await serviceAlert.submitServiceAlert(incident(),h.config);
  var newer=await serviceAlert.submitServiceAlert(incident({deployId:'dep-build-002'}),h.config);
  assert.equal(restart.duplicateHeld,true);assert.equal(newer.reachSubmitted,true);
  assert.notEqual(first.requestId,newer.requestId);assert.equal(h.acceptedCount(),2);
});

test('same service/deploy/status remains isolated for two HAMs',async function(){
  var h=harness();
  var one=await serviceAlert.submitServiceAlert(incident({hamUid:'DC499D0C'}),h.config);
  var two=await serviceAlert.submitServiceAlert(incident({hamUid:'AB12CD34'}),h.config);
  assert.equal(one.reachSubmitted,true);assert.equal(two.reachSubmitted,true);
  assert.notEqual(one.requestId,two.requestId);assert.equal(h.acceptedCount(),2);
  assert.deepEqual(h.calls.map(function(call){return call.body.hamUid;}),
    ['DC499D0C','AB12CD34']);
});

test('missing or malformed HAM and unapproved status fail before network',async function(){
  var h=harness();
  var missing=await serviceAlert.submitServiceAlert(incident({hamUid:''}),h.config);
  var malformed=await serviceAlert.submitServiceAlert(incident({hamUid:'SYSTEM'}),h.config);
  var crash=await serviceAlert.submitServiceAlert(incident({status:'runtime_crash'}),h.config);
  assert.equal(missing.reason,'ham_uid_invalid');assert.equal(malformed.reason,'ham_uid_invalid');
  assert.equal(crash.reason,'incident_status_invalid');assert.equal(h.calls.length,0);
});

test('non-2xx and durable 202 never become a delivered/notified claim',async function(){
  var failed=harness({mode:'fail'});
  var failure=await serviceAlert.submitServiceAlert(incident(),failed.config);
  assert.equal(failure.reachSubmitted,false);assert.equal(failure.pending,true);
  var pending=harness({mode:'pending'});
  var held=await serviceAlert.submitServiceAlert(incident({deployId:'dep-pending'}),pending.config);
  assert.equal(held.reachSubmitted,false);assert.equal(held.duplicateHeld,true);
  assert.equal(held.pending,true);assert.equal(held.reason,'reach_incident_reconciliation_pending');
});

test('durable INTAKE_HELD is a duplicate hold and never a REACH submission claim',async function(){
  var h=harness({mode:'held'});
  var held=await serviceAlert.submitServiceAlert(incident(),h.config);
  assert.equal(held.ok,true);assert.equal(held.reachSubmitted,false);
  assert.equal(held.duplicateHeld,true);assert.equal(held.pending,false);
  assert.equal(held.reason,'reach_incident_intake_held');
});

test('three watched services begin one parallel wave inside the shared 45 second budget',async function(){
  var started=[],release;
  var gate=new Promise(function(resolve){release=resolve;});
  var config={baseUrl:'https://aibebase.test',key:'test-shared-key',
    timeoutMs:80000,now:function(){return 1784512800000;},
    randomUUID:function(){return'nonce.00000000000000000001';},
    fetch:async function(url,init){
      var request=JSON.parse(init.body);started.push(request.incident.deployId);
      await gate;
      var cycleId=request.hamUid+'.incident.'+request.requestId.slice(-12);
      return response(201,{ok:true,accepted:true,held:false,pending:false,reused:false,
        requestId:request.requestId,cycleId:cycleId,
        candidateSource:'reach.candidate.'+request.hamUid+'.'+cycleId,
        terminalSource:'reach.incident.terminal.'+request.hamUid+'.'+
          request.requestId.slice('eanew.render.'.length)});
    }};
  var pending=serviceAlert.submitServiceAlerts([
    incident({deployId:'dep-build-101'}),incident({deployId:'dep-build-102'}),
    incident({deployId:'dep-build-103'})],config);
  await new Promise(function(resolve){setImmediate(resolve);});
  assert.deepEqual(started.sort(),['dep-build-101','dep-build-102','dep-build-103']);
  release();
  var results=await pending;
  assert.equal(results.length,3);
  assert.equal(results.every(function(result){return result.reachSubmitted;}),true);
});

test('lost response retries the exact body and reuses the durable server acceptance',async function(){
  var h=harness({mode:'lost_first'});
  var first=await serviceAlert.submitServiceAlert(incident(),h.config);
  var retry=await serviceAlert.submitServiceAlert(incident(),h.config);
  assert.equal(first.reachSubmitted,false);assert.equal(first.pending,true);
  assert.equal(retry.reachSubmitted,true);assert.equal(retry.duplicateHeld,true);
  assert.equal(h.acceptedCount(),1);assert.deepEqual(h.calls[0].body,h.calls[1].body);
});

test('signed authorization binds exact path, HAM, request, body, expiry, and nonce',function(){
  var normalized=serviceAlert._test.normalizeIncident(incident());
  var expires=1784512860000,nonce='nonce.00000000000000000001';
  var signature=serviceAlert._test.sign(normalized.body,'test-shared-key',expires,nonce);
  assert.match(signature,/^[a-f0-9]{64}$/);
  var payload=serviceAlert._test.authorizationPayload(normalized.body,expires,nonce);
  var expected=crypto.createHmac('sha256','test-shared-key')
    .update(Buffer.from(serviceAlert._test.stableStringify(payload),'utf8')).digest('hex');
  assert.equal(signature,expected);
  var changed=JSON.parse(JSON.stringify(normalized.body));changed.hamUid='AB12CD34';
  assert.notEqual(serviceAlert._test.sign(changed,'test-shared-key',expires,nonce),signature);
  var changedPayload=Object.assign({},payload,{path:'/reach/out'});
  var wrongPath=crypto.createHmac('sha256','test-shared-key')
    .update(Buffer.from(serviceAlert._test.stableStringify(changedPayload),'utf8')).digest('hex');
  assert.notEqual(wrongPath,signature);
});

test('only A’NU-approved terminal statuses normalize',function(){
  assert.equal(serviceAlert._test.normalizeStatus('BUILD FAILED'),'build_failed');
  assert.equal(serviceAlert._test.normalizeStatus('update-failed'),'update_failed');
  assert.equal(serviceAlert._test.normalizeStatus('cancelled'),'canceled');
  assert.throws(function(){serviceAlert._test.normalizeStatus('live');},
    /incident_status_invalid/);
});

test('caretaker path contains no direct provider, phone lookup, or notified flag',function(){
  var helper=fs.readFileSync(path.join(__dirname,'../core/caretaker/service-alert.js'),'utf8');
  var index=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
  [helper,index].forEach(function(source){
    assert.doesNotMatch(source,/backend\.blooio\.com/);
    assert.doesNotMatch(source,/BLOOIO_API_KEY/);
    assert.doesNotMatch(source,/HAM_IDENTIFIER/);
    assert.doesNotMatch(source,/checks\.notified/);
  });
});
