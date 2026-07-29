// ============================================================================
// Agent Enforcer — API layer
//
// All backend access flows through this module. Deployed builds talk to the
// real backend: the CDK deployment writes /config.js with the API base URL,
// read lazily by apiBase(). For local development against mock data, run
// `NEXT_PUBLIC_USE_MOCKS=true pnpm dev`; to hit a deployed API directly, set
// NEXT_PUBLIC_API_BASE instead.
// ============================================================================

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true'

declare global {
  interface Window {
    __AE_CONFIG__?: { apiBase?: string }
  }
}

/** Resolved lazily so /config.js never races module evaluation. */
function apiBase(): string {
  const fromConfig = typeof window !== 'undefined' ? window.__AE_CONFIG__?.apiBase : undefined
  return (fromConfig ?? process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '')
}

const TOKEN_KEY = 'ae_admin_token'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface LoginResponse {
  token: string
  expires_at: string
  username: string
}

export interface EnforcementDocument {
  id: string
  name: string
  description: string
  filename: string
  created: string
  updated: string
  deleted: string | null
  _version: number
  created_by: string
  updated_by: string
}

export interface Stats {
  active_licenses: number
  total_licenses: number
  max_licenses: number
  documents: number
  assistants_enabled: number
  unique_platforms: number
}

export interface Agent {
  id: number
  user_id: string
  agent_type: string
  agent_version: string
  created_date: string
  last_used_date: string
  active: boolean
  /** Bundle version (epoch millis) each assistant last applied on this host. */
  applied_versions?: Record<string, string>
}

export type AssistantKey = 'claude-code' | 'kiro' | 'cursor' | 'github-copilot'
export type AssistantsMap = Record<AssistantKey, boolean>

/** Assistants with a real generation pipeline (build records, bundles, zips). */
export const GENERATABLE_ASSISTANTS: AssistantKey[] = ['claude-code', 'cursor']

export type DocBuildState = 'current' | 'stale' | 'missing'

export interface BuildStatus {
  builds: Record<string, { version: string; built_at: string } | null>
  documents: Array<{ id: string; filename: string; status: Record<string, DocBuildState> }>
}

export interface InstallerDownload {
  filename: string
  platform: 'linux' | 'macos'
  version: string
  latest: boolean
  size: number
  updated: string
  url: string
}

export interface BundleDownload {
  assistant: string
  version: string
  built_at: string
  latest: boolean
  filename: string
  zip_url: string
}

/** A single generated file inside an assistant's S3 bundle folder. */
export interface BundleFile {
  path: string
  size: number
  updated: string
}

export interface DocumentWithUpload {
  document: EnforcementDocument
  upload_url: string
  upload_expires_in: number
}

export class ApiError extends Error {
  status: number
  detail?: string
  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

// ----------------------------------------------------------------------------
// Token helpers
// ----------------------------------------------------------------------------

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
}

/** Called on any 401 — clears the token and bounces to /login. */
function handleUnauthorized() {
  clearToken()
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login/'
  }
}

