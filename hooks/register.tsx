import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Section } from '../types'

const PANE = 'my-skills'
const sections = atom({ plugin: 'my-skills', key: 'sections' } as const, [])

// Skill folders are often symlinks (skillshare), so accept links as well as dirs.
async function skillNames($: EngineInterface, folder: string): Promise<string[]> {
  if (!(await $.fs.exists(folder))) return []
  const entries = await $.fs.list(folder)
  return entries
    .filter(one => (one.kind === 'dir' || one.isLink) && !one.name.startsWith('.'))
    .map(one => one.name)
}

async function commandNames($: EngineInterface, folder: string): Promise<string[]> {
  if (!(await $.fs.exists(folder))) return []
  const entries = await $.fs.list(folder)
  return entries
    .filter(one => one.name.endsWith('.md'))
    .map(one => `/${one.name.slice(0, -3)}`)
}

async function scan($: EngineInterface, globalSetting: string): Promise<Section[]> {
  const home = (await $.env.get('HOME')) ?? ''
  const root = await $.session.root()

  const globalDir = globalSetting.startsWith('~') ? `${home}${globalSetting.slice(1)}` : globalSetting
  const global = await skillNames($, globalDir)
  const seen = new Set(global)

  const userSkills = (await skillNames($, `${home}/.claude/skills`)).filter(n => !seen.has(n))
  const userCommands = await commandNames($, `${home}/.claude/commands`)

  const projectSkills =
    root === home ? [] : await skillNames($, `${root}/.claude/skills`)
  const projectCommands =
    root === home ? [] : await commandNames($, `${root}/.claude/commands`)

  const sort = (list: string[]) => [...list].sort((a, b) => a.localeCompare(b))
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path)

  return [
    { title: 'Global', folders: [tilde(globalDir)], names: sort(global) },
    {
      title: 'User',
      folders: [tilde(`${home}/.claude/skills`), tilde(`${home}/.claude/commands`)],
      names: [...sort(userSkills), ...sort(userCommands)],
    },
    {
      title: 'Project',
      folders: [tilde(`${root}/.claude`)],
      names: [...sort(projectSkills), ...sort(projectCommands)],
    },
  ]
}

async function refresh($: EngineInterface, globalSetting: string) {
  const next = await scan($, globalSetting)
  await update($, sections, () => next)
}

export const register: Register = (on, options) => {
  const globalDir = String(options.globalSkillsDir ?? '~/.config/skillshare/skills')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'my-skills',
      description: 'Show your skills and commands, by global, user and project',
    })
    await refresh($, globalDir)
    void $.ui.open({ id: PANE, title: 'My skills' })

    return next(e)
  })

  on('command.run', { command: 'my-skills' }, async $ => {
    await refresh($, globalDir)
    await $.ui.open({ id: PANE, title: 'My skills' })

    return { text: 'My skills pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, sections)

    return (
      <Box flexDirection="column">
        <Button key="refresh" onPress={() => refresh($, globalDir)}>Refresh</Button>
        {list.map(section => (
          <Box key={section.title} flexDirection="column" marginTop={1}>
            <Text bold>
              {section.title} ({section.names.length})
            </Text>
            <Text dimColor>{section.folders.join(', ')}</Text>
            {section.names.length === 0 && <Text dimColor>none</Text>}
            {section.names.map(name => (
              <Text key={`${section.title}:${name}`}>{name}</Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
