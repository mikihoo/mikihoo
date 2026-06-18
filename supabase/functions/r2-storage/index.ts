import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient }    from 'https://esm.sh/aws4fetch@1.0.20'

const ALLOWED_ORIGINS = [
  'https://mikihoo.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
]

Deno.serve(async (req: Request) => {
  const origin        = req.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  const cors = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  // ── 인증 확인 ──────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401, cors)
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.slice(7))
  if (authErr || !user) {
    return json({ error: 'Unauthorized' }, 401, cors)
  }

  // ── R2 클라이언트 ──────────────────────────────────────────────────────────
  const accountId = Deno.env.get('R2_ACCOUNT_ID')!
  const bucket    = Deno.env.get('R2_BUCKET_NAME')!
  const endpoint  = `https://${accountId}.r2.cloudflarestorage.com`

  const aws = new AwsClient({
    accessKeyId:     Deno.env.get('R2_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    region:  'auto',
    service: 's3',
  })

  // ── 요청 분기 ──────────────────────────────────────────────────────────────
  let body: { action?: string; key?: string } = {}
  try { body = await req.json() } catch { return json({ error: 'invalid body' }, 400, cors) }

  // ── upload: presigned PUT URL 발급 ─────────────────────────────────────────
  if (body.action === 'upload') {
    const key = body.key
    if (!key) return json({ error: 'key required' }, 400, cors)

    const objectUrl = new URL(`${endpoint}/${bucket}/${encodeURIComponent(key)}`)
    objectUrl.searchParams.set('X-Amz-Expires', '300') // 5분

    const signed = await aws.sign(
      new Request(objectUrl.toString(), { method: 'PUT' }),
      { aws: { signQuery: true } },
    )
    return json({ url: signed.url }, 200, cors)
  }

  // ── delete: R2 오브젝트 직접 삭제 ──────────────────────────────────────────
  if (body.action === 'delete') {
    const key = body.key
    if (!key) return json({ error: 'key required' }, 400, cors)

    const res = await aws.fetch(`${endpoint}/${bucket}/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 204) {
      return json({ error: 'R2 delete failed', status: res.status }, 500, cors)
    }
    return json({ ok: true }, 200, cors)
  }

  return json({ error: 'unknown action' }, 400, cors)
})

function json(data: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
