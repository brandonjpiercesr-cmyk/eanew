// core/ask.js - Handles /eanew/ask requests
// FIX: Increased max_tokens from 64 to 800, removed slice that truncated answers.

import axios from 'axios';

const API_BASE = process.env.API_BASE || 'https://api.openrouter.ai/v1';
const API_KEY = process.env.API_KEY;
const MODEL = process.env.MODEL || 'gpt-3.5-turbo';

export default async function askHandler(req, res) {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  try {
    const response = await axios.post(
      `${API_BASE}/chat/completions`,
      {
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800, // FIX: was 64 - increased to allow full responses
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let answer = response.data.choices[0]?.message?.content || '';
    // FIX: Removed hardcoded slice that was truncating every answer to ~80 chars
    // Previously: answer = answer.slice(0, 80);
    // No slicing - return the full response.

    return res.json({ answer });
  } catch (error) {
    console.error('Ask error:', error.message);
    return res.status(500).json({ error: 'Failed to get answer' });
  }
}