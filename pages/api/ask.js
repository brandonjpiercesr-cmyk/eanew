import { OpenAI } from 'openai';
import { NextApiRequest, NextApiResponse } from 'next';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { prompt } = req.body;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
    });
    const answer = response.choices[0].message.content;
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}