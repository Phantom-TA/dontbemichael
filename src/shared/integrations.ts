/**
 * Integrations registry — shared schema (Phase 2 foundation).
 *
 * A dependency-free, importable-by-both (main + renderer) module declaring the
 * integration record/template types, their validation, and the v1 reference
 * templates. Mirrors the posture of `src/shared/mcpCatalog.ts`: NO electron / node /
 * UI imports so it can be pulled into the main process, the preload bridge, and the
 * renderer alike.
 *
 * An *integration* is a labeled REST endpoint a user registers ("label it and it's
 * available"). The record carries METADATA ONLY — never the secret value, only a
 * `secretRef` handle into the encrypted secret store (see src/main/integrations.ts).
 * The loopback secret broker (src/main/integrationBroker.ts) is the ONLY place a real
 * secret is materialized, and only at forward-time inside the main process.
 *
 * Relationship to mcpCatalog.ts: that catalog declares STDIO MCP servers; this
 * registry declares HTTP REST endpoints reached through the loopback broker — a
 * complementary transport, not a competing catalog. Where a service overlaps
 * (github/db/email/search) the labels are kept aligned.
 *
 * Full contract: hive/docs/integrations-spec.md.
 */

import { RESEARCH_ID } from './research';

export type IntegrationKind = 'github' | 'custom-rest';

/** How the broker injects credentials when forwarding to the integration's baseUrl.
 *  This is the ONLY auth-injection vocabulary; the secret is supplied by the broker
 *  at forward-time, never stored here. */
export type IntegrationAuthType =
  | 'none'    // public API — inject nothing
  | 'bearer'  // Authorization: Bearer <secret>
  | 'header'  // <authHeader>: <secret>   (authHeader required)
  | 'github'; // Authorization: Bearer <secret> + GitHub API headers

/** A registered integration. METADATA ONLY — carries NO secret value, only a
 *  `secretRef` handle. Safe to persist in config.json and cross IPC to the renderer. */
export interface IntegrationRecord {
  /** Stable slug, unique. See SLUG_RE. Also seeds the secretRef (`int:<id>`). */
  id: string;
  /** Human label for the UI (<= 60 chars). */
  label: string;
  /** Preset family — drives default headers and UI affordances. */
  kind: IntegrationKind;
  /** https origin (+ optional base path). The broker forwards <baseUrl>/<path>. A
   *  loopback http origin is allowed only for explicit local custom-rest targets. */
  baseUrl: string;
  /** How the broker injects auth when forwarding upstream. */
  authType: IntegrationAuthType;
  /** REQUIRED iff authType === 'header' — the header NAME to inject the secret under. */
  authHeader?: string;
  /** HANDLE into the encrypted secret store; NEVER the secret. Present iff
   *  authType !== 'none'. Convention: `int:<id>`. */
  secretRef?: string;
  /** Consent gate. A worker can reach an integration ONLY when enabled. */
  enabled: boolean;
  /** The one request agents may make here, custom REST only. With one, an agent
   *  sends only a message, and nothing else reaches this connection.
   *  gstack-shortcut(dec-754058e5): one call per connection, upgrade when one
   *  server needs two or more saved calls. */
  call?: SavedCall;
  /** epoch ms. */
  createdAt: number;
  /** epoch ms. */
  updatedAt: number;
}

/** A request the owner saved on a connection. The agent's message goes where
 *  {{message}} stands, in the path, the body or both. */
export interface SavedCall {
  method: 'GET' | 'POST';
  /** Under baseUrl, with an optional query. Empty is the base URL itself. */
  path?: string;
  /** JSON text. POST only. */
  body?: string;
  /** The owner's words on what it is for and what to ask. Agents read this. */
  purpose: string;
}

/** The POSTs a catalog connector only reads with (search, query, a GraphQL
 *  query). The broker sends these the read way, never through its write journal. */
export interface PostReads {
  /** The connector's API host, or a host suffix that starts with a dot. */
  host: string;
  /** URL paths (regex sources, whole path) whose POST only reads. */
  paths?: string[];
  /** A GraphQL API: a POST that runs only queries reads. */
  graphql?: boolean;
}

