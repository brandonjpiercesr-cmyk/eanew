// ⬡B:ops.triplet-watcher:MODULE:built:20260702⬡
// entered via the ABAHAM door, serving channel MESSAGES
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const brainPath = process.env.BRAIN_PATH || './brain';
const tripletIds = [process.env.OVERSEER_ID, process.env.OVERSEER_ID_2, process.env.OVERSEER_ID_3];
const selfId = process.env.OVERSEER_ID;

function getSiblingIds() {
  return tripletIds.filter(id => id !== selfId);
}

function checkSiblingHealth(siblingId) {
  const url = `http://localhost:8080/health/${siblingId}`;
  return axios.get(url)
    .then(response => response.data.healthy)
    .catch(() => false);
}

function checkSiblings() {
  const siblingIds = getSiblingIds();
  const promises = siblingIds.map(checkSiblingHealth);
  return Promise.all(promises)
    .then(results => {
      const unhealthySiblings = siblingIds.filter((id, index) => !results[index]);
      if (unhealthySiblings.length > 0) {
        const record = {
          timestamp: new Date().toISOString(),
          unhealthySiblings: unhealthySiblings
        };
        fs.appendFileSync(path.join(brainPath, 'triplet-watcher.log'), JSON.stringify(record) + '\n');
      }
    });
}

setInterval(checkSiblings, 60000); // check every 1 minute

module.exports = {};