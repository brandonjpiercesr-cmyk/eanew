// ⬡B:core.caretaker.service_alert:FIX:signed_canonical_reach_incident_intake:20260720⬡
// The caretaker signs one immutable service incident for A'NEW. It never reads
// contact data, calls a provider, or claims that a human effect occurred.
'use strict';

const crypto = require('node:crypto');

const VERSION = 'anew.reach.service-incident.v1';
const EFFECT_VERSION = 'anew.pai.internal-effect-request.v1';
const PATH = '/reach/incident';
const DEFAULT_BASE_URL = 'https://aibebase.onrender.com';
const DEFAULT_TIMEOUT_MS = 45000;
const STATUSES = Object.freeze(['build_failed','update_failed','canceled']);
const inFlight = new Map();

function stableStringify(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (typeof value === 'object') return '{' + Object.keys(value).sort().map(function(key){
    return JSON.stringify(key)+':'+stableStringify(value[key]);
  }).join(',')+'}';
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : stableStringify(value),'utf8').digest('hex');
}

function clean(value,pattern,reason) {
  var text=String(value==null?'':value).trim();
  if(!pattern.test(text))throw new Error(reason);
  return text;
}

function normalizeStatus(value) {
  var status=String(value==null?'':value).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
    .replace(/cancelled/g,'canceled');
  if(STATUSES.indexOf(status)<0)throw new Error('incident_status_invalid');
  return status;
}

function normalizeIncident(input) {
  input=input||{};
  var hamUid=clean(input.hamUid,/^[A-Fa-f0-9]{8}$/,'ham_uid_invalid').toUpperCase();
  var incident={provider:'render',
    serviceId:clean(input.serviceId,/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/,
      'service_id_invalid'),
    serviceName:clean(input.serviceName,/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/,
      'service_name_invalid').toLowerCase(),
    deployId:clean(input.deployId,/^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/,
      'deploy_id_invalid'),
    status:normalizeStatus(input.status),commitId:null,deployCreatedAt:null};
  if(input.commitId!=null&&String(input.commitId).trim()){
    incident.commitId=clean(input.commitId,/^[a-fA-F0-9]{7,64}$/,
      'commit_id_invalid').toLowerCase();
  }
  if(input.deployCreatedAt!=null&&String(input.deployCreatedAt).trim()){
    var parsed=Date.parse(input.deployCreatedAt);
    if(!Number.isFinite(parsed))throw new Error('deploy_created_at_invalid');
    incident.deployCreatedAt=new Date(parsed).toISOString();
  }
  var identity={version:VERSION,hamUid:hamUid,provider:incident.provider,
    serviceId:incident.serviceId,deployId:incident.deployId,status:incident.status};
  var incidentDigest=digest(identity);
  var requestId='eanew.render.'+incidentDigest;
  return{hamUid:hamUid,incident:incident,identity:identity,digest:incidentDigest,
    requestId:requestId,body:{version:VERSION,hamUid:hamUid,
      requestId:requestId,incident:incident}};
}

function authorizationPayload(body,expiresAt,nonce) {
  return{version:EFFECT_VERSION,purpose:'internal_effect_request',method:'POST',
    path:PATH,request_id:body.requestId,ham_uid:body.hamUid,
    expires_at:expiresAt,nonce:nonce,body_digest:digest(body)};
}

function sign(body,key,expiresAt,nonce) {
  if(!key)return null;
  var payload=authorizationPayload(body,expiresAt,nonce);
  return crypto.createHmac('sha256',key)
    .update(Buffer.from(stableStringify(payload),'utf8')).digest('hex');
}

function clientConfig(config) {
  config=config||{};
  var baseUrl=String(config.baseUrl||DEFAULT_BASE_URL).replace(/\/+$/,'');
  var key=String(config.key||'');
  var fetchImpl=config.fetch||global.fetch;
  var timeoutMs=Number(config.timeoutMs||DEFAULT_TIMEOUT_MS);
  if(!/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(baseUrl))
    throw new Error('reach_incident_url_invalid');
  if(!key)throw new Error('reach_incident_authorization_unconfigured');
  if(typeof fetchImpl!=='function')throw new Error('reach_incident_fetch_unavailable');
  if(!Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>90000)
    throw new Error('reach_incident_timeout_invalid');
  return{baseUrl:baseUrl,key:key,fetch:fetchImpl,timeoutMs:timeoutMs,
    now:typeof config.now==='function'?config.now:Date.now,
    randomUUID:typeof config.randomUUID==='function'?config.randomUUID:crypto.randomUUID};
}

function safeBase(incident) {
  return{incidentSource:'reach.incident.'+incident.hamUid+'.'+incident.digest,
    requestId:incident.requestId};
}

