const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const BRAIN_URL = 'http://aibe_brain:3000/api/beads';

// Configuration
const hamUid = process.env.HAM_UID || 'default-ham';
const agentGlobal = process.env.AGENT_GLOBAL || 'eanew';
const aclStamp = process.env.ACL_STAMP || 'public';
const stampType = 'bead';

// Hierarchical source for cycle beads
const cycleSource = `eanew.cycle.heartbeat.${hamUid}.${moment().format('YYYYMMDD')}`;

async function postBead(payload) {
  try {
    const response = await axios.post(BRAIN_URL, payload);
    console.log(`Posted bead: ${payload.summary}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to post bead: ${error.message}`);
  }
}

function createMinutesContent(data) {
  const content = {
    type: 'minutes',
    data: data,
    edges: [{
      type: 'contains',
      target: `EANEW.${hamUid}.minutes_log`
    }]
  };
  return JSON.stringify(content);
}

function createSurfaceContent(data) {
  const content = {
    type: 'surface',
    data: data,
    edges: [{
      type: 'contains',
      target: `EANEW.${hamUid}.surface_queue`
    }]
  };
  return JSON.stringify(content);
}

function createResultContent(data) {
  const content = {
    type: 'result',
    data: data,
    edges: [{
      type: 'contains',
      target: `EANEW.${hamUid}.results`
    }]
  };
  return JSON.stringify(content);
}

function createEssenceContent(data) {
  const content = {
    type: 'essence',
    data: data,
    edges: [{
      type: 'contains',
      target: `AIR.${hamUid}.lungs`
    }]
  };
  return JSON.stringify(content);
}

// Cycle heartbeat function (kept untouched except for bead writes)
async function runCycle() {
  console.log('Cycle heartbeat running...');

  // Simulate cycle data (original logic unchanged)
  const minutesData = { elapsed: 1, unit: 'min' };
  const surfaceData = { queue: ['item1', 'item2'] };
  const resultData = { success: true, output: 'sample' };
  const essenceData = { breath: 'in', lungs: 'active' };

  // Post eanew minutes bead
  const minutesPayload = {
    ham_uid: hamUid,
    agent_global: agentGlobal,
    acl_stamp: aclStamp,
    stamp_type: stampType,
    source: cycleSource,
    content: createMinutesContent(minutesData),
    summary: 'eanew minutes',
    importance: 5
  };
  await postBead(minutesPayload);

  // Post eanew surface bead
  const surfacePayload = {
    ham_uid: hamUid,
    agent_global: agentGlobal,
    acl_stamp: aclStamp,
    stamp_type: stampType,
    source: cycleSource,
    content: createSurfaceContent(surfaceData),
    summary: 'eanew surface',
    importance: 5
  };
  await postBead(surfacePayload);

  // Post eanew result bead
  const resultPayload = {
    ham_uid: hamUid,
    agent_global: agentGlobal,
    acl_stamp: aclStamp,
    stamp_type: stampType,
    source: cycleSource,
    content: createResultContent(resultData),
    summary: 'eanew result',
    importance: 5
  };
  await postBead(resultPayload);

  // Post essence cycle bead
  const essencePayload = {
    ham_uid: hamUid,
    agent_global: agentGlobal,
    acl_stamp: aclStamp,
    stamp_type: stampType,
    source: cycleSource,
    content: createEssenceContent(essenceData),
    summary: 'air essence cycle',
    importance: 5
  };
  await postBead(essencePayload);

  console.log('Cycle complete.');
}

// Run cycle every 60 seconds (original interval logic untouched)
setInterval(runCycle, 60000);

// Initial run
runCycle();