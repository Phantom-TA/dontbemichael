/**
 * Places in the app an agent can send the owner to with one click
 * (docs/designs/settings-links-in-replies.md): a Settings section, a group in
 * it, the Add a mailbox form, or a member's Access tab, Email.
 *
 * Agents write them as links, `[Settings, Connections, Mailboxes](dbm:settings/connections/mailboxes)`,
 * and the app also spots the plain words "Settings, Connections, Mailboxes".
 * One table serves the link parser, the word spotter, Settings and main, so a
 * place that is not here (or is hidden in this build) is never a button.
 */

/** Settings sections an agent may name. Voice is left out: it is hidden in
 *  this build (SHOW_VOICE), so its words stay words. */
export const PLACE_SECTIONS = {
  'general': 'General',
  'company-profile': 'Company profile',
  'prerequisites': 'Prerequisites',
  'agents': 'Agents',
  'skills': 'Skills',
  'connections': 'Connections',
  'research-privacy': 'Research & privacy',
  'memory-knowledge': 'Memory & Knowledge'
} as const;

export type PlaceSectionKey = keyof typeof PLACE_SECTIONS;
export type PlaceSection = (typeof PLACE_SECTIONS)[PlaceSectionKey];

/** Groups with an anchor inside a section. Only Mailboxes has a form to open. */
export const PLACE_GROUPS = {
  connections: { 'claude-connectors': 'Claude connectors', 'mailboxes': 'Mailboxes' }
} as const satisfies Partial<Record<PlaceSectionKey, Record<string, string>>>;

export type PlaceGroup = 'claude-connectors' | 'mailboxes';

export type Place =
  | { kind: 'settings'; section: PlaceSection; group?: PlaceGroup; add?: true }
  | { kind: 'member'; agentId: string; card: 'email' };

export const PLACE_SCHEME = 'dbm:';

const groupsOf = (key: PlaceSectionKey): Record<string, string> =>
  (PLACE_GROUPS as Record<string, Record<string, string>>)[key] ?? {};

const sectionKeyOf = (section: PlaceSection): PlaceSectionKey =>
  (Object.keys(PLACE_SECTIONS) as PlaceSectionKey[]).find((k) => PLACE_SECTIONS[k] === section) as PlaceSectionKey;

/** An agent id as the app makes them: letters, digits, dash, underscore. */
const AGENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `dbm:settings/connections/mailboxes`, `dbm:settings/connections/mailboxes/add`,
 *  `dbm:member/<id>/access/email`. Null for anything else, so it shows as words. */
export function parsePlace(href: string | null | undefined): Place | null {
  if (!href || !href.toLowerCase().startsWith(PLACE_SCHEME)) return null;
  const parts = href.slice(PLACE_SCHEME.length).replace(/^\/+/, '').split('/');
  if (parts[0] === 'settings') {
    const key = parts[1] as PlaceSectionKey;
    if (!key || !Object.prototype.hasOwnProperty.call(PLACE_SECTIONS, key)) return null;
    const section = PLACE_SECTIONS[key];
    if (parts.length === 2) return { kind: 'settings', section };
    const group = parts[2];
    if (!Object.prototype.hasOwnProperty.call(groupsOf(key), group)) return null;
    if (parts.length === 3) return { kind: 'settings', section, group: group as PlaceGroup };
    if (parts.length === 4 && parts[3] === 'add' && group === 'mailboxes') return { kind: 'settings', section, group, add: true };
    return null;
  }
  if (parts[0] === 'member' && parts.length === 4 && AGENT_ID.test(parts[1]) && parts[2] === 'access' && parts[3] === 'email') {
    return { kind: 'member', agentId: parts[1], card: 'email' };
  }
  return null;
}

export function placeHref(place: Place): string {
  if (place.kind === 'member') return `${PLACE_SCHEME}member/${place.agentId}/access/${place.card}`;
  const parts = ['settings', sectionKeyOf(place.section)];
  if (place.group) parts.push(place.group);
  if (place.add) parts.push('add');
  return PLACE_SCHEME + parts.join('/');
}

/** The words an agent writes for a place: "Settings, Connections, Mailboxes". */
export function placeWords(place: Extract<Place, { kind: 'settings' }>): string {
  const key = sectionKeyOf(place.section);
  const group = place.group ? groupsOf(key)[place.group] : undefined;
  return ['Settings', place.section, ...(group ? [group] : [])].join(', ');
}

/** The section and group names, longest first, for the word spotter. */
export function placeNames(): { section: PlaceSection; key: PlaceSectionKey; groups: [PlaceGroup, string][] }[] {
  return (Object.keys(PLACE_SECTIONS) as PlaceSectionKey[])
    .map((key) => ({ key, section: PLACE_SECTIONS[key], groups: Object.entries(groupsOf(key)) as [PlaceGroup, string][] }))
    .sort((a, b) => b.section.length - a.section.length);
}

/** The rule Michael follows when he sends the owner somewhere in the app: a
 *  link that opens it, never directions to remember. */
export function placeLinkRule(): string {
  const sections = (Object.keys(PLACE_SECTIONS) as PlaceSectionKey[]).map((k) => {
    const groups = Object.entries(groupsOf(k));
    return `${PLACE_SECTIONS[k]} (${k}${groups.length ? `; groups ${groups.map(([g, name]) => `${name} (${g})`).join(', ')}` : ''})`;
  });
  return 'When you tell the owner to change something in Settings, write the place as a link that opens it, never steps to remember: '
    + '[Settings, Connections, Mailboxes](dbm:settings/connections/mailboxes), or a section alone, [Settings, Agents](dbm:settings/agents). '
    + `The places: ${sections.join('; ')}. A member's Access tab, Email is dbm:member/<their id>/access/email. The link's words may be in the owner's language.`;
}
