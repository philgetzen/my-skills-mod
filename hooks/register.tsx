import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { History, Item, Section, Sort, Usage, Use } from '../types'

const PANE = 'my-skills'
const sections = atom({ plugin: 'my-skills', key: 'sections' } as const, [])
// The targets of the starred items: the session's copy, kept in `$.store` so the
// stars outlive the session.
const starred = atom({ plugin: 'my-skills', key: 'starred' } as const, [])
const STARRED_KEY = 'starred'
const usage = atom({ plugin: 'my-skills', key: 'usage' } as const, { byName: {} })
const USAGE_KEY = 'usage'
const history = atom({ plugin: 'my-skills', key: 'history' } as const, { byName: {}, attempts: 0 })
const HISTORY_KEY = 'history'
const importing = atom({ plugin: 'my-skills', key: 'importing' } as const, false)
const READ_CAP = 4 * 1024 * 1024
const IMPORT_DELAY = 2000
const BOUNDARY = 5 * 60 * 1000
const WORKTREE = /\/\.claude\/worktrees\/[^/]+(\/.*)?$/
const sort = atom({ plugin: 'my-skills', key: 'sort' } as const, 'recent')
const SORT_KEY = 'sort'
// The titles of the collapsed sections, kept in `$.store` like the stars.
const collapsed = atom({ plugin: 'my-skills', key: 'collapsed' } as const, [])
const COLLAPSED_KEY = 'collapsed'
// Each flag says what is wrong and what to do about it, shown first in the hover card.
const DANGLING = "Broken link: this entry points to something that isn't a skill folder. Delete the link, or point it at the skill's folder."
const BARE = "No description: Claude can't tell when to use it. Add a description: line to the top of its file."
const UNMANAGED = "Not in your Global folder: skillshare doesn't track it, so your other agents don't get it. Run skillshare collect claude to move it there, or delete it if it's a leftover."
const clash = (name: string, other: string[]) =>
  `Same name in ${other.join(' and ')}: both answer to /${name}, so the wrong one may load. Rename or remove one.`
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
        item.health = [...(item.health ?? []), BARE]
      }
    }
  }
  if (global.length > 0) {
    for (const item of userSkills) {
      if (!item.health?.includes(DANGLING)) {
        item.health = [...(item.health ?? []), UNMANAGED]
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
      const name = item.name.replace(/^\//, '')
      const other = (titlesByName.get(name) ?? []).filter(one => one !== title)
      if (other.length > 0) item.health = [...(item.health ?? []), clash(name, other)]
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
  const imported = await savedHistory($)
  await update($, history, () => imported)
  const order = await $.store.get(SORT_KEY)
  await update($, sort, () => order === 'count' || order === 'name' ? order : 'recent')
  const closed = await savedCollapsed($)
  await update($, collapsed, () => closed)
}

async function savedCollapsed($: EngineInterface): Promise<string[]> {
  const saved = await $.store.get(COLLAPSED_KEY)
  return Array.isArray(saved) ? saved.filter((one): one is string => typeof one === 'string') : []
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

async function savedHistory($: EngineInterface): Promise<History> {
  const saved = await $.store.get(HISTORY_KEY)
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return { byName: {}, attempts: 0 }
  const value = saved as Record<string, unknown>
  return {
    byName: typeof value.byName === 'object' && value.byName !== null && !Array.isArray(value.byName)
      ? value.byName as Record<string, Use> : {},
    attempts: typeof value.attempts === 'number' && Number.isFinite(value.attempts) && value.attempts >= 0 ? value.attempts : 0,
    ...(typeof value.oldest === 'number' && Number.isFinite(value.oldest) ? { oldest: value.oldest } : {}),
    ...(typeof value.importedAt === 'number' && Number.isFinite(value.importedAt) ? { importedAt: value.importedAt } : {}),
  }
}

async function importHistory($: EngineInterface) {
  const fail = async (error: unknown) => {
    try {
      const saved = await savedHistory($)
      if (saved.importedAt === undefined) await $.store.set(HISTORY_KEY, { ...saved, attempts: saved.attempts + 1 })
    } catch {}
    try { await update($, importing, () => false) } catch {}
    try { $.ui.log(`my-skills: history import failed: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' }) } catch {}
  }
  try {
    const startedAt = await $.clock.now()
    const home = (await $.env.get('HOME')) ?? ''
    const projects = `${home}/.claude/projects`
    const listed = new Set((await read($, sections)).flatMap(section => section.items.map(item => item.name.replace(/^\//, ''))))
    const cutoff = ((await savedUsage($)).since ?? startedAt) - BOUNDARY
    const found: Record<string, Use> = {}
    const keys = new Map<string, string>()
    let files = 0, grepped = 0, skipped = 0, uses = 0, oldest = Infinity
    const finish = async () => {
      const now = await $.clock.now()
      const saved = await savedHistory($)
      if (saved.importedAt === undefined) {
        const next: History = { byName: found, importedAt: now, attempts: saved.attempts,
          ...(oldest === Infinity ? {} : { oldest }) }
        await $.store.set(HISTORY_KEY, next)
        await update($, history, () => next)
      } else {
        await update($, history, () => saved)
      }
      await update($, importing, () => false)
      $.ui.log(`my-skills: imported ${uses} uses from ${files} transcripts, ${grepped} over 4 MiB read with grep, ${skipped} skipped, ${now - startedAt} ms`, { to: 'debug' })
    }
    const scanFolder = async (folder: string) => {
      for (const entry of await $.fs.list(`${projects}/${folder}`)) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.jsonl')) continue
        const path = `${projects}/${folder}/${entry.name}`
        let text: string
        try {
          if (entry.size > READ_CAP) {
            const result = await $.process.run(['grep', '-h', '-F', '-e', '"name":"Skill"', '-e', '<command-name>', path], { timeoutMs: 60000 })
            if (result.isStdoutTruncated || (result.exitCode !== 0 && result.exitCode !== 1)) { skipped++; continue }
            grepped++
            text = result.exitCode === 1 ? '' : result.stdout
          } else {
            text = await $.fs.read(path)
            files++
          }
        } catch { skipped++; continue }
        for (const line of text.split('\n')) {
          if (!line.includes('"name":"Skill"') && !line.includes('<command-name>')) continue
          let row
          try { row = JSON.parse(line) } catch { continue }
          if (row === null || typeof row !== 'object') continue
          const at = Date.parse(row.timestamp)
          if (!(at < cutoff) || typeof row.cwd !== 'string') continue
          const names: string[] = []
          if (row.type === 'assistant' && Array.isArray(row.message?.content)) {
            for (const block of row.message.content) {
              if (block?.type === 'tool_use' && block.name === 'Skill' && typeof block.input?.skill === 'string') names.push(block.input.skill)
            }
          } else if (row.type === 'user') {
            const content = row.message?.content
            const text = typeof content === 'string' ? content : Array.isArray(content) ? content[0]?.text : undefined
            const match = typeof text === 'string' ? text.match(/<command-name>\/?([^<]+)<\/command-name>/) : undefined
            if (match?.[1]) names.push(match[1])
          }
          for (const raw of names) {
            const name = raw.replace(/^\//, '')
            if (!listed.has(name)) continue
            const key = keys.get(row.cwd) ?? await mainRepo($, row.cwd)
            keys.set(row.cwd, key)
            const previous = Object.hasOwn(found, name) ? found[name] : undefined
            found[name] = {
              count: (previous?.count ?? 0) + 1,
              lastUsed: Math.max(previous?.lastUsed ?? -Infinity, at),
              byWorkspace: { ...previous?.byWorkspace,
                [key]: ((previous && Object.hasOwn(previous.byWorkspace, key) ? previous.byWorkspace[key] : 0) ?? 0) + 1 },
            }
            uses++
            oldest = Math.min(oldest, at)
          }
        }
      }
    }
    const folders = await $.fs.exists(projects) ? (await $.fs.list(projects)).filter(one => one.kind === 'dir') : []
    const step = (i: number) => {
      $.clock.after(0, () => void (async () => {
        try {
          await scanFolder(folders[i]!.name)
          if (i + 1 < folders.length) step(i + 1)
          else await finish()
        } catch (error) { await fail(error) }
      })())
    }
    if (folders.length === 0) await finish()
    else step(0)
  } catch (error) { await fail(error) }
}

async function mainRepo($: EngineInterface, root: string): Promise<string> {
  try {
    const git = `${root}/.git`
    if (!(await $.fs.exists(git))) return root.replace(WORKTREE, '')
    if ((await $.fs.stat(git)).kind !== 'file') return root
    const match = (await $.fs.read(git)).match(/^gitdir: (\/[^\r\n]*?)\/\.git\/worktrees\/[^/\r\n]+\r?\n?$/)
    return match?.[1] ?? root
  } catch {
    return root
  }
}

async function record($: EngineInterface, skill: string) {
  const list = await read($, sections)
  if (!list.some(section => section.items.some(item => item.name.replace(/^\//, '') === skill))) return
  const now = await $.clock.now()
  const root = await mainRepo($, await $.session.root())
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

// Starts from what is saved now, like a star, so another thread's choices are kept.
async function setCollapsed($: EngineInterface, title: string, isCollapsed: boolean) {
  const others = (await savedCollapsed($)).filter(one => one !== title)
  const next = isCollapsed ? [...others, title] : others
  await $.store.set(COLLAPSED_KEY, next)
  await update($, collapsed, () => next)
}

async function setSort($: EngineInterface, order: Sort) {
  if (await $.store.get(SORT_KEY) !== order) await $.store.set(SORT_KEY, order)
  await update($, sort, () => order)
}

export const register: Register = (on, options) => {
  let importScheduled = false
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
    // `importing` is shared state and outlives a reload, which cancels this load's
    // timers; whether an import is scheduled is this load's own business.
    const saved = await read($, history)
    if (saved.importedAt === undefined && saved.attempts < 2 && !importScheduled) {
      importScheduled = true
      await update($, importing, () => true)
      $.clock.after(IMPORT_DELAY, () => void importHistory($))
    } else if (!importScheduled) {
      await update($, importing, () => false)
    }
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
  // end leaves the last row's card room to show inside the pane: a card that
  // sticks out past it grows the scroll area, the pane jumps, the hover drops
  // and the card flickers, so it is sized for a card with flags.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, sections)
    const stars = new Set(await read($, starred))
    const saved = await read($, usage)
    const imported = await read($, history)
    const busy = await read($, importing)
    const since = Math.min(saved.since ?? Infinity, imported.oldest ?? Infinity)
    const order = await read($, sort)
    const closed = new Set(await read($, collapsed))
    const home = (await $.env.get('HOME')) ?? ''
    const now = await $.clock.now()
    const useOf = (item: Item) => {
      const name = item.name.replace(/^\//, '')
      const live = Object.hasOwn(saved.byName, name) ? saved.byName[name] : undefined
      const past = Object.hasOwn(imported.byName, name) ? imported.byName[name] : undefined
      if (!live) return past
      if (!past) return live
      const byWorkspace = { ...live.byWorkspace }
      for (const [key, count] of Object.entries(past.byWorkspace)) byWorkspace[key] = (Object.hasOwn(byWorkspace, key) ? byWorkspace[key]! : 0) + count
      return { count: live.count + past.count, lastUsed: Math.max(live.lastUsed, past.lastUsed), byWorkspace }
    }
    const compare = (a: Item, b: Item) => {
      const metric = order === 'recent' ? 'lastUsed' : 'count'
      return (order === 'name' ? 0 : (useOf(b)?.[metric] ?? -Infinity) - (useOf(a)?.[metric] ?? -Infinity)) || a.name.localeCompare(b.name)
    }
    const starredItems = list
      .flatMap(section => section.items)
      .filter(item => stars.has(item.target))
    const root = await mainRepo($, await $.session.root())
    const inRepo = list
      .flatMap(section => section.items)
      .filter(item => (useOf(item)?.byWorkspace[root] ?? 0) > 0)
      .sort((a, b) => (useOf(b)?.byWorkspace[root] ?? 0) - (useOf(a)?.byWorkspace[root] ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 5)
    const total = inRepo.reduce((sum, item) => sum + (useOf(item)?.byWorkspace[root] ?? 0), 0)
    const shown: Section[] = [
      ...(total >= 5 ? [{ title: 'Most used here', folders: [`Most used in ${root}`], items: inRepo }] : []),
      { title: 'Starred', folders: ['Click ☆ beside a name to star it'], items: starredItems },
      ...list,
    ]

    return (
      <Box flexDirection="column-reverse">
        <Box height={16} />
        {/* One footer line, a blank line below the last section. While the import
            runs its date would be wrong, so it says what is happening instead. */}
        <Box marginTop={1}>
          <Text dimColor>
            {busy
              ? 'Importing history…'
              : since === Infinity
                ? 'No uses counted yet'
                : `Counts since ${new Date(since).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, preloads included`}
          </Text>
        </Box>
        {[...shown].reverse().map(section => (
          <Box key={section.title} flexDirection="column-reverse" marginTop={1}>
            {!closed.has(section.title) && [...section.items].sort(compare).reverse().map(item => {
              const origin = section.title === 'Starred' || section.title === 'Most used here'
                ? list.find(source => source.items.includes(item))?.title : undefined
              const path = home && item.target.startsWith(`${home}/`) ? `~${item.target.slice(home.length)}` : item.target
              const use = useOf(item)
              const age = use ? now - use.lastUsed : 0
              const ago = age < HOUR ? 'just now' : age < DAY ? `${Math.floor(age / HOUR)}h ago` : `${Math.floor(age / DAY)}d ago`
              const stale = use ? age >= 30 * DAY : Number.isFinite(since) && now - since >= 30 * DAY
              return (
                // In a narrow pane the count moves under the name as a unit instead of
                // breaking across lines.
                <Box key={`${section.title}:${item.target}`} flexWrap="wrap">
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
                  {(item.health || use) && (
                    <Box columnGap={1} marginLeft={1} flexShrink={0}>
                      {item.health && <Text color="warning">!</Text>}
                      {/* Non-breaking spaces keep "4× · 34d ago" one word, so the row
                          moves it whole instead of breaking it across lines. */}
                      {use && <Text dimColor wrap="truncate-end">{`${use.count}×\u00a0·\u00a0${ago.replace(/ /g, '\u00a0')}`}</Text>}
                    </Box>
                  )}
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
                    flexDirection="column"
                  >
                    {(item.health ?? []).map(flag => <Text color="warning">{flag}</Text>)}
                    {(item.description || !item.health) && <Text>{item.description || 'No description.'}</Text>}
                    {origin && <Text dimColor>{origin === 'Account' ? origin : `${origin} · ${path}`}</Text>}
                  </Box>
                </Box>
              )
            })}
            {!closed.has(section.title) && section.items.length === 0 && <Text dimColor>none</Text>}
            {!closed.has(section.title) && <Text dimColor>{section.folders.join(', ')}</Text>}
            {/* The arrow toggles the section; the health count stays in view while it
                is collapsed. A Button here takes one string, so the bold title sits
                beside it rather than inside it. */}
            <Box columnGap={1}>
              <Button
                key={`collapse:${section.title}`}
                plain
                dimColor
                onPress={() => setCollapsed($, section.title, !closed.has(section.title))}
              >
                {closed.has(section.title) ? '▸' : '▾'}
              </Button>
              <Text bold>{section.title} ({section.items.length})</Text>
              {section.items.filter(item => item.health?.length).length > 0 && (
                <Text color="warning">{section.items.filter(item => item.health?.length).length} health</Text>
              )}
            </Box>
          </Box>
        ))}
        {/* One header row: the sort on the left, the selected option at full
            strength and the others dim, and a quiet Refresh on the right. */}
        <Box justifyContent="space-between">
          <Box columnGap={1}>
            <Text dimColor>Sort</Text>
            {([['recent', 'Recent'], ['count', 'Most used'], ['name', 'Name']] as const).map(([value, label]) => (
              <Button
                key={`sort:${value}`}
                plain
                dimColor={order !== value}
                onPress={() => setSort($, value)}
              >
                {label}
              </Button>
            ))}
          </Box>
          <Button key="refresh" plain dimColor onPress={() => refresh($, globalDir)}>
            Refresh
          </Button>
        </Box>
      </Box>
    )
  })
}