// ----------------------------------------------------------------------------
// Real fetch helper
// ----------------------------------------------------------------------------

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${apiBase()}${path}`, { ...init, headers })

  if (res.status === 401) {
    handleUnauthorized()
    throw new ApiError('Session expired', 401)
  }

  let body: unknown = null
  const text = await res.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!res.ok) {
    const err = body as { error?: string; detail?: string } | null
    throw new ApiError(err?.error ?? `Request failed (${res.status})`, res.status, err?.detail)
  }

  return body as T
}

// ----------------------------------------------------------------------------
// Mock fixtures + helpers
// ----------------------------------------------------------------------------

const latency = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 300))

let mockDocuments: EnforcementDocument[] = [
  {
    id: '8f14e45f-ceea-4e17-a09b-6d1c3f2a7b90',
    name: 'enforcement-doc-core',
    description: 'Base org-wide rules',
    filename: 'enforcement-doc-core.md',
    created: '2026-07-01T14:02:11Z',
    updated: '2026-07-18T09:30:45Z',
    deleted: null,
    _version: 3,
    created_by: 'admin',
    updated_by: 'admin',
  },
  {
    id: '2c9d1a77-90aa-4b1e-9f1f-5a3d8e6c4b21',
    name: 'enforcement-doc-security',
    description: 'Uploaded directly to S3',
    filename: 'enforcement-doc-security.md',
    created: '2026-07-10T08:15:00Z',
    updated: '2026-07-10T08:15:00Z',
    deleted: null,
    _version: 1,
    created_by: 's3-upload',
    updated_by: 's3-upload',
  },
]

let mockAssistants: AssistantsMap = {
  'claude-code': true,
  kiro: false,
  cursor: false,
  'github-copilot': false,
}

const MOCK_BUILD_VERSION = '1753751000000'
const MOCK_PREV_BUILD_VERSION = '1753664600000'

// Larger fleet so paging + filtering on the Fleet page are meaningful.
function seedAgents(): Agent[] {
  const types = ['ROCKY9', 'UBUNTU22', 'AMZN2023', 'RHEL9']
  const versions = ['0.3.0', '0.2.1', '0.3.1', '0.1.9']
  const users = [
    'i-0abc123def456', 'alice@example.com', 'i-0f9e8d7c6b5a4', 'bob@example.com',
    'i-0112233445566', 'carol@example.com', 'i-0aa11bb22cc33', 'dave@example.com',
    'i-0987654321fed', 'erin@example.com', 'i-0deadbeef0001', 'frank@example.com',
    'i-0cafef00dbabe', 'grace@example.com', 'i-0feedface1234', 'heidi@example.com',
    'i-05a5a5a5a5a5a', 'ivan@example.com', 'i-0b0b0b0b0b0b0', 'judy@example.com',
    'i-0c1c1c1c1c1c1', 'mallory@example.com', 'i-0d2d2d2d2d2d2', 'trent@example.com',
  ]
  return users.map((user_id, i) => {
    const daysAgoCreated = 60 - i * 2
    const daysAgoUsed = i % 5 === 0 ? 30 + i : i % 7
    return {
      id: 100 + i,
      user_id,
      agent_type: types[i % types.length],
      agent_version: versions[i % versions.length],
      created_date: new Date(Date.now() - daysAgoCreated * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      last_used_date: new Date(Date.now() - daysAgoUsed * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      active: i % 5 !== 0, // ~80% active
      applied_versions:
        i % 3 === 0
          ? { 'claude-code': MOCK_BUILD_VERSION, cursor: MOCK_BUILD_VERSION }
          : { 'claude-code': MOCK_BUILD_VERSION },
    }
  })
}

let mockAgents: Agent[] = seedAgents()

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

const MOCK_UPLOAD_URL =
  'https://agent-enforcer-source-mock.s3.amazonaws.com/upload?X-Amz-Mock=1'

// ----------------------------------------------------------------------------
// API surface
// ----------------------------------------------------------------------------

export async function login(username: string, password: string): Promise<LoginResponse> {
  if (USE_MOCKS) {
    await latency()
    if (username === 'admin' && password === 'admin') {
      return {
        token: 'eyJ1IjoiYWRtaW4i.mock.f3a9c1',
        expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
        username: 'admin',
      }
    }
    throw new ApiError('Invalid username or password', 401)
  }
  return request<LoginResponse>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function getStats(): Promise<Stats> {
  if (USE_MOCKS) {
    await latency()
    const active = mockAgents.filter((a) => a.active).length
    return {
      active_licenses: active,
      total_licenses: mockAgents.length,
      max_licenses: 30,
      documents: mockDocuments.filter((d) => !d.deleted).length,
      assistants_enabled: Object.values(mockAssistants).filter(Boolean).length,
      unique_platforms: new Set(mockAgents.map((a) => a.agent_type)).size,
    }
  }
  return request<Stats>('/admin/stats')
}

export async function getAgents(): Promise<{ agents: Agent[]; count: number }> {
  if (USE_MOCKS) {
    await latency()
    return { agents: [...mockAgents], count: mockAgents.length }
  }
  return request<{ agents: Agent[]; count: number }>('/admin/agents')
}

/**
 * De-register an agent: releases its license and removes it from the fleet.
 * The license count reported by getStats drops automatically since it is
 * derived from the live agent list.
 */
export async function deregisterAgent(id: number): Promise<{ id: number }> {
  if (USE_MOCKS) {
    await latency()
    const exists = mockAgents.some((a) => a.id === id)
    if (!exists) throw new ApiError('Agent not found', 404)
    mockAgents = mockAgents.filter((a) => a.id !== id)
    return { id }
  }
  return request<{ id: number }>(`/admin/agents/${id}`, { method: 'DELETE' })
}

export async function getDocuments(): Promise<{ documents: EnforcementDocument[] }> {
  if (USE_MOCKS) {
    await latency()
    return { documents: mockDocuments.map((d) => ({ ...d })) }
  }
  return request<{ documents: EnforcementDocument[] }>('/admin/documents')
}

export async function createDocument(input: {
  name: string
  description: string
  filename: string
}): Promise<DocumentWithUpload> {
  if (USE_MOCKS) {
    await latency()
    const clash = mockDocuments.find((d) => !d.deleted && d.filename === input.filename)
    if (clash) {
      throw new ApiError(`A document already tracks ${input.filename}`, 409, 'Use its re-upload action to replace the file, or delete it first.')
    }
    const doc: EnforcementDocument = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      filename: input.filename,
      created: nowIso(),
      updated: nowIso(),
      deleted: null,
      _version: 1,
      created_by: 'admin',
      updated_by: 'admin',
    }
    mockDocuments = [...mockDocuments, doc]
    return { document: doc, upload_url: MOCK_UPLOAD_URL, upload_expires_in: 600 }
  }
  return request<DocumentWithUpload>('/admin/documents', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateDocument(
  id: string,
  input: { name?: string; description?: string },
): Promise<{ document: EnforcementDocument }> {
  if (USE_MOCKS) {
    await latency()
    const idx = mockDocuments.findIndex((d) => d.id === id)
    if (idx === -1) throw new ApiError('Document not found', 404)
    const updated: EnforcementDocument = {
      ...mockDocuments[idx],
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updated: nowIso(),
      updated_by: 'admin',
      _version: mockDocuments[idx]._version + 1,
    }
    mockDocuments = mockDocuments.map((d) => (d.id === id ? updated : d))
    return { document: updated }
  }
  return request<{ document: EnforcementDocument }>(`/admin/documents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteDocument(id: string): Promise<{ document: EnforcementDocument }> {
  if (USE_MOCKS) {
    await latency()
    const idx = mockDocuments.findIndex((d) => d.id === id)
    if (idx === -1) throw new ApiError('Document not found', 404)
    const deleted: EnforcementDocument = {
      ...mockDocuments[idx],
      deleted: nowIso(),
      updated: nowIso(),
      updated_by: 'admin',
    }
    mockDocuments = mockDocuments.map((d) => (d.id === id ? deleted : d))
    return { document: deleted }
  }
  return request<{ document: EnforcementDocument }>(`/admin/documents/${id}`, {
    method: 'DELETE',
  })
}