async function submitOnce(incident,config) {
  var client;
  try{client=clientConfig(config);}catch(error){return Object.assign({ok:false,
    reachSubmitted:false,duplicateHeld:false,pending:true,reason:error.message},safeBase(incident));}
  var now=Number(client.now());
  if(!Number.isSafeInteger(now))return Object.assign({ok:false,reachSubmitted:false,
    duplicateHeld:false,pending:true,reason:'reach_incident_clock_invalid'},safeBase(incident));
  var expiresAt=now+60000;
  var nonce=client.randomUUID();
  var signature=sign(incident.body,client.key,expiresAt,nonce);
  if(!signature)return Object.assign({ok:false,reachSubmitted:false,
    duplicateHeld:false,pending:true,reason:'reach_incident_signature_unavailable'},safeBase(incident));
  var controller=typeof AbortController==='function'?new AbortController():null;
  var timer=controller?setTimeout(function(){controller.abort();},client.timeoutMs):null;
  if(timer&&timer.unref)timer.unref();
  try{
    var response=await client.fetch(client.baseUrl+PATH,{method:'POST',headers:{
      'Content-Type':'application/json','Idempotency-Key':incident.requestId,
      'X-ANEW-Effect-Expires':String(expiresAt),
      'X-ANEW-Effect-Nonce':nonce,
      'X-ANEW-Effect-Authorization':signature},
    body:JSON.stringify(incident.body),signal:controller&&controller.signal});
    var data=response&&await response.json().catch(function(){return null;});
    if(response&&response.status===202&&data&&data.pending===true&&
        data.requestId===incident.requestId){
      return Object.assign({ok:false,reachSubmitted:false,duplicateHeld:true,
        pending:true,reason:data.reason||'reach_incident_reconciliation_pending',
        cycleId:data.cycleId||null},safeBase(incident));
    }
    var accepted=!!(response&&response.ok&&data&&data.ok===true&&
      data.accepted===true&&data.pending!==true&&data.requestId===incident.requestId&&
      typeof data.cycleId==='string'&&/^[A-Za-z0-9._:-]{8,220}$/.test(data.cycleId)&&
      typeof data.candidateSource==='string'&&
      data.candidateSource==='reach.candidate.'+incident.hamUid+'.'+data.cycleId&&
      data.terminalSource==='reach.incident.terminal.'+incident.hamUid+'.'+incident.digest);
    var held=!!(response&&response.ok&&data&&data.ok===true&&
      data.accepted===false&&data.held===true&&data.pending!==true&&
      data.requestId===incident.requestId&&
      data.terminalSource==='reach.incident.terminal.'+incident.hamUid+'.'+incident.digest);
    if(held)return Object.assign({ok:true,reachSubmitted:false,
      duplicateHeld:true,pending:false,reason:data.reason||'reach_incident_intake_held',
      cycleId:data.cycleId||null,terminalSource:data.terminalSource},safeBase(incident));
    if(!accepted)return Object.assign({ok:false,reachSubmitted:false,
      duplicateHeld:false,pending:!!(response&&response.status>=500),
      reason:data&&data.reason||'reach_incident_submission_failed:'+
        (response&&response.status||'network')},safeBase(incident));
    return Object.assign({ok:true,reachSubmitted:true,
      duplicateHeld:data.reused===true||response.status===200,pending:false,
      cycleId:data.cycleId,candidateSource:data.candidateSource,
      terminalSource:data.terminalSource||null},safeBase(incident));
  }catch(error){return Object.assign({ok:false,reachSubmitted:false,
    duplicateHeld:false,pending:true,reason:error&&error.name==='AbortError'
      ?'reach_incident_submission_timeout':'reach_incident_submission_failed:network'},
  safeBase(incident));}
  finally{if(timer)clearTimeout(timer);}
}

async function submitServiceAlert(input,config) {
  var incident;
  try{incident=normalizeIncident(input);}catch(error){return{ok:false,
    reachSubmitted:false,duplicateHeld:false,pending:false,reason:error.message};}
  if(inFlight.has(incident.digest))return inFlight.get(incident.digest);
  var promise=submitOnce(incident,config||{}).finally(function(){
    if(inFlight.get(incident.digest)===promise)inFlight.delete(incident.digest);
  });
  inFlight.set(incident.digest,promise);
  return promise;
}

// All watched services share one wall-clock budget because the caretaker's
// outer cycle watchdog is 90 seconds and does not cancel discarded work. A
// parallel 45-second wave leaves the second half of that budget for stamping
// and cleanup instead of allowing three sequential network waits to overlap a
// later cycle.
async function submitServiceAlerts(inputs,config) {
  inputs=Array.isArray(inputs)?inputs:[];
  var shared=Object.assign({},config||{});
  shared.timeoutMs=Math.min(Number(shared.timeoutMs||DEFAULT_TIMEOUT_MS),
    DEFAULT_TIMEOUT_MS);
  return Promise.all(inputs.map(function(input){
    return submitServiceAlert(input,shared);
  }));
}

module.exports={submitServiceAlert:submitServiceAlert,
  submitServiceAlerts:submitServiceAlerts,
  _test:{stableStringify:stableStringify,digest:digest,normalizeIncident:normalizeIncident,
    normalizeStatus:normalizeStatus,authorizationPayload:authorizationPayload,
    sign:sign,constants:{VERSION:VERSION,PATH:PATH,STATUSES:STATUSES}}};
