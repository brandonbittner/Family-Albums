import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_VARIANTS = new Set(['original', 'display', 'thumb', 'poster']);

// Maps allowed content types to their file extensions.
// This allowlist is the only place that controls what file types can be stored.
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const BUCKET = Deno.env.get('R2_BUCKET') ?? '';

const aws = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
  service: 's3',
  region: 'auto',
});

function objectUrl(key: string): string {
  return `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
}

function err(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

Deno.serve(async (req: Request) => {
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

  const { action } = body as Record<string, unknown>;

  // ── upload ────────────────────────────────────────────────────────────────
  if (action === 'upload') {
    const { artifactId, files } = body as Record<string, unknown>;

    if (typeof artifactId !== 'string' || !UUID_RE.test(artifactId)) {
      return err(400, 'artifactId must be a UUID');
    }
    if (!Array.isArray(files) || files.length === 0) {
      return err(400, 'files must be a non-empty array');
    }

    // The app creates the artifact row before uploading. Only its uploader may
    // write its files, so nobody can overwrite someone else's photos.
    const { data: artifact, error: lookupError } = await supabase
      .from('artifacts')
      .select('uploaded_by')
      .eq('id', artifactId)
      .maybeSingle();
    if (lookupError) return err(500, 'Could not check artifact');
    if (!artifact || artifact.uploaded_by !== user.id) {
      return err(403, 'Not allowed to upload this artifact');
    }

    const results: { variant: string; uploadUrl: string }[] = [];

    for (const file of files) {
      if (typeof file !== 'object' || file === null) {
        return err(400, 'Each file entry must be an object');
      }
      const { variant, contentType } = file as Record<string, unknown>;

      if (typeof variant !== 'string' || !ALLOWED_VARIANTS.has(variant)) {
        return err(400, `Invalid variant: "${variant}"`);
      }
      if (typeof contentType !== 'string' || !(contentType in EXT_MAP)) {
        return err(400, `Invalid contentType: "${contentType}"`);
      }

      const key = `artifacts/${artifactId}/${variant}.${EXT_MAP[contentType]}`;

      // content-type is included in SignedHeaders so the client PUT must
      // send the identical Content-Type header or R2 will reject it.
      const signed = await aws.sign(objectUrl(key), {
        method: 'PUT',
        headers: { 'content-type': contentType },
        aws: { signQuery: true, expiresIn: 600 },
      });

      results.push({ variant, uploadUrl: signed.url });
    }

    return Response.json({ files: results });
  }

  // ── view ──────────────────────────────────────────────────────────────────
  if (action === 'view') {
    const { items } = body as Record<string, unknown>;

    if (!Array.isArray(items) || items.length === 0) {
      return err(400, 'items must be a non-empty array');
    }

    const results: { artifactId: string; variant: string; url: string }[] = [];

    for (const item of items) {
      if (typeof item !== 'object' || item === null) {
        return err(400, 'Each item entry must be an object');
      }
      const { artifactId, variant, contentType } = item as Record<string, unknown>;

      if (typeof artifactId !== 'string' || !UUID_RE.test(artifactId)) {
        return err(400, 'artifactId must be a UUID');
      }
      if (typeof variant !== 'string' || !ALLOWED_VARIANTS.has(variant)) {
        return err(400, `Invalid variant: "${variant}"`);
      }
      if (typeof contentType !== 'string' || !(contentType in EXT_MAP)) {
        return err(400, `Invalid contentType: "${contentType}"`);
      }

      const key = `artifacts/${artifactId}/${variant}.${EXT_MAP[contentType]}`;

      const signed = await aws.sign(objectUrl(key), {
        aws: { signQuery: true, expiresIn: 3600 },
      });

      results.push({ artifactId, variant, url: signed.url });
    }

    // Only sign links for artifacts the caller can see: RLS on the user-scoped
    // client limits this to their own uploads and their albums' artifacts.
    const requestedIds = [...new Set(results.map((r) => r.artifactId))];
    const { data: visible, error: lookupError } = await supabase
      .from('artifacts')
      .select('id')
      .in('id', requestedIds);
    if (lookupError) return err(500, 'Could not check artifacts');
    const visibleIds = new Set((visible ?? []).map((a) => a.id));
    if (requestedIds.some((id) => !visibleIds.has(id))) {
      return err(403, 'Not allowed to view one or more artifacts');
    }

    return Response.json({ items: results });
  }

  return err(400, `Unknown action: "${action}"`);
});
