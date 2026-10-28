// `target` is the file a click opens, or the claude:// link for an account skill.
export type Issue = { kind: 'collision' | 'bare' | 'dangling' | 'unmanaged'; text: string }
export type Item = { name: string; target: string; description: string; issues?: Issue[] }
export type Section = { title: string; folders: string[]; items: Item[] }
// `days` counts uses per local date 'YYYY-MM-DD', the last 30 days only.
// `first` is when the live count of a name began, when that was after `since`.
export type Use = { count: number; lastUsed: number; byWorkspace: Record<string, number>; days?: Record<string, number>; first?: number }
export type Sort = 'recent' | 'count' | 'name'
export type History = { byName: Record<string, Use>; oldest?: number; importedAt?: number; attempts: number; version?: number }
export type Usage = { since?: number; byName: Record<string, Use> }
export type Source = 'Global' | 'User' | 'Project' | 'Account' | 'Plugins'
// The skill the detail view shows: its name without the slash, and the copy that was pressed.
export type View = { name: string; target: string } | null

declare module 'claude-code' {
  interface PluginState {
    'my-skills': {
      sections: Section[]; starred: string[]; usage: Usage; history: History; importing: boolean; sort: Sort; collapsed: string[]
      // View state: `scope` (the All skills chip) is saved in `$.store` like `sort`; the rest lasts the session.
      view: View; query: string; searchOpen: boolean; scope: Source; showAll: boolean; showIdle: boolean
      // The detail view's collision card: the target of the copy picked to keep, and of the copy awaiting Confirm.
      keep: string | null; confirming: string | null
    }
  }
}
