// EANEW ask/consult.js
// LLM call configuration for ask endpoint
// last max_tokens was set to ~30, now increasing to 1000

const consult = async (prompt) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
};

module.exports = { consult };