/** A preset that seeds an IntegrationRecord. Dwight extends the catalog by appending
 *  to INTEGRATION_TEMPLATES — no broker or registry changes needed. */
export interface IntegrationTemplate {
  kind: IntegrationKind;
  /** Default label (user-editable). */
  label: string;
  /** Default origin. Empty for custom-rest (the user supplies it). */
  baseUrl: string;
  authType: IntegrationAuthType;
  /** For authType 'header'. */
  authHeader?: string;
  /** UI prompt for the secret field, e.g. "GitHub personal access token". */
  secretLabel?: string;
  /** One line: where to get the secret / what scopes it needs. */
  secretHelp?: string;
  /** https link for the UI. */
  docsUrl?: string;
  /** Default slug seed. */
  idSuggestion: string;
  /** POSTs that only read, for an API that searches or queries with POST. */
  postReads?: PostReads;
}

/** Integration id: lowercase slug, 2–40 chars, no leading/trailing hyphen. */
export const INTEGRATION_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
/** A header name the broker may inject under (authType 'header'). */
export const HEADER_NAME_RE = /^[A-Za-z0-9-]{1,64}$/;
export const ALL_AUTH_TYPES: readonly IntegrationAuthType[] = ['none', 'bearer', 'header', 'github'];
export const ALL_KINDS: readonly IntegrationKind[] = ['github', 'custom-rest'];
/** What main answers when a NEW integration names an id already registered:
 *  saving under it would replace that integration and its secret (`int:<id>`).
 *  The form shows its own words for it. */
export const INTEGRATION_ID_TAKEN = 'An integration with this id already exists, so nothing was saved over it.';

/** Where an agent's message goes in a saved call. */
export const MESSAGE_PLACEHOLDER = '{{message}}';
const PURPOSE_MAX = 300;

/** Why a saved call can't be saved. The form shows its own words for each. */
export type SavedCallProblem = 'kind' | 'method' | 'purpose' | 'path' | 'body' | 'bodyOnGet' | 'noMessage';

const SAVED_CALL_ERRORS: Record<SavedCallProblem, string> = {
  kind: 'Only a custom REST connection can hold a saved call.',
  method: 'A saved call is GET or POST.',
  purpose: `Say what the saved call is for, in ${PURPOSE_MAX} characters at most.`,
  path: 'The saved call\'s path must stay under the base URL.',
  body: 'The saved call\'s body must be a JSON object or list.',
  bodyOnGet: 'A GET has no body.',
  noMessage: `Put ${MESSAGE_PLACEHOLDER} in the path or body, where the agent's message goes.`
};

/** The secretRef handle for an integration id (1:1). */
export function secretRefFor(id: string): string {
  return `int:${id}`;
}

/** True iff this auth type needs a stored secret. */
export function authTypeNeedsSecret(t: IntegrationAuthType): boolean {
  return t !== 'none';
}

/**
 * Validate an integration record (the upsert gate). Mirrors validateHireManifest's
 * style: returns { ok:true } or { ok:false, error }. Fail closed — anything not
 * explicitly allowed is rejected. `createdAt`/`updatedAt` are stamped by the
 * registry, so they are not required on input.
 */
