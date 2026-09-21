import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set(['https://rexfm.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173']);

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://rexfm.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

function readOutputText(response: Record<string, unknown>): string | null {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required' }, 401, headers);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const publicKey = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const secretKey = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, publicKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Invalid session' }, 401, headers);

    const { sightingId } = await request.json();
    if (typeof sightingId !== 'string') return json({ error: 'sightingId is required' }, 400, headers);

    const { data: sighting, error: sightingError } = await admin.from('sightings')
      .select('id,user_id,food_text,place_text,price_text,photo_path,observed_at')
      .eq('id', sightingId).eq('user_id', userData.user.id).single();
    if (sightingError || !sighting) return json({ error: 'Sighting not found' }, 404, headers);
    if (!sighting.photo_path) return json({ error: 'A photo is required for identification' }, 400, headers);

    const { data: signed, error: signedError } = await admin.storage.from('sighting-photos')
      .createSignedUrl(sighting.photo_path, 300);
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Could not create photo URL');

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) return json({ error: 'Photo saved; analysis is not configured yet' }, 503, headers);

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        store: false,
        reasoning: { effort: 'none' },
        input: [{ role: 'user', content: [
          { type: 'input_text', text: `Identify every distinct produce or food item visible in this market sighting. Read a price only when it is legible in the photo, preserving currency, promotional wording, quantity, and unit such as each, bunch, bag, or per pound. Look for a visible store or market name, but never infer a place from visual style or hidden metadata. The contributor wrote food=${JSON.stringify(sighting.food_text)}, place=${JSON.stringify(sighting.place_text)}, price=${JSON.stringify(sighting.price_text)}. Be conservative: use null rather than inventing a variety, price, unit, condition, or place.` },
          { type: 'input_image', image_url: signed.signedUrl, detail: 'high' }
        ] }],
        text: { format: {
          type: 'json_schema',
          name: 'produce_sighting',
          strict: true,
          schema: {
            type: 'object', additionalProperties: false,
            properties: {
              items: {
                type: 'array', maxItems: 12,
                items: {
                  type: 'object', additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    variety: { type: ['string', 'null'] },
                    price_text: { type: ['string', 'null'], description: 'The full visible price, promotion, quantity and unit exactly as displayed.' },
                    condition: { type: ['string', 'null'], description: 'A short visible freshness or ripeness note.' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 }
                  },
                  required: ['name', 'variety', 'price_text', 'condition', 'confidence']
                }
              },
              place_name: { type: ['string', 'null'], description: 'Only a store, farm, stand, or market name visibly readable in the photo.' },
              evidence: { type: 'array', items: { type: 'string' }, maxItems: 4 }
            },
            required: ['items', 'place_name', 'evidence']
          }
        } }
      })
    });
    if (!aiResponse.ok) {
      const failure = await aiResponse.json().catch(() => null);
      const errorCode = failure?.error?.code ?? failure?.error?.type ?? 'unknown';
      console.error(`OpenAI request failed (${aiResponse.status}, ${errorCode})`);
      throw new Error(`OpenAI request failed (${aiResponse.status})`);
    }
    const ai = await aiResponse.json();
    const outputText = readOutputText(ai);
    if (!outputText) throw new Error('The model returned no structured result');
    const result = JSON.parse(outputText);
    const items = Array.isArray(result.items) ? result.items : [];
    const primary = items[0] ?? { name: 'Unidentified food', variety: null, price_text: null, condition: null, confidence: 0 };
    const inferredFood = items.map((item: { name: string; variety?: string | null }) => [item.name, item.variety].filter(Boolean).join(' · ')).join(', ');

    const { error: analysisError } = await admin.from('sighting_analysis').upsert({
      sighting_id: sighting.id,
      produce_name: primary.name,
      variety: primary.variety,
      condition: primary.condition,
      confidence: primary.confidence,
      identified_items: items,
      evidence: { visible_clues: result.evidence, visible_place_name: result.place_name },
      model: 'gpt-5.6-luna'
    }, { onConflict: 'sighting_id' });
    if (analysisError) throw analysisError;

    await admin.from('sightings').update({
      food_text: sighting.food_text === 'Photo sighting' && inferredFood ? inferredFood : sighting.food_text,
      produce_name: primary.name,
      variety: primary.variety,
      price_text: sighting.price_text || primary.price_text,
      place_text: sighting.place_text || result.place_name,
      status: 'pending_review'
    }).eq('id', sighting.id);

    return json({ analysis: result }, 200, headers);
  } catch (error) {
    console.error(error);
    return json({ error: 'Analysis failed; the sighting remains saved for retry.' }, 500, headers);
  }
});
