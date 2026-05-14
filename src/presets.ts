// Preset = curated tag bundle for narrowing the tool surface.
// `all` is a sentinel — no tag filter applied.
// `readonly` is also a sentinel — all tags, GET only.

export type PresetSpec =
  | { kind: 'all' }
  | { kind: 'readonly' }
  | { kind: 'tags'; tags: string[] };

export const PRESETS: Record<string, PresetSpec> = {
  all: { kind: 'all' },
  readonly: { kind: 'readonly' },
  core: {
    kind: 'tags',
    tags: [
      'API Info',
      'Companies',
      'Articles',
      'Assets',
      'Asset Layouts',
      'Asset Passwords',
      'Users',
      'Folders',
      'Relations',
      'Lists',
    ],
  },
  kb: {
    kind: 'tags',
    tags: [
      'Articles',
      'Folders',
      'Companies',
      'Users',
      'Photos',
      'Public Photos',
      'Uploads',
      'Relations',
    ],
  },
  assets: {
    kind: 'tags',
    tags: [
      'Assets',
      'Asset Layouts',
      'Asset Passwords',
      'Companies',
      'Lists',
      'Flags',
      'Flag Types',
      'Rack Storages',
      'Rack Storage Items',
      'Relations',
    ],
  },
  passwords: {
    kind: 'tags',
    tags: ['Asset Passwords', 'Password Folders', 'Companies', 'Asset Layouts', 'Users'],
  },
  ipam: {
    kind: 'tags',
    tags: ['Networks', 'IP Addresses', 'VLANs', 'VLAN Zones', 'Companies', 'Relations'],
  },
  processes: {
    kind: 'tags',
    tags: ['Procedures', 'Procedure Tasks', 'Companies', 'Assets', 'Users', 'Relations'],
  },
  admin: {
    kind: 'tags',
    tags: [
      'API Info',
      'Users',
      'Groups',
      'Activity Logs',
      'Flag Types',
      'Flags',
      'Lists',
      'Matchers',
      'Expirations',
      'Exports',
      'S3 Exports',
      'Magic Dash',
      'Cards',
    ],
  },
};

export function listPresets(): string[] {
  return Object.keys(PRESETS).sort();
}

export function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}
