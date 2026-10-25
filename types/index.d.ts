export type Item = { name: string; description: string }
export type Section = { title: string; folders: string[]; items: Item[] }

declare module 'claude-code' {
  interface PluginState {
    'my-skills': { sections: Section[] }
  }
}