export function validateIntegrationRecord(
  rec: unknown
): { ok: true; value: Omit<IntegrationRecord, 'createdAt' | 'updatedAt'> } | { ok: false; error: string } {
  if (!rec || typeof rec !== 'object') return { ok: false, error: 'record must be an object' };
  const r = rec as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id.trim() : '';
  if (!INTEGRATION_SLUG_RE.test(id)) {
    return { ok: false, error: 'id must be a lowercase slug: 2 to 40 characters, letters a to z, digits 0 to 9 and hyphens, not starting or ending with a hyphen' };
  }
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  if (!label || label.length > 60) return { ok: false, error: 'label is required and must be <= 60 chars' };

  const kind = r.kind as IntegrationKind;
  if (!ALL_KINDS.includes(kind)) return { ok: false, error: `kind must be one of ${ALL_KINDS.join(', ')}` };

  const authType = r.authType as IntegrationAuthType;
  if (!ALL_AUTH_TYPES.includes(authType)) {
    return { ok: false, error: `authType must be one of ${ALL_AUTH_TYPES.join(', ')}` };
  }

  const baseUrl = typeof r.baseUrl === 'string' ? r.baseUrl.trim() : '';
  const urlCheck = validateBaseUrl(baseUrl);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  let authHeader: string | undefined;
  if (authType === 'header') {
    authHeader = typeof r.authHeader === 'string' ? r.authHeader.trim() : '';
    if (!authHeader || !HEADER_NAME_RE.test(authHeader)) {
      return { ok: false, error: "authType 'header' requires authHeader matching [A-Za-z0-9-]{1,64}" };
    }
  } else if (r.authHeader != null && String(r.authHeader).trim() !== '') {
    return { ok: false, error: "authHeader is only valid when authType === 'header'" };
  }

  const needsSecret = authTypeNeedsSecret(authType);
  const secretRef = needsSecret ? secretRefFor(id) : undefined;
  const enabled = r.enabled === true;

  let call: SavedCall | undefined;
  if (r.call != null) {
    const checked = kind === 'custom-rest' ? validateSavedCall(r.call, baseUrl) : ({ ok: false, code: 'kind' } as const);
    if (!checked.ok) return { ok: false, error: SAVED_CALL_ERRORS[checked.code] };
    call = checked.value;
  }

  return { ok: true, value: { id, label, kind, baseUrl, authType, authHeader, secretRef, enabled, ...(call ? { call } : {}) } };
}

/** The owner may leave {{message}} unquoted, which isn't JSON yet. Text inside
 *  a JSON string is left alone. */
function quoteBarePlaceholders(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (text.startsWith(MESSAGE_PLACEHOLDER, i)) {
      out += `"${MESSAGE_PLACEHOLDER}"`;
      i += MESSAGE_PLACEHOLDER.length - 1;
    } else {
      if (c === '"') inString = true;
      out += c;
    }
  }
  return out;
}

/** Whether any string value holds {{message}}. A key is never filled. */
function holdsPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(MESSAGE_PLACEHOLDER);
  if (Array.isArray(value)) return value.some(holdsPlaceholder);
  return !!value && typeof value === 'object' && Object.values(value).some(holdsPlaceholder);
}

/** Check a saved call for this base URL, with its body ready to store. */
export function validateSavedCall(raw: unknown, baseUrl: string): { ok: true; value: SavedCall } | { ok: false; code: SavedCallProblem } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const method = r.method;
  if (method !== 'GET' && method !== 'POST') return { ok: false, code: 'method' };
  const purpose = typeof r.purpose === 'string' ? r.purpose.trim() : '';
  if (!purpose || purpose.length > PURPOSE_MAX) return { ok: false, code: 'purpose' };
  const path = typeof r.path === 'string' ? r.path.trim() : '';
  if (path.includes('#') || !resolveUpstreamUrl(baseUrl, path.split(MESSAGE_PLACEHOLDER).join('x'))) return { ok: false, code: 'path' };
  const text = typeof r.body === 'string' ? r.body.trim() : '';
  if (text && method === 'GET') return { ok: false, code: 'bodyOnGet' };
  let body: string | undefined;
  let parsed: unknown;
  if (text) {
    body = quoteBarePlaceholders(text);
    try { parsed = JSON.parse(body); } catch { return { ok: false, code: 'body' }; }
    if (!parsed || typeof parsed !== 'object') return { ok: false, code: 'body' };
  }
  if (!path.includes(MESSAGE_PLACEHOLDER) && !holdsPlaceholder(parsed)) return { ok: false, code: 'noMessage' };
  return { ok: true, value: { method, purpose, ...(path ? { path } : {}), ...(body ? { body } : {}) } };
}

/** A saved call with the agent's message in place. The body is filled after
 *  parsing, so a quote or line break in the message can't add or change a
 *  field. Null for a damaged saved call: nothing is sent. */
