// `target` is the file a click opens, or the claude:// link for an account skill.
export type Item = { name: string; target: string; description: string; health?: string[] }
export type Section = { title: string; folders: string[]; items: Item[] }
export type Use = { count: number; lastUsed: number; byWorkspace: Record<string, number> }
export type Sort = 'recent' | 'count' | 'name'
export type History = { byName: Record<string, Use>; oldest?: number; importedAt?: number; attempts: number }
export type Usage = { since?: number; byName: Record<string, Use> }

declare module 'claude-code' {
  interface PluginState {
    'my-skills': { sections: Section[]; starred: string[]; usage: Usage; history: History; importing: boolean; sort: Sort }
  }
}
