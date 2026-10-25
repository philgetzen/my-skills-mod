import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, Section } from '../types'

const PANE = 'my-skills'
const sections = atom({ plugin: 'my-skills', key: 'sections' } as const, [])

// The `description:` in a file's frontmatter, folded scalars (`>`, `|`) included.
function frontmatterDescription(text: string): string {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match?.[1]) return ''
  const lines = match[1].split(/\r?\n/)
  const at = lines.findIndex(line => /^description:/.test(line))
  if (at < 0) return ''
  let value = (lines[at] ?? '').replace(/^description:\s*/, '')
  if (/^[>|][-+]?$/.test(value)) {
    const rest: string[] = []
    for (const line of lines.slice(at + 1)) {
      if (!/^\s+/.test(line)) break
      rest.push(line.trim())
    }
    value = rest.join(' ')
  }
  return value.replace(/^["']|["']$/g, '').trim()
}

async function describe($: EngineInterface, path: string): Promise<string> {
  try {
    return frontmatterDescription(await $.fs.read(path))
  } catch {
    return ''
  }
}

// Skill folders are often symlinks (skillshare), so accept links as well as dirs.
async function skills($: EngineInterface, folder: string): Promise<Item[]> {
  if (!(await $.fs.exists(folder))) return []
  const entries = await $.fs.list(folder)
  const names = entries
    .filter(one => (one.kind === 'dir' || one.isLink) && !one.name.startsWith('.'))
    .map(one => one.name)
  return Promise.all(
    names.map(async name => ({ name, description: await describe($, `${folder}/${name}/SKILL.md`) })),
  )
}

async function commands($: EngineInterface, folder: string): Promise<Item[]> {
  if (!(await $.fs.exists(folder))) return []
  const entries = await $.fs.list(folder)
  return Promise.all(
    entries
      .filter(one => one.name.endsWith('.md'))
      .map(async one => ({
        name: `/${one.name.slice(0, -3)}`,
        description: await describe($, `${folder}/${one.name}`),
      })),
  )
}

async function scan($: EngineInterface, globalSetting: string): Promise<Section[]> {
  const home = (await $.env.get('HOME')) ?? ''
  const root = await $.session.root()

  const globalDir = globalSetting.startsWith('~') ? `${home}${globalSetting.slice(1)}` : globalSetting
  const global = await skills($, globalDir)
  const seen = new Set(global.map(one => one.name))

  const userSkills = (await skills($, `${home}/.claude/skills`)).filter(one => !seen.has(one.name))
  const userCommands = await commands($, `${home}/.claude/commands`)

  const projectSkills =
    root === home ? [] : await skills($, `${root}/.claude/skills`)
  const projectCommands =
    root === home ? [] : await commands($, `${root}/.claude/commands`)

  const sort = (list: Item[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path)

  return [
    { title: 'Global', folders: [tilde(globalDir)], items: sort(global) },
    {
      title: 'User',
      folders: [tilde(`${home}/.claude/skills`), tilde(`${home}/.claude/commands`)],
      items: [...sort(userSkills), ...sort(userCommands)],
    },
    {
      title: 'Project',
      folders: [tilde(`${root}/.claude`)],
      items: [...sort(projectSkills), ...sort(projectCommands)],
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

  // A floating card is painted over whatever comes before it in the tree, so each
  // list is written bottom-up and laid out with column-reverse: the rows a card
  // drops over come earlier in the tree than the card itself. The spacer at the
  // end leaves the last row's card room to show inside the pane.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, sections)

    return (
      <Box flexDirection="column-reverse">
        <Box height={8} />
        {[...list].reverse().map(section => (
          <Box key={section.title} flexDirection="column-reverse" marginTop={1}>
            {[...section.items].reverse().map(item => (
              <Box key={`${section.title}:${item.name}`}>
                <Text hover={{ bold: true, color: 'suggestion' }} wrap="truncate-end">
                  {item.name}
                </Text>
                <Box
                  position="absolute"
                  top={1}
                  left={2}
                  right={0}
                  display="none"
                  hover={{ display: 'flex' }}
                  borderStyle="round"
                  borderColor="suggestion"
                  backgroundColor="inverseText"
                  paddingX={1}
                >
                  <Text>{item.description || 'No description.'}</Text>
                </Box>
              </Box>
            ))}
            {section.items.length === 0 && <Text dimColor>none</Text>}
            <Text dimColor>{section.folders.join(', ')}</Text>
            <Text bold>
              {section.title} ({section.items.length})
            </Text>
          </Box>
        ))}
        <Button key="refresh" onPress={() => refresh($, globalDir)}>Refresh</Button>
      </Box>
    )
  })
}
