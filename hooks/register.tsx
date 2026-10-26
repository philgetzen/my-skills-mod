import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, Section, Usage } from '../types'

const PANE = 'my-skills'
const sections = atom({ plugin: 'my-skills', key: 'sections' } as const, [])
// The targets of the starred items: the session's copy, kept in `$.store` so the
// stars outlive the session.
const starred = atom({ plugin: 'my-skills', key: 'starred' } as const, [])
const STARRED_KEY = 'starred'
const usage = atom({ plugin: 'my-skills', key: 'usage' } as const, { byName: {} })
const USAGE_KEY = 'usage'
const DANGLING = 'link points nowhere'
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

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

// True when `path` is a regular file that, every link followed, stays under
// `root` (already resolved). Guards the Project folders, which come from
// whatever repository the session opened: a SKILL.md there that links to
// ~/.ssh/id_ed25519 must not be read or opened.
async function isInside($: EngineInterface, path: string, root: string): Promise<boolean> {
  try {
    const found = await $.fs.stat(path, { resolve: true })
    return found.kind === 'file' && found.realPath !== undefined && found.realPath.startsWith(`${root}/`)
  } catch {
    return false
  }
}

// Skill folders are often symlinks (skillshare), so accept links as well as dirs.
// With `confineTo`, a skill whose file resolves outside that root is left out.
async function skills($: EngineInterface, folder: string, confineTo?: string): Promise<Item[]> {
  if (!(await $.fs.exists(folder))) return []
  const entries = await $.fs.list(folder)
  const found = await Promise.all(
    entries
    .filter(one => (one.kind === 'dir' || one.isLink) && !one.name.startsWith('.'))
    .map(async entry => {
      const name = entry.name
      const target = `${folder}/${name}/SKILL.md`
      if (!(await $.fs.exists(target))) {
        return entry.isLink
          ? { name, target: `${folder}/${name}`, description: '', health: [DANGLING] }
          : undefined
      }
      if (confineTo !== undefined && !(await isInside($, target, confineTo))) return undefined
      return { name, target, description: await describe($, target) }
    }),
  )
  return found.filter((one): one is Item => one !== undefined)
}

type SyncedSkill = { skillId: string; name: string; description?: string }

// Skills uploaded to the claude.ai account, from the manifest Claude Code syncs
// into ~/.claude/skills/synced/<bucket>/. Anthropic's own skills there carry a
// plain id ("pdf"); the person's carry an account id ("skill_..."), which is
// also what their Customize page is addressed by.
async function accountSkills($: EngineInterface, folder: string): Promise<Item[]> {
  if (!(await $.fs.exists(folder))) return []
  const byId = new Map<string, Item>()
  for (const bucket of await $.fs.list(folder)) {
    if (bucket.kind !== 'dir') continue
    try {
      const manifest = JSON.parse(await $.fs.read(`${folder}/${bucket.name}/manifest.json`))
      for (const skill of (manifest.skills ?? []) as SyncedSkill[]) {
        if (typeof skill.skillId !== 'string' || !/^skill_[A-Za-z0-9]+$/.test(skill.skillId)) continue
        byId.set(skill.skillId, {
          name: skill.name,
          description: skill.description ?? '',
          target: `claude://claude.ai/customize/skills/yours/id/${skill.skillId}`,
        })
      }
    } catch {
      // A bucket mid-sync or without a manifest lists nothing.
    }
  }
  return [...byId.values()]
}

async function commands($: EngineInterface, folder: string, confineTo?: string): Promise<Item[]> {
  if (!(await $.fs.exists(folder))) return []
  const entries = await $.fs.list(folder)
  const found = await Promise.all(
    entries
      .filter(one => one.name.endsWith('.md'))
      .map(async one => {
        const target = `${folder}/${one.name}`
        if (confineTo !== undefined && !(await isInside($, target, confineTo))) return undefined
        return { name: `/${one.name.slice(0, -3)}`, target, description: await describe($, target) }
      }),
  )
  return found.filter((one): one is Item => one !== undefined)
}