export function fillSavedCall(call: SavedCall, message: string): { method: 'GET' | 'POST'; path: string; body?: string } | null {
  if (call.method !== 'GET' && call.method !== 'POST') return null;
  const path = (call.path ?? '').split(MESSAGE_PLACEHOLDER).join(encodeURIComponent(message));
  if (call.method === 'GET' || !call.body) return { method: call.method, path };
  const fill = (value: unknown): unknown => {
    if (typeof value === 'string') return value.split(MESSAGE_PLACEHOLDER).join(message);
    if (Array.isArray(value)) return value.map(fill);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]));
    return value;
  };
  try { return { method: call.method, path, body: JSON.stringify(fill(JSON.parse(call.body))) }; }
  catch { return null; }
}

/** Validate a baseUrl: https origin (+ optional path), no userinfo, no traversal.
 *  A loopback http origin (127.0.0.1 / [::1] / localhost) is permitted for explicit
 *  local custom-rest targets the user registers. */
export function validateBaseUrl(baseUrl: string): { ok: true; url: URL } | { ok: false; error: string } {
  if (!baseUrl) return { ok: false, error: 'baseUrl is required' };
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    return { ok: false, error: 'baseUrl must be a valid URL' };
  }
  if (u.username || u.password) return { ok: false, error: 'baseUrl must not contain userinfo' };
  if (u.search || u.hash) return { ok: false, error: 'baseUrl must not contain a query or fragment' };
  if (baseUrl.includes('..')) return { ok: false, error: 'baseUrl must not contain ".."' };
  const isLoopbackHost =
    u.hostname === '127.0.0.1' || u.hostname === '::1' || u.hostname === '[::1]' || u.hostname === 'localhost';
  if (u.protocol === 'https:') return { ok: true, url: u };
  if (u.protocol === 'http:' && isLoopbackHost) return { ok: true, url: u };
  return { ok: false, error: 'baseUrl must be https (http allowed only for 127.0.0.1/localhost)' };
}

/**
 * Build the upstream auth headers the broker injects when forwarding. Pure — the
 * caller (the broker, in main) passes the already-decrypted secret; this function
 * never reads any store and never logs. Returns the header map to merge into the
 * outbound request (lowercased keys).
 */
export function buildAuthHeaders(
  authType: IntegrationAuthType,
  authHeader: string | undefined,
  secret: string | undefined
): Record<string, string> {
  switch (authType) {
    case 'none':
      return {};
    case 'bearer':
      return secret ? { authorization: `Bearer ${secret}` } : {};
    case 'header':
      return secret && authHeader ? { [authHeader.toLowerCase()]: secret } : {};
    case 'github':
      return {
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28'
      };
    default:
      return {};
  }
}

/**
 * Join an integration baseUrl with a worker-supplied path, confining the result
 * under the baseUrl origin (NOT an open proxy). Returns null if the path would
 * escape the origin (absolute URL, host override, or traversal above the base path).
 * `pathAndQuery` is the part after `/i/<integrationId>/` including any query string.
 */
