// api/generate.js — Vercel Serverless Function
// Guarda la API key del lado del servidor y reenvía la petición a Anthropic.
// La key NUNCA viaja al navegador. Se configura como variable de entorno en Vercel.

const MODEL = 'claude-sonnet-5';   // string de modelo actual y válido en la API
const MAX_TOKENS = 1200;
const ANTHROPIC_VERSION = '2023-06-01';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Server is not configured: ANTHROPIC_API_KEY is missing.' });
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Request is missing the "messages" array.' });
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages
      })
    });

    const data = await upstream.json();
    // Devuelve el mismo shape que el frontend ya sabe leer (data.content[]).
    return res.status(upstream.status).json(data);

  } catch (e) {
    return res.status(502).json({ error: 'Upstream request failed: ' + e.message });
  }
}
