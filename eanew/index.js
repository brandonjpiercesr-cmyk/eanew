const { echoFilter, writeLogfulToBrain } = require('./core/anew.self');
/* existing code */
if (await echoFilter(process.env.HAM_UID)) return;
/* existing code */
await writeLogfulToBrain(subject, deliberationText, action);
/* existing code */