export async function getDownloadUrl(id: string): Promise<{ download_url: string }> {
  if (USE_MOCKS) {
    await latency()
    const doc = mockDocuments.find((d) => d.id === id)
    if (!doc) throw new ApiError('Document not found', 404)
    // Synthesize a representative Markdown file so the download works offline.
    const content = [
      `# ${doc.name}`,
      '',
      doc.description || '_No description provided._',
      '',
      '---',
      `<!-- ${doc.filename} · v${doc._version} · updated ${doc.updated} by ${doc.updated_by} -->`,
      '',
    ].join('\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }))
    return { download_url: url }
  }
  return request<{ download_url: string }>(`/admin/documents/${id}/download-url`, {
    method: 'POST',
  })
}

export async function getUploadUrl(id: string): Promise<{ upload_url: string; upload_expires_in: number }> {
  if (USE_MOCKS) {
    await latency()
    const doc = mockDocuments.find((d) => d.id === id)
    if (!doc) throw new ApiError('Document not found', 404)
    return { upload_url: MOCK_UPLOAD_URL, upload_expires_in: 600 }
  }
  return request<{ upload_url: string; upload_expires_in: number }>(
    `/admin/documents/${id}/upload-url`,
    { method: 'POST' },
  )
}

/**
 * PUT the raw file body to a presigned URL. No auth header, no special
 * content-type. In mock mode this just simulates progress.
 */
export async function uploadFile(
  uploadUrl: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (USE_MOCKS) {
    for (let pct = 0; pct <= 100; pct += 20) {
      onProgress?.(pct)
      await new Promise((r) => setTimeout(r, 90))
    }
    return
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new ApiError('Upload failed', xhr.status))
    }
    xhr.onerror = () => reject(new ApiError('Upload failed', 0))
    xhr.send(file)
  })
}

