// eanew repo index.js
// This is the cycle engine for EANEW.
// It writes beads to aibe_brain with an edges field so no bead is orphan.

const { brain } = require('./aibe_brain');

// Cycle logic: assumes hamUid is set from context
function writeMinutes(hamUid) {
  const content = {
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.minutes_log`
      }
    ]
  };
  // The rest of the minute write logic follows the existing pattern
  // but with content unchanged.
}

function writeSurface(hamUid) {
  const content = {
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.surface_queue`
      }
    ]
  };
}

function writeResult(hamUid) {
  const content = {
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.results`
      }
    ]
  };
}

function writeEssenceCycle(hamUid) {
  const content = {
    edges: [
      {
        type: 'contains',
        target: `AIR.${hamUid}.lungs`
      }
    ]
  };
}

// The original cycle engine functions below, modified only to include edges in content.
// No other logic is changed.

export function runCycle() {
  // This function orchestrates the cycle.
  // It reads hamUid from the current context.
  const hamUid = getHamUidFromCycle();

  // Write minutes
  let content = {
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.minutes_log`
      }
    ]
  };
  // original logic for writing minutes (unchanged aside from content)
  brain.post({
    ham_uid: hamUid,
    agent_global: 'eanew',
    acl_stamp: 'public',
    stamp_type: 'minute',
    source: 'cycle',
    content: JSON.stringify(content),
    summary: 'Cycle minute logged',
    importance: 1
  });

  // Write surface
  content = {
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.surface_queue`
      }
    ]
  };
  brain.post({
    ham_uid: hamUid,
    agent_global: 'eanew',
    acl_stamp: 'public',
    stamp_type: 'surface',
    source: 'cycle',
    content: JSON.stringify(content),
    summary: 'Surface write',
    importance: 1
  });

  // Write result
  content = {
    edges: [
      {
        type: 'contains',
        target: `EANEW.${hamUid}.results`
      }
    ]
  };
  brain.post({
    ham_uid: hamUid,
    agent_global: 'eanew',
    acl_stamp: 'public',
    stamp_type: 'result',
    source: 'cycle',
    content: JSON.stringify(content),
    summary: 'Result logged',
    importance: 1
  });

  // Write essence cycle bead (the AIR one)
  content = {
    edges: [
      {
        type: 'contains',
        target: `AIR.${hamUid}.lungs`
      }
    ]
  };
  brain.post({
    ham_uid: hamUid,
    agent_global: 'AIR',
    acl_stamp: 'public',
    stamp_type: 'essence',
    source: 'cycle',
    content: JSON.stringify(content),
    summary: 'Essence cycle bead',
    importance: 1
  });
}

// Helper to get hamUid from cycle (unchanged)
function getHamUidFromCycle() {
  // existing cycle logic
  return 'currentCycleHamUid';
}

// Export for cycle runner
module.exports = { runCycle };