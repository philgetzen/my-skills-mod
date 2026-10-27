// `target` is the file a click opens, or the claude:// link for an account skill.
export type Issue = { kind: 'collision' | 'bare' | 'dangling' | 'unmanaged'; text: string }
export type Item = { name: string; target: string; description: string; issues?: Issue[] }
export type Section = { title: string; folders: string[]; items: Item[] }
// `days` counts uses per local date 'YYYY-MM-DD', the last 30 days only.
export type Use = { count: number; lastUsed: number; byWorkspace: Record<string, number>; days?: Record<string, number> }
export type Sort = 'recent' | 'count' | 'name'
export type History = { byName: Record<string, Use>; oldest?: number; importedAt?: number; attempts: number; version?: number }
export type Usage = { since?: number; byName: Record<string, Use> }

declare module 'claude-code' {
  interface PluginState {
    'my-skills': { sections: Section[]; starred: string[]; usage: Usage; history: History; importing: boolean; sort: Sort; collapsed: string[] }
  }
}
