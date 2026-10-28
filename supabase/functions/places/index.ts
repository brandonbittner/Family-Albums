import { createClient } from 'npm:@supabase/supabase-js@2';

// Proxies Google Places (New) so the API key never ships in the app and only
// signed-in users can spend quota.
//   autocomplete: { input, sessionToken } → { suggestions: [{ placeId, name, address }] }
//   details:      { placeId, sessionToken } → { place: { placeId, address, lat, lng } }
// Autocomplete calls and the final details call share a sessionToken so Google
// bills them as one session.
//
// Billing: details must only request Essentials-tier fields. Asking for any Pro
// field (displayName included) bills the whole session at the far pricier
// Enterprise + Atmosphere SKU — so the place name comes from the autocomplete
// suggestion instead. See
// https://developers.google.com/maps/documentation/places/web-service/session-pricing

const API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const PLACES_BASE = 'https://places.googleapis.com/v1';

const MAX_INPUT_LENGTH = 200;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{1,300}$/;
const TOKEN_RE = /^[A-Za-z0-9-]{1,64}$/;

function err(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

type GooglePrediction = {
  placeId: string;
  text?: { text?: string };
  structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
};

Deno.serve(async (req: Request) => {
  if (!API_KEY) return err(500, 'GOOGLE_PLACES_API_KEY is not configured');

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err(401, 'Missing Authorization header');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return err(401, 'Unauthorized');

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, 'Invalid JSON body');
  }

  if (typeof body !== 'object' || body === null || !('action' in body)) {
    return err(400, 'Expected JSON object with "action" field');
  }

  const { action, sessionToken, languageCode } = body as Record<string, unknown>;

  if (
    sessionToken !== undefined &&
    (typeof sessionToken !== 'string' || !TOKEN_RE.test(sessionToken))
  ) {
    return err(400, 'sessionToken must be a short alphanumeric string');
  }
  const language =
    typeof languageCode === 'string' && /^[A-Za-z-]{2,12}$/.test(languageCode)
      ? languageCode
      : undefined;

  // ── autocomplete ──────────────────────────────────────────────────────────
  if (action === 'autocomplete') {
    const { input } = body as Record<string, unknown>;
    if (typeof input !== 'string' || input.trim().length === 0) {
      return err(400, 'input must be a non-empty string');
    }

    const res = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({
        input: input.trim().slice(0, MAX_INPUT_LENGTH),
        sessionToken,
        languageCode: language,
      }),
    });
    if (!res.ok) {
      console.error('places:autocomplete failed', res.status, await res.text());
      return err(502, 'Place search failed');
    }

    const data = (await res.json()) as { suggestions?: { placePrediction?: GooglePrediction }[] };
    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is GooglePrediction => !!p?.placeId)
      .map((p) => ({
        placeId: p.placeId,
        name: p.structuredFormat?.mainText?.text || p.text?.text || '',
        address: p.structuredFormat?.secondaryText?.text ?? null,
      }));

    return Response.json({ suggestions });
  }

  // ── details ───────────────────────────────────────────────────────────────
  if (action === 'details') {
    const { placeId } = body as Record<string, unknown>;
    if (typeof placeId !== 'string' || !PLACE_ID_RE.test(placeId)) {
      return err(400, 'placeId is invalid');
    }

    const url = new URL(`${PLACES_BASE}/places/${placeId}`);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken as string);
    if (language) url.searchParams.set('languageCode', language);

    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'id,formattedAddress,location',
      },
    });
    if (!res.ok) {
      console.error('place details failed', res.status, await res.text());
      return err(502, 'Place lookup failed');
    }

    const p = (await res.json()) as {
      id: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };

    return Response.json({
      place: {
        placeId: p.id,
        address: p.formattedAddress ?? null,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
      },
    });
  }

  return err(400, `Unknown action: "${action}"`);
});
