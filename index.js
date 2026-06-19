// eanew cycle engine
// Fix: add edges to bead writes so no orphans

const axios = require('axios');
const AIDE_BRAIN_URL = process.env.AIDE_BRAIN_URL || 'http://localhost:3000';

// Assume hamUid is available elsewhere; we'll use it here
const hamUid = process.env.HAM_UID || 'default';

// Helper to create a bead with edges
function createBead(stampType, content, source, summary, importance) {
  return {
    ham_uid: hamUid,
    agent_global: 'eanew',
    acl_stamp: Date.now(),
    stamp_type: stampType,
    content: JSON.stringify(content),
    source: source,
    summary: summary,
    importance: importance
  };
}

async function postMinutes(minutesData) {
  const content = {
    minutes: minutesData,
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.minutes_log`
      }
    ]
  };
  const bead = createBead('minutes', content, 'cycle', 'EANEW minutes log', 5);
  await axios.post(`${AIDE_BRAIN_URL}/aibe_brain`, bead);
}

async function postSurface(surfaceData) {
  const content = {
    surface: surfaceData,
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.surface_queue`
      }
    ]
  };
  const bead = createBead('surface', content, 'cycle', 'EANEW surface queue', 5);
  await axios.post(`${AIDE_BRAIN_URL}/aibe_brain`, bead);
}

async function postResult(resultData) {
  const content = {
    result: resultData,
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.results`
      }
    ]
  };
  const bead = createBead('result', content, 'cycle', 'EANEW result', 5);
  await axios.post(`${AIDE_BRAIN_URL}/aibe_brain`, bead);
}

async function postEssence(essenceData) {
  const content = {
    essence: essenceData,
    edges: [
      {
        type: 'contains',
        target: `AIR.${hamUid}.lungs`
      }
    ]
  };
  const bead = createBead('essence', content, 'cycle', 'AIR essence cycle', 5);
  await axios.post(`${AIDE_BRAIN_URL}/aibe_brain`, bead);
}

// Cycle logic (unchanged)
// ... (omitted for brevity, but not modified)

module.exports = { postMinutes, postSurface, postResult, postEssence };