export function resolveUpstreamUrl(baseUrl: string, pathAndQuery: string): URL | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  // Reject anything that smells like an absolute target or traversal.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathAndQuery)) return null; // scheme://...
  if (pathAndQuery.startsWith('//')) return null; // protocol-relative host override
  // Decode the path before the traversal check so an encoded `%2e%2e` is caught too.
  const pathOnly = pathAndQuery.split(/[?#]/)[0];
  let decodedPath: string;
  try { decodedPath = decodeURIComponent(pathOnly); } catch { return null; }
  if (decodedPath.split('/').some((seg) => seg === '..')) return null;

  // Normalize the base path to a directory prefix, then append the worker path.
  const basePath = base.pathname.endsWith('/') ? base.pathname : base.pathname + '/';
  const rel = pathAndQuery.replace(/^\/+/, '');
  // No path means the base URL as saved: a slash added here is a different
  // address to many servers, and the broker follows no redirect.
  const whole = rel === '' || rel.startsWith('?') ? base.pathname + rel : basePath + rel;
  let resolved: URL;
  try {
    resolved = new URL(whole, base.origin);
  } catch {
    return null;
  }
  // Confine: same origin AND the resolved path stays under the base path prefix.
  if (resolved.origin !== base.origin) return null;
  const confinePrefix = base.pathname.endsWith('/') ? base.pathname : base.pathname + '/';
  if (confinePrefix !== '/' && !(resolved.pathname + '/').startsWith(confinePrefix) && resolved.pathname !== base.pathname) {
    return null;
  }
  return resolved;
}

/** v1 reference templates — the two end-to-end references. Dwight appends more here. */
export const INTEGRATION_TEMPLATES: IntegrationTemplate[] = [
  {
    kind: 'github',
    label: 'GitHub',
    baseUrl: 'https://api.github.com',
    authType: 'github',
    secretLabel: 'GitHub personal access token',
    secretHelp: 'Create a fine-grained or classic PAT at github.com/settings/tokens with the scopes your workers need.',
    docsUrl: 'https://docs.github.com/rest',
    idSuggestion: 'github'
  },
  {
    kind: 'custom-rest',
    label: 'Custom REST API',
    baseUrl: '',
    authType: 'bearer',
    secretLabel: 'API key / token',
    secretHelp: 'Point baseUrl at any REST API. Choose how its credential is sent: Bearer token, a custom header, or none.',
    idSuggestion: 'my-api'
  },

  // ─── First-wave YC tools (Dwight, P2) ───────────────────────────────────────
  // Per-tool auth model + high-value endpoint catalog: hive/docs/integration-templates.md.
  // Gmail / Google Calendar / Salesforce are intentionally NOT registered yet: they
  // authenticate via OAuth, and IntegrationAuthType has no `oauth2` (OAuth refresh is a
  // v1 non-goal — spec §8). They are documented under "Pending: OAuth broker".
  {
    kind: 'custom-rest',
    label: 'Linear',
    baseUrl: 'https://api.linear.app/graphql',
    authType: 'header',
    authHeader: 'Authorization',
    secretLabel: 'Linear API key',
    secretHelp: 'Linear → Settings → Security & access → Personal API keys. Sent verbatim in Authorization (no "Bearer"). Every call POSTs to /graphql.',
    docsUrl: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api',
    idSuggestion: 'linear',
    postReads: { host: 'api.linear.app', graphql: true }
  },
  {
    kind: 'custom-rest',
    label: 'Jira',
    baseUrl: 'https://your-domain.atlassian.net/rest/api/3',
    authType: 'header',
    authHeader: 'Authorization',
    secretLabel: 'Authorization header (Basic …)',
    secretHelp: 'Basic auth: paste "Basic " + base64("<email>:<api-token>"). Token at id.atlassian.com → Security → API tokens. Replace your-domain with your Atlassian site.',
    docsUrl: 'https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/',
    idSuggestion: 'jira',
    postReads: { host: '.atlassian.net', paths: ['/rest/api/3/search', '/rest/api/3/search/jql'] }
  },
  {
    kind: 'custom-rest',
    label: 'Notion',
    baseUrl: 'https://api.notion.com/v1',
    authType: 'bearer',
    secretLabel: 'Notion internal integration token',
    secretHelp: 'notion.so/my-integrations → Internal Integration Secret; share target pages/DBs with it. Every request also needs header "Notion-Version: 2022-06-28" (worker sends it per request).',
    docsUrl: 'https://developers.notion.com/reference/intro',
    idSuggestion: 'notion',
    postReads: { host: 'api.notion.com', paths: ['/v1/databases/[^/]+/query', '/v1/search'] }
  },
  {
    kind: 'custom-rest',
    label: 'Stripe',
    baseUrl: 'https://api.stripe.com/v1',
    authType: 'bearer',
    secretLabel: 'Stripe secret key',
    secretHelp: 'dashboard.stripe.com → Developers → API keys → Secret key (sk_live_/sk_test_). Restricted keys recommended. Bodies are form-encoded, not JSON.',
    docsUrl: 'https://stripe.com/docs/api',
    idSuggestion: 'stripe'
  },
  {
    kind: 'custom-rest',
    label: 'Confluence',
    baseUrl: 'https://your-domain.atlassian.net/wiki/api/v2',
    authType: 'header',
    authHeader: 'Authorization',
    secretLabel: 'Authorization header (Basic …)',
    secretHelp: 'Basic auth: paste "Basic " + base64("<email>:<api-token>") (same Atlassian token as Jira). Replace your-domain with your site.',
    docsUrl: 'https://developer.atlassian.com/cloud/confluence/rest/v2/intro/',
    idSuggestion: 'confluence'
  },
  {
    kind: 'custom-rest',
    label: 'Sentry',
    baseUrl: 'https://sentry.io/api/0',
    authType: 'bearer',
    secretLabel: 'Sentry auth token',
    secretHelp: 'sentry.io → Settings → Auth Tokens. Org-scoped routes carry your org slug in the path, e.g. /organizations/<org>/issues/.',
    docsUrl: 'https://docs.sentry.io/api/',
    idSuggestion: 'sentry'
  },
  {
    kind: 'custom-rest',
    label: 'HubSpot',
    baseUrl: 'https://api.hubapi.com',
    authType: 'bearer',
    secretLabel: 'HubSpot private app token',
    secretHelp: 'HubSpot → Settings → Integrations → Private Apps → create app → Access token (scopes crm.objects.*).',
    docsUrl: 'https://developers.hubspot.com/docs/api/crm/understanding-the-crm',
    idSuggestion: 'hubspot',
    postReads: { host: 'api.hubapi.com', paths: ['/crm/v3/objects/[^/]+/search'] }
  }
];

/** The catalog's POST reads for a connector, found by its base URL's host. A
 *  custom REST API matches none, so all its POSTs stay writes. */
export function postReadsFor(baseUrl: string): PostReads[] {
  let host: string;
  try { host = new URL(baseUrl).hostname.toLowerCase(); } catch { return []; }
  return INTEGRATION_TEMPLATES.flatMap((t) => {
    const r = t.postReads;
    return r && (r.host.startsWith('.') ? host.endsWith(r.host) : host === r.host) ? [r] : [];
  });
}

/** Whether a POST only reads, by its connector's rules: a listed path, or a
 *  GraphQL body that runs only queries. Anything unclear is a write, since a
 *  write sent twice is the worse mistake. */
export function isPostRead(rules: PostReads[], url: URL, body: string): boolean {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return rules.some((r) =>
    (r.paths ?? []).some((p) => new RegExp(`^${p}$`).test(path)) ||
    (r.graphql === true && graphqlReadsOnly(body)));
}

/** Whether a GraphQL request body (one operation, or a batch) runs only queries. */
export function graphqlReadsOnly(body: string): boolean {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return false; }
  const ops = Array.isArray(parsed) ? parsed : [parsed];
  return ops.length > 0 && ops.every((op) => {
    const o = op as { query?: unknown; operationName?: unknown } | null;
    return !!o && typeof o.query === 'string' && operationKind(o.query, typeof o.operationName === 'string' ? o.operationName : undefined) === 'query';
  });
}

