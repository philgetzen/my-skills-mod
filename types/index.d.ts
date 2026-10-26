// `target` is the file a click opens, or the claude:// link for an account skill.
export type Item = { name: string; target: string; description: string }
export type Section = { title: string; folders: string[]; items: Item[] }

declare module 'claude-code' {
  interface PluginState {
    'my-skills': { sections: Section[]; starred: string[] }
  }
}
