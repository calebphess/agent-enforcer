// ============================================================================
// Agent Enforcer showcase — API layer
//
// The contact form posts to the ShowcaseStack's API Gateway. The deploy
// writes /config.js with the real API base URL (see cdk/lib/showcase-stack.ts),
// read lazily here so it never races module evaluation.
// ============================================================================

declare global {
  interface Window {
    __SHOWCASE_CONFIG__?: { apiBase?: string }
  }
}

function apiBase(): string {
  const fromConfig = typeof window !== 'undefined' ? window.__SHOWCASE_CONFIG__?.apiBase : undefined
  return (fromConfig ?? process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '')
}

export type ContactPayload = {
  name: string
  email: string
  organization: string
  tier: string
  seats: string
  message: string
}

export type ContactResponse =
  | { ok: true; res: Response }
  | { ok: false; res: Response; body: { error?: string; fields?: Record<string, string> } }

export async function submitContact(payload: ContactPayload): Promise<ContactResponse> {
  const res = await fetch(`${apiBase()}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, res, body }
  }
  return { ok: true, res }
}
