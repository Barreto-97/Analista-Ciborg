/**
 * ANALISTA ADUANEIRO — Cloudflare Worker (Gemini)
 *
 * Usa Google Gemini 2.0 Flash — 100% gratuito, sem cartão.
 *
 * SETUP:
 *  1. Cole este arquivo no editor do Cloudflare Workers
 *  2. Em Settings → Variables and Secrets → Add:
 *       GEMINI_API_KEY  (marque como "Encrypt")
 *  3. Obtenha a chave GRÁTIS em: https://aistudio.google.com/apikey
 *     (login Google → "Get API Key" → "Create API key" → copie)
 *  4. Cole a URL do Worker no config.js do site
 */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export default {
  async fetch(request, env) {

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY não configurada no Worker.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const body = await request.json();

      // body.prompt vem do app.js
      const prompt = body.prompt || '';

      const geminiPayload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      };

      const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || `Gemini HTTP ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Extrai o texto da resposta do Gemini
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return new Response(
        JSON.stringify({ text }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Erro interno: ' + err.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }
};