async function scan($: EngineInterface, globalSetting: string): Promise<Section[]> {
  const home = (await $.env.get('HOME')) ?? ''
  const root = await $.session.root()

  const globalDir = globalSetting.startsWith('~') ? `${home}${globalSetting.slice(1)}` : globalSetting
  const global = await skills($, globalDir)
  const seen = new Set(global.map(one => one.name))

  const userSkills = (await skills($, `${home}/.claude/skills`)).filter(one => !seen.has(one.name))
  const userCommands = await commands($, `${home}/.claude/commands`)

  const realRoot = await $.fs
    .stat(root, { resolve: true })
    .then(found => found.realPath)
    .catch(() => undefined)
  const isProject = root !== home && realRoot !== undefined
  const projectSkills = isProject ? await skills($, `${root}/.claude/skills`, realRoot) : []
  const projectCommands = isProject ? await commands($, `${root}/.claude/commands`, realRoot) : []

  const account = await accountSkills($, `${home}/.claude/skills/synced`)
  const user = [...userSkills, ...userCommands]
  const project = [...projectSkills, ...projectCommands]

  const lists: [string, Item[]][] = [
    ['Global', global],
    ['User', user],
    ['Project', project],
    ['Account', account],
  ]
  for (const [title, items] of lists) {
    for (const item of items) {
      if (title !== 'Account' && item.description === '' && !item.health?.includes(DANGLING)) {
        item.health = [...(item.health ?? []), 'no description']
      }
    }
  }
  if (global.length > 0) {
    for (const item of userSkills) {
      if (!item.health?.includes(DANGLING)) {
        item.health = [...(item.health ?? []), 'not in Global (unmanaged)']
      }
    }
  }
  const titlesByName = new Map<string, string[]>()
  for (const [title, items] of lists) {
    for (const item of items) {
      const name = item.name.replace(/^\//, '')
      titlesByName.set(name, [...(titlesByName.get(name) ?? []), title])
    }
  }
  for (const [title, items] of lists) {
    for (const item of items) {
      const other = (titlesByName.get(item.name.replace(/^\//, '')) ?? []).filter(one => one !== title)
      if (other.length > 0) item.health = [...(item.health ?? []), `also in ${other.join(', ')}`]
    }
  }

  const sort = (list: Item[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path)

  return [
    { title: 'Global', folders: [tilde(globalDir)], items: sort(global) },
    {
      title: 'User',
      folders: [tilde(`${home}/.claude/skills`), tilde(`${home}/.claude/commands`)],
      items: sort(user),
    },
    {
      title: 'Project',
      folders: [tilde(`${root}/.claude`)],
      items: sort(project),
    },
    { title: 'Account', folders: ['claude.ai, Customize › Skills'], items: sort(account) },
  ]
}

// A file opens in the default text editor (`open -t` on macOS, `xdg-open` on
// Linux); a claude:// link opens in the desktop app.
async function openTarget($: EngineInterface, target: string) {
  const isLink = target.startsWith('claude://')
  const openers = isLink ? [['open', target], ['xdg-open', target]] : [['open', '-t', target], ['xdg-open', target]]
  for (const argv of openers) {
    try {
      if ((await $.process.run(argv)).exitCode === 0) return
    } catch {
      // Not on this platform; try the next opener.
    }
  }
  $.ui.toast(`Could not open ${target}`)
}

async function refresh($: EngineInterface, globalSetting: string) {
  const next = await scan($, globalSetting)
  await update($, sections, () => next)
  await loadStars($)
  await loadUsage($)
}

async function savedStars($: EngineInterface): Promise<string[]> {
  const saved = await $.store.get(STARRED_KEY)
  return Array.isArray(saved) ? saved.filter((one): one is string => typeof one === 'string') : []
}

async function loadStars($: EngineInterface) {
  const list = await savedStars($)
  await update($, starred, () => list)
}

async function savedUsage($: EngineInterface): Promise<Usage> {
  const saved = await $.store.get(USAGE_KEY)
  const object = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  const number = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
  if (!object(saved) || !object(saved.byName)) return { byName: {} }
  // A malformed entry is dropped alone, so the next write keeps every other count.
  const byName: Usage['byName'] = {}
  for (const [name, use] of Object.entries(saved.byName)) {
    if (object(use) && number(use.count) && number(use.lastUsed) && object(use.byWorkspace) &&
      Object.values(use.byWorkspace).every(number)) byName[name] = use as Usage['byName'][string]
  }
  return number(saved.since) ? { since: saved.since, byName } : { byName }
}

async function loadUsage($: EngineInterface) {
  const saved = await savedUsage($)
  await update($, usage, () => saved)
}

async function record($: EngineInterface, skill: string) {
  const list = await read($, sections)
  if (!list.some(section => section.items.some(item => item.name.replace(/^\//, '') === skill))) return
  const now = await $.clock.now()
  const root = await $.session.root()
  const saved = await savedUsage($)
  const previous = Object.hasOwn(saved.byName, skill) ? saved.byName[skill] : undefined
  const next: Usage = {
    since: saved.since ?? now,
    byName: {
      ...saved.byName,
      [skill]: {
        count: (previous?.count ?? 0) + 1,
        lastUsed: now,
        byWorkspace: {
          ...previous?.byWorkspace,
          [root]: ((previous && Object.hasOwn(previous.byWorkspace, root) ? previous.byWorkspace[root] : 0) ?? 0) + 1,
        },
      },
    },
  }
  await $.store.set(USAGE_KEY, next)
  await update($, usage, () => next)
}

// Every thread keeps its own copy of the stars, so a star starts from what is
// saved now, not from this copy: another thread's stars are kept.
async function setStar($: EngineInterface, target: string, isStarred: boolean) {
  const others = (await savedStars($)).filter(one => one !== target)
  const next = isStarred ? [...others, target] : others
  await $.store.set(STARRED_KEY, next)
  await update($, starred, () => next)
}

export const register: Register = (on, options) => {
  const globalDir = String(options.globalSkillsDir ?? '~/.config/skillshare/skills')

  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    try { await record($, e.skill) } catch {}
    return result
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'my-skills',
      description: 'Show your skills and commands: starred, global, user, project, account',
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
    const stars = new Set(await read($, starred))
    const saved = await read($, usage)
    const now = await $.clock.now()
    const useOf = (item: Item) => {
      const name = item.name.replace(/^\//, '')
      return Object.hasOwn(saved.byName, name) ? saved.byName[name] : undefined
    }
    const starredItems = list
      .flatMap(section => section.items)
      .filter(item => stars.has(item.target))
      .sort((a, b) => (useOf(b)?.lastUsed ?? -Infinity) - (useOf(a)?.lastUsed ?? -Infinity) || a.name.localeCompare(b.name))
    const root = await $.session.root()
    const inRepo = list
      .flatMap(section => section.items)
      .filter(item => (useOf(item)?.byWorkspace[root] ?? 0) > 0)
      .sort((a, b) => (useOf(b)?.byWorkspace[root] ?? 0) - (useOf(a)?.byWorkspace[root] ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 5)
    const total = inRepo.reduce((sum, item) => sum + (useOf(item)?.byWorkspace[root] ?? 0), 0)
    const shown: Section[] = [
      ...(total >= 5 ? [{ title: 'Suggested for this repo', folders: [`Most used in ${root}`], items: inRepo }] : []),
      { title: 'Starred', folders: ['Click ☆ beside a name to star it'], items: starredItems },
      ...list,
    ]

    return (
      <Box flexDirection="column-reverse">
        <Box height={8} />
        {[...shown].reverse().map(section => (
          <Box key={section.title} flexDirection="column-reverse" marginTop={1}>
            {[...section.items].reverse().map(item => {
              const use = useOf(item)
              const age = use ? now - use.lastUsed : 0
              const ago = age < HOUR ? 'just now' : age < DAY ? `${Math.floor(age / HOUR)}h ago` : `${Math.floor(age / DAY)}d ago`
              const stale = use ? age >= 30 * DAY : saved.since !== undefined && now - saved.since >= 30 * DAY
              return (
                <Box key={`${section.title}:${item.target}`}>
                  <Button
                    key={`open:${section.title}:${item.target}`}
                    plain
                    dimColor={stale}
                    hover={{ bold: true, color: 'suggestion' }}
                    // A link that points nowhere may still lead to a file outside every
                    // guarded folder (a repo can aim one at ~/.ssh), so it opens nothing.
                    onPress={() => item.health?.includes(DANGLING) ? undefined : openTarget($, item.target)}
                  >
                    {item.name}
                  </Button>
                  {/* The star sits after the name, so revealing it moves nothing. A
                      starred item keeps its ★ in view; an unstarred one shows ☆
                      only while its row is hovered. (A desktop draws every Button
                      with native padding, so a star before the name could not sit
                      any tighter than that.) */}
                  <Box
                    display={stars.has(item.target) ? 'flex' : 'none'}
                    hover={stars.has(item.target) ? undefined : { display: 'flex' }}
                  >
                    <Button
                      key={`star:${section.title}:${item.target}`}
                      plain
                      onPress={() => setStar($, item.target, !stars.has(item.target))}
                    >
                      {stars.has(item.target) ? '★' : '☆'}
                    </Button>
                  </Box>
                  {item.health && <Text color="warning">!</Text>}
                  {use && <Text dimColor>{use.count}× · {ago}</Text>}
                  <Box
                    position="absolute"
                    top={1}
                    marginTop={0.5}
                    left={2}
                    right={0}
                    display="none"
                    hover={{ display: 'flex' }}
                    borderStyle="round"
                    borderColor="suggestion"
                    backgroundColor="inverseText"
                    paddingX={1}
                  >
                    <Text>{[item.description, ...(item.health ?? [])].filter(Boolean).join(' · ') || 'No description.'}</Text>
                  </Box>
                </Box>
              )
            })}
            {section.items.length === 0 && <Text dimColor>none</Text>}
            <Text dimColor>{section.folders.join(', ')}</Text>
            <Box>
              <Text bold>{section.title} ({section.items.length})</Text>
              {section.items.filter(item => item.health?.length).length > 0 && (
                <Text color="warning">{section.items.filter(item => item.health?.length).length} health</Text>
              )}
            </Box>
          </Box>
        ))}
        <Text dimColor>
          {saved.since === undefined ? 'No uses recorded yet' : `Since ${new Date(saved.since).toLocaleDateString()} · counts every expansion, subagent preloads included`}
        </Text>
        <Button key="refresh" onPress={() => refresh($, globalDir)}>Refresh</Button>
      </Box>
    )
  })
}