/** The kind of the operation a GraphQL document runs ('query', 'mutation',
 *  'subscription'), or null when it can't be told which one runs. */
function operationKind(doc: string, name?: string): string | null {
  // Strings and comments can hold any word, so they go first.
  const src = doc.replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|#[^\n]*/g, ' ');
  const ops: Array<{ kind: string; name?: string }> = [];
  let pending: { kind: string; name?: string } | null = null;
  let braces = 0, parens = 0;
  for (const [tok] of src.matchAll(/[{}()]|[A-Za-z_][A-Za-z0-9_]*/g)) {
    if (tok === '(') { parens++; continue; }
    if (tok === ')') { parens--; continue; }
    if (tok === '}') { braces--; continue; }
    if (tok === '{') {
      // A selection at the top level starts an operation: the one named
      // before it, or a query written as just { ... }.
      if (braces === 0 && parens === 0) {
        if (!pending) ops.push({ kind: 'query' });
        else if (pending.kind !== 'fragment') ops.push(pending);
        pending = null;
      }
      braces++;
      continue;
    }
    if (braces !== 0 || parens !== 0) continue;
    if (!pending && ['query', 'mutation', 'subscription', 'fragment'].includes(tok)) pending = { kind: tok };
    else if (pending && pending.name === undefined) pending.name = tok;
  }
  const run = name === undefined ? (ops.length === 1 ? ops[0] : undefined) : ops.find((o) => o.name === name);
  return run?.kind ?? null;
}

