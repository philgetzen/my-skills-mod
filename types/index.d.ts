export type Section = { title: string; folders: string[]; names: string[] }

declare module 'claude-code' {
  interface PluginState {
    'my-skills': { sections: Section[] }
  }
}
