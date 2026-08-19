// api/generate.js — Vercel Serverless Function
// Guarda la API key del lado del servidor y reenvía la petición a Anthropic.
// La key NUNCA viaja al navegador. Se configura como variable de entorno en Vercel.
//
// Usa "tool_use" para forzar salida estructurada (JSON garantizado por esquema),
// que es el método oficial y no depende de prefill.

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1500;
const ANTHROPIC_VERSION = '2023-06-01';

// El esquema del listing. La API obliga al modelo a devolver exactamente esta forma.
const LISTING_TOOL = {
  name: 'emit_listing',
  description: 'Return the finished listing copy package as structured data.',
  input_schema: {
    type: 'object',
    properties: {
      headline:         { type: 'string', description: 'Listing headline, max 65 characters.' },
      teaser:           { type: 'string', description: 'One sentence, max 130 characters. Email subject / flyer kicker.' },
      description:      { type: 'string', description: 'Listing description, HARD LIMIT 610 characters including spaces and line breaks, 2-3 short paragraphs separated by \\n\\n, leading with the strongest reason to act.' },
      seo_title:        { type: 'string', description: 'SEO title tag, 50-60 characters, includes asset type and city.' },
      meta_description: { type: 'string', description: 'Meta description, 140-155 characters, ends with a reason to click.' },
      keywords:         { type: 'array', items: { type: 'string' }, description: '6 to 9 search terms a buyer or tenant would actually type.' },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            note: { type: 'string', description: 'One specific edit made, plain language, max 90 characters.' }
          },
          required: ['type', 'note']
        },
        description: '3 to 6 edits made.'
      },
      flags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            note: { type: 'string', description: 'One fact that is missing or unverifiable, max 90 characters.' }
          },
          required: ['type', 'note']
        },
        description: '0 to 4 missing or unverifiable facts.'
      }
    },
    required: ['headline', 'teaser', 'description', 'seo_title', 'meta_description', 'keywords', 'changes', 'flags']
  }
};

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
        tools: [LISTING_TOOL],
        tool_choice: { type: 'tool', name: 'emit_listing' },
        messages
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || ('Upstream error ' + upstream.status);
      return res.status(upstream.status).json({ error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    }

    // La salida estructurada viene en el bloque tool_use como objeto ya parseado.
    const toolBlock = (data.content || []).find(b => b.type === 'tool_use');
    if (!toolBlock || !toolBlock.input) {
      return res.status(502).json({ error: 'Model did not return structured output.' });
    }

    // Devolver en el shape que el frontend ya sabe leer: content[].text = JSON string.
    return res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(toolBlock.input) }]
    });

  } catch (e) {
    return res.status(502).json({ error: 'Upstream request failed: ' + e.message });
  }
}