// ─── Per agent access ───────────────────────────────────────────────────────

/** How far one team member may use an integration, set on its Access tab.
 *  'read' reaches GET, HEAD and a POST the catalog knows only reads; 'change'
 *  reaches everything. No entry means no access. */
export type IntegrationLevel = 'read' | 'change';

/** One member's integrations, by integration id. */
export interface IntegrationGrants { [integrationId: string]: IntegrationLevel }

interface GrantConfig { agentCapabilities?: { [agentId: string]: { integrations?: IntegrationGrants } } }

/** The level this member holds. Read per call, so a change applies at once.
 *  Research holds no office data (issue #230), whatever is saved. */
export function integrationLevel(cfg: GrantConfig, agentId: string, integrationId: string): IntegrationLevel | undefined {
  if (agentId === RESEARCH_ID) return undefined;
  const grants = cfg.agentCapabilities?.[agentId]?.integrations;
  if (!grants || !Object.prototype.hasOwnProperty.call(grants, integrationId)) return undefined;
  const level = grants[integrationId];
  return level === 'read' || level === 'change' ? level : undefined;
}

/** Whether a member gets the md-integrations tools at spawn. */
export function hasIntegrationTools(cfg: GrantConfig, agentId: string): boolean {
  return Object.keys(cfg.agentCapabilities?.[agentId]?.integrations ?? {}).some((id) => !!integrationLevel(cfg, agentId, id));
}

/** The capabilities with one member's level set, or cleared with null. */
export function withIntegrationLevel<C extends { integrations?: IntegrationGrants }>(
  caps: { [agentId: string]: C } | undefined, agentId: string, integrationId: string, level: IntegrationLevel | null
): { [agentId: string]: C } {
  const cur = caps?.[agentId];
  const integrations = { ...(cur?.integrations ?? {}) };
  if (level) integrations[integrationId] = level; else delete integrations[integrationId];
  return { ...(caps ?? {}), [agentId]: { ...(cur ?? {}), integrations } as C };
}

/** The capabilities with a removed integration gone from everyone, so a new
 *  one saved later under the same id starts with nobody holding it. */
export function withoutIntegration<C extends { integrations?: IntegrationGrants }>(
  caps: { [agentId: string]: C } | undefined, integrationId: string
): { [agentId: string]: C } {
  const next = { ...(caps ?? {}) };
  for (const [agentId, c] of Object.entries(next)) {
    if (!c.integrations?.[integrationId]) continue;
    const integrations = { ...c.integrations };
    delete integrations[integrationId];
    next[agentId] = { ...c, integrations };
  }
  return next;
}

/** What `list_integrations` tells a member: never a key, and the address
 *  without any query or login it was saved with. */
export interface AgentIntegration { id: string; label: string; base_url: string; access: 'read only' | 'can change'; ready: boolean; saved_call?: { purpose: string } }

export function agentIntegrations(
  cfg: GrantConfig, agentId: string,
  records: ReadonlyArray<Pick<IntegrationRecord, 'id' | 'label' | 'baseUrl' | 'authType' | 'enabled' | 'call'> & { hasSecret: boolean }>
): AgentIntegration[] {
  return records.flatMap((r) => {
    const level = integrationLevel(cfg, agentId, r.id);
    if (!level) return [];
    let base = '';
    try { const u = new URL(r.baseUrl); base = u.origin + u.pathname; } catch { /* a bad address shows blank */ }
    return [{ id: r.id, label: r.label, base_url: base, access: level === 'read' ? 'read only' as const : 'can change' as const, ready: r.enabled && (!authTypeNeedsSecret(r.authType) || r.hasSecret), ...(r.call ? { saved_call: { purpose: r.call.purpose } } : {}) }];
  });
}