export async function getAssistants(): Promise<{ assistants: AssistantsMap }> {
  if (USE_MOCKS) {
    await latency()
    return { assistants: { ...mockAssistants } }
  }
  return request<{ assistants: AssistantsMap }>('/admin/assistants')
}

export async function updateAssistants(
  partial: Partial<AssistantsMap>,
): Promise<{ assistants: AssistantsMap }> {
  if (USE_MOCKS) {
    await latency()
    mockAssistants = { ...mockAssistants, ...partial }
    return { assistants: { ...mockAssistants } }
  }
  return request<{ assistants: AssistantsMap }>('/admin/assistants', {
    method: 'PUT',
    body: JSON.stringify({ assistants: partial }),
  })
}

// ----------------------------------------------------------------------------
// Generated bundles (per-assistant S3 folder)
// ----------------------------------------------------------------------------

const mockBundles: Partial<Record<AssistantKey, Record<string, string>>> = {
  'claude-code': {
    'CLAUDE.md': `# Agent Enforcer Policy — Claude Code

> Auto-generated from **enforcement-doc-core** (v3) and **enforcement-doc-security** (v1).
> Do not edit by hand; changes are overwritten on the next bundle build.

## Ground rules

1. **Never** run destructive shell commands (\`rm -rf\`, \`DROP TABLE\`) without an explicit approval step.
2. Secrets and credentials must never be printed, logged, or committed.
3. All network egress is restricted to the domains in \`settings.allowedHosts\`.

## Escalation

When a task requires a blocked capability, stop and ask the operator rather than
working around the restriction.`,
    'settings.md': `# Settings

| Key | Value |
| --- | --- |
| \`model\` | \`claude-sonnet-4.5\` |
| \`maxTokens\` | \`8192\` |
| \`allowedHosts\` | \`api.internal\`, \`github.com\` |
| \`autoApprove\` | \`false\` |

Generated \`2026-07-19T09:55:00Z\`.`,
    'skills/enforce-policy.md': `# Skill: enforce-policy

Applies the organization enforcement document to every code change.

## Steps

1. Read the diff.
2. Cross-check against \`CLAUDE.md\` ground rules.
3. If a violation is detected, **block** and emit a structured report:

\`\`\`json
{
  "violation": "network_egress",
  "detail": "attempted request to evil.example.com",
  "severity": "high"
}
\`\`\`

4. Otherwise, approve and continue.`,
    'commands/scan.md': `# Command: /scan

Runs a full policy scan across the current workspace.

- **Usage:** \`/scan [path]\`
- **Default path:** repository root

Returns a checklist of passed and failed policy rules.`,
  },
  cursor: {
    'AGENTS.md': `<!-- managed by agent-enforcer -->
# Enforcement Rules

- Never print, log, or commit secrets or credentials.
- Use parameterized queries for all SQL.
- Validate all external input at the boundary.`,
    '.cursor/rules/secure-development.mdc': `---
description: Secure coding standards for all code changes
alwaysApply: false
---
<!-- managed by agent-enforcer -->

- Type-hint all new Python functions; docstring every public API.
- Run containers as a non-root user.
- No magic numbers — named constants at module level.

Sources: enforcement-doc-core.md`,
  },
}

function bundleFilesFor(assistant: AssistantKey): BundleFile[] {
  const files = mockBundles[assistant]
  if (!files) return []
  return Object.entries(files).map(([path, content]) => ({
    path,
    size: new Blob([content]).size,
    updated: '2026-07-19T09:55:00Z',
  }))
}

export async function listBundleFiles(
  assistant: AssistantKey,
): Promise<{ assistant: AssistantKey; files: BundleFile[] }> {
  if (USE_MOCKS) {
    await latency()
    return { assistant, files: bundleFilesFor(assistant) }
  }
  return request<{ assistant: AssistantKey; files: BundleFile[] }>(
    `/admin/assistants/${assistant}/bundle`,
  )
}

