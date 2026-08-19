// api/generate.js — Vercel Serverless Function
// Guarda la API key del lado del servidor y reenvía la petición a Anthropic.
// La key NUNCA viaja al navegador. Se configura como variable de entorno en Vercel.

const MODEL = 'claude-sonnet-5';   // string de modelo actual y válido en la API
const MAX_TOKENS = 1500;
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

    // Prefill con "{" para forzar que la respuesta empiece como JSON puro,
    // sin preámbulo ni texto envolvente. Esto elimina el error de parsing.
    const primed = [...messages, { role: 'assistant', content: '{' }];

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
        messages: primed
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || ('Upstream error ' + upstream.status);
      return res.status(upstream.status).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    }

    // La respuesta es la continuación DESPUÉS del "{" del prefill.
    // La reconstruimos anteponiendo la llave de apertura.
    const continuation = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    let jsonText = '{' + continuation;

    // Recortar cualquier cosa después de la última llave de cierre, por si acaso.
    const lastBrace = jsonText.lastIndexOf('}');
    if (lastBrace !== -1) jsonText = jsonText.slice(0, lastBrace + 1);

    // Validar antes de devolver. Si no parsea, error claro (no un fallo silencioso).
    try {
      JSON.parse(jsonText);
    } catch (e) {
      return res.status(502).json({ error: 'Model did not return valid JSON.', raw: jsonText.slice(0, 500) });
    }

    // Devolver en el mismo shape que el frontend ya sabe leer: content[].text = JSON limpio.
    return res.status(200).json({ content: [{ type: 'text', text: jsonText }] });

  } catch (e) {
    return res.status(502).json({ error: 'Upstream request failed: ' + e.message });
  }
}
