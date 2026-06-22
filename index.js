const { echoFilter, writeLogfulToBrain } = require('./core/anew.self');
const express = require('express');
const bodyParser = require('body-parser');
const Nylas = require('nylas');

const app = express();
app.use(bodyParser.json());

Nylas.config({
  clientId: process.env.NYLAS_CLIENT_ID,
  clientSecret: process.env.NYLAS_CLIENT_SECRET,
});

const accessToken = process.env.NYLAS_ACCESS_TOKEN;
const nylas = Nylas.with(accessToken);

// Webhook endpoint for inbound email
app.post('/inbound', async (req, res) => {
  const { fromEmail, toEmail, subject, body } = req.body;

  // HAM UID used for agent identity (replaced static identifier)
  const hamUid = process.env.HAM_UID;

  // Check if email should be filtered
  if (await echoFilter(fromEmail)) {
    return res.status(200).send('Filtered');
  }

  // Extract deliberation text and action (placeholder logic)
  const deliberationText = body;
  const action = 'forward';

  // Replace Nylas send with brain logging
  await writeLogfulToBrain(subject, deliberationText, action);

  res.status(200).send('Processed');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});