export async function getBundleFile(
  assistant: AssistantKey,
  path: string,
): Promise<{ path: string; content: string }> {
  if (USE_MOCKS) {
    await latency()
    const content = mockBundles[assistant]?.[path]
    if (content === undefined) throw new ApiError('Bundle file not found', 404)
    return { path, content }
  }
  return request<{ path: string; content: string }>(
    `/admin/assistants/${assistant}/bundle/${encodeURIComponent(path)}`,
  )
}

// ----------------------------------------------------------------------------
// Build status (per-document inclusion in the latest bundle builds)
// ----------------------------------------------------------------------------

export async function getBuildStatus(): Promise<BuildStatus> {
  if (USE_MOCKS) {
    await latency()
    const docs = mockDocuments.filter((d) => !d.deleted)
    return {
      builds: {
        'claude-code': { version: MOCK_BUILD_VERSION, built_at: '2026-07-28T22:00:00Z' },
        cursor: null,
      },
      documents: docs.map((d, i) => ({
        id: d.id,
        filename: d.filename,
        status: {
          'claude-code': i === 0 ? 'current' : 'stale',
          cursor: 'missing',
        },
      })),
    }
  }
  return request<BuildStatus>('/admin/build-status')
}

// ----------------------------------------------------------------------------
// Downloads (installers + generated agent packages)
// ----------------------------------------------------------------------------

export async function getInstallerDownloads(): Promise<{ installers: InstallerDownload[] }> {
  if (USE_MOCKS) {
    await latency()
    return {
      installers: [
        {
          filename: 'agent-enforcer.rpm', platform: 'linux', version: 'latest', latest: true,
          size: 14_336, updated: '2026-07-28T21:40:00Z',
          url: 'https://agent-enforcer-rpm.s3.amazonaws.com/installers/latest/agent-enforcer.rpm',
        },
        {
          filename: 'agent-enforcer.pkg', platform: 'macos', version: 'latest', latest: true,
          size: 18_204, updated: '2026-07-28T21:40:00Z',
          url: 'https://agent-enforcer-rpm.s3.amazonaws.com/installers/latest/agent-enforcer.pkg',
        },
        {
          filename: 'agent-enforcer-1.0.0-1.el9.noarch.rpm', platform: 'linux', version: '1.0.0',
          latest: false, size: 14_336, updated: '2026-07-28T21:40:00Z',
          url: 'https://agent-enforcer-rpm.s3.amazonaws.com/installers/1.0.0/agent-enforcer-1.0.0-1.el9.noarch.rpm',
        },
        {
          filename: 'agent-enforcer-0.4.0-1.el9.noarch.rpm', platform: 'linux', version: '0.4.0',
          latest: false, size: 13_990, updated: '2026-07-20T10:00:00Z',
          url: 'https://agent-enforcer-rpm.s3.amazonaws.com/installers/0.4.0/agent-enforcer-0.4.0-1.el9.noarch.rpm',
        },
      ],
    }
  }
  return request<{ installers: InstallerDownload[] }>('/admin/downloads/installers')
}

export async function getBundleDownloads(): Promise<{ bundles: BundleDownload[] }> {
  if (USE_MOCKS) {
    await latency()
    return {
      bundles: [
        {
          assistant: 'claude-code', version: MOCK_BUILD_VERSION, built_at: '2026-07-28T22:00:00Z',
          latest: true, filename: `claude-code.${MOCK_BUILD_VERSION}.zip`, zip_url: MOCK_UPLOAD_URL,
        },
        {
          assistant: 'cursor', version: MOCK_BUILD_VERSION, built_at: '2026-07-28T22:00:00Z',
          latest: true, filename: `cursor.${MOCK_BUILD_VERSION}.zip`, zip_url: MOCK_UPLOAD_URL,
        },
        {
          assistant: 'claude-code', version: MOCK_PREV_BUILD_VERSION, built_at: '2026-07-27T22:00:00Z',
          latest: false, filename: `claude-code.${MOCK_PREV_BUILD_VERSION}.zip`, zip_url: MOCK_UPLOAD_URL,
        },
      ],
    }
  }
  return request<{ bundles: BundleDownload[] }>('/admin/downloads/bundles')
}
