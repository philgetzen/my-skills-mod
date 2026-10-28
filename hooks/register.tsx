import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { History, Issue, Item, Section, Sort, Source, Usage, Use } from '../types'

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
// View state. The chip is saved like the sort; the rest lasts the session.
const view = atom({ plugin: 'my-skills', key: 'view' } as const, null)
const query = atom({ plugin: 'my-skills', key: 'query' } as const, '')
const searchOpen = atom({ plugin: 'my-skills', key: 'searchOpen' } as const, false)
const scope = atom({ plugin: 'my-skills', key: 'scope' } as const, 'Global')
const SCOPE_KEY = 'scope'
const showAll = atom({ plugin: 'my-skills', key: 'showAll' } as const, false)
const showIdle = atom({ plugin: 'my-skills', key: 'showIdle' } as const, false)
const keep = atom({ plugin: 'my-skills', key: 'keep' } as const, null)
const confirming = atom({ plugin: 'my-skills', key: 'confirming' } as const, null)
const SOURCES: readonly Source[] = ['Global', 'User', 'Account', 'Project', 'Plugins']
const FIRST_ROWS = 12
// The health card's one-line reason for each kind it groups by source.
const REASON: Record<Exclude<Issue['kind'], 'collision'>, string> = {
  unmanaged: 'Not in your Global folder',
  bare: 'No description',
  dangling: 'Broken link',
}
const SORT_WORD: Record<Sort, string> = { recent: 'recent', count: 'most used', name: 'name' }
// Only a plain skill name goes to skillshare: never a glob, a flag or one of its keywords.
const SKILLSHARE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const GLYPHS = '▁▂▃▄▅▆▇█'
// Line colors of the trend drawings, light then dark.
const INK: Record<'rising' | 'steady' | 'fading' | 'no use', [string, string]> = {
  rising: ['#4A4945', '#D4D1C8'],
  steady: ['#4A4945', '#D4D1C8'],
  fading: ['#A9A69C', '#8C897F'],
  'no use': ['#D6D3CA', '#4A4945'],
}
// Each flag says what is wrong and what to do about it.
const DANGLING = "Broken link: this entry points to something that isn't a skill folder. Delete the link, or point it at the skill's folder."
const BARE = "No description: Claude can't tell when to use it. Add a description: line to the top of its file."
const UNMANAGED = "Not in your Global folder: skillshare doesn't track it, so your other agents don't get it. Run skillshare collect claude to move it there, or delete it if it's a leftover."
const clash = (name: string, other: string[]) =>
  `Same name in ${other.join(' and ')}: both answer to /${name}, so the wrong one may load. Rename or remove one.`
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const HISTORY_VERSION = 3
const DAYS_KEPT = 30

const pad = (n: number) => String(n).padStart(2, '0')
// A local calendar date, 'YYYY-MM-DD'.
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
// The local date `ago` days before `now`, stepped by calendar so a DST change cannot skip a day.
const dayAgo = (now: number, ago: number) => {
  const date = new Date(now)
  date.setDate(date.getDate() - ago)
  return dayKey(date)
}
// Keeps the last 30 local days, today included.
function pruneDays(days: Record<string, number>, now: number): Record<string, number> {
  const keep = new Set(Array.from({ length: DAYS_KEPT }, (_, i) => dayAgo(now, i)))
  return Object.fromEntries(Object.entries(days).filter(([key, count]) => keep.has(key) && count > 0))
}

// Ten buckets of three local days each, oldest first; the last one ends today.
export function trendPoints(days: Record<string, number> | undefined, now: number): number[] {
  const points = Array.from({ length: 10 }, () => 0)
  if (!days) return points
  for (let ago = 0; ago < 30; ago++) {
    const count = Object.hasOwn(days, dayAgo(now, ago)) ? days[dayAgo(now, ago)]! : 0
    points[9 - Math.floor(ago / 3)]! += count
  }
  return points
}

export function trendWord(points: number[]): 'rising' | 'steady' | 'fading' | 'no use' {
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0)
  if (sum(points) === 0) return 'no use'
  const first = sum(points.slice(0, 3)) / 3
  const last = sum(points.slice(-3)) / 3
  if (last > first * 1.2) return 'rising'
  if (last < first * 0.8) return 'fading'
  return 'steady'
}

// The last 30 local days' counts, oldest first; the last one is today.
function dailyCounts(days: Record<string, number> | undefined, now: number): number[] {
  return Array.from({ length: 30 }, (_, i) => {
    const key = dayAgo(now, 29 - i)
    return days && Object.hasOwn(days, key) ? days[key]! : 0
  })
}

// A polyline over `values`, x from 1 to width − 1, y from `low` at zero to
// `high` at the largest value; the color follows the trend word and the theme.
function lineSvg(values: number[], width: number, height: number, high: number, low: number, word: keyof typeof INK): string {
  const max = Math.max(...values)
  const step = (width - 2) / (values.length - 1)
  const points = values
    .map((value, i) => `${(1 + i * step).toFixed(1)},${(max === 0 ? low : low - (value / max) * (low - high)).toFixed(1)}`)
    .join(' ')
  const [light, dark] = INK[word]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>polyline{stroke:${light}}@media (prefers-color-scheme: dark){polyline{stroke:${dark}}}</style>` +
    `<polyline points="${points}" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

// The terminal's trend: one block glyph per value, scaled to the largest.
function glyphs(values: number[]): string {
  const max = Math.max(...values)
  return values.map(value => GLYPHS[max === 0 ? 0 : Math.round((value / max) * 7)]).join('')
}

const bare = (name: string) => name.replace(/^\//, '')
const own = <T,>(record: Record<string, T>, key: string): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined)
const expand = (path: string, home: string) => (path.startsWith('~') ? `${home}${path.slice(1)}` : path)
const tildeOf = (path: string, home: string) => (home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path)
const listed = (names: string[]) => names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

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
          ? { name, target: `${folder}/${name}`, description: '', issues: [{ kind: 'dangling', text: DANGLING }] }
          : undefined
      }
      if (confineTo !== undefined && !(await isInside($, target, confineTo))) return undefined
      return { name, target, description: await describe($, target) }
    }),
  )
  return found.filter((one): one is Item => one !== undefined)
}

const isDangling = (item: Item) => item.issues?.some(one => one.kind === 'dangling') ?? false

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

// What the session's enabled plugins add, as the typeahead lists it. Each opens
// from its plugin's install folder, `skills/<name>/SKILL.md` or
// `commands/<name>.md`; one with neither gets `plugin:<name>` and no file actions.
async function pluginSkills($: EngineInterface, home: string): Promise<Item[]> {
  let listed: { name: string; description: string; source: string }[]
  try { listed = await $.command.list() } catch { return [] }
  const installs = new Map<string, string>()
  try {
    const manifest = JSON.parse(await $.fs.read(`${home}/.claude/plugins/installed_plugins.json`))
    for (const [key, entries] of Object.entries(manifest.plugins ?? {})) {
      const path = Array.isArray(entries) ? entries[0]?.installPath : undefined
      if (typeof path === 'string') installs.set(key.split('@')[0]!, path)
    }
  } catch {
    // No manifest: the skills still list, without files.
  }
  const found = await Promise.all(
    listed
      .filter(one => one.source === 'plugin')
      .map(async one => {
        const [plugin, skill] = one.name.includes(':') ? one.name.split(':', 2) : [one.name, one.name]
        const install = installs.get(plugin!)
        const root = install && await $.fs.stat(install, { resolve: true }).then(found => found.realPath).catch(() => undefined)
        const files = root ? [`${install}/skills/${skill}/SKILL.md`, `${install}/commands/${skill}.md`] : []
        let target = `plugin:${one.name}`
        // A name from frontmatter could hold `..`: only a file inside the plugin opens.
        for (const file of files) {
          if (await $.fs.exists(file) && await isInside($, file, root!)) { target = file; break }
        }
        return { name: one.name, target, description: one.description ?? '' }
      }),
  )
  return found
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
  // Kept out of every flag below: plugin names are namespaced, and a plugin's
  // folder is never one to move to the Trash.
  const plugins = await pluginSkills($, home)
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
      if (title !== 'Account' && item.description === '' && !isDangling(item)) {
        item.issues = [...(item.issues ?? []), { kind: 'bare', text: BARE }]
      }
    }
  }
  if (global.length > 0) {
    for (const item of userSkills) {
      if (!isDangling(item)) {
        item.issues = [...(item.issues ?? []), { kind: 'unmanaged', text: UNMANAGED }]
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
      if (other.length > 0) item.issues = [...(item.issues ?? []), { kind: 'collision', text: clash(name, other) }]
    }
  }

  const sort = (list: Item[]) => [...list].sort((a, b) => a.name.localeCompare(b.name))
  const tilde = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path)

  return [
    { title: 'Global', folders: [tilde(globalDir)], items: sort(global) },
    {
      title: 'User',
      // With Global left at ~/.claude/skills, User holds only the commands.
      folders: [...(globalDir === `${home}/.claude/skills` ? [] : [tilde(`${home}/.claude/skills`)]), tilde(`${home}/.claude/commands`)],
      items: sort(user),
    },
    {
      title: 'Project',
      folders: [tilde(`${root}/.claude`)],
      items: sort(project),
    },
    { title: 'Account', folders: ['claude.ai, Customize › Skills'], items: sort(account) },
    { title: 'Plugins', folders: ['Enabled plugins'], items: sort(plugins) },
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
  const chip = await $.store.get(SCOPE_KEY)
  await update($, scope, () => SOURCES.find(one => one === chip) ?? 'Global')
}

// The skill's own folder, a dangling link itself, or a command's file: never
// the folder that holds them.
function removable(item: Item): string {
  return item.target.endsWith('/SKILL.md') ? item.target.slice(0, -'/SKILL.md'.length) : item.target
}

const stamp = (now: number) => {
  const date = new Date(now)
  return `${dayKey(date)} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`
}

// A Global copy in a shared skillshare folder goes through skillshare in global
// mode (a repo with .skillshare/ would otherwise point it at the project's copy);
// every other copy moves to the Trash under a dated name, so nothing is overwritten.
async function removeCopy($: EngineInterface, item: Item, source: Source, globalSetting: string) {
  if (source === 'Plugins' || source === 'Account') return
  const home = (await $.env.get('HOME')) ?? ''
  const name = bare(item.name)
  // Global counts as skillshare's only when it resolves to skillshare's own
  // folder: any other shared folder (or a trailing slash) would point
  // `skillshare uninstall` at a different copy than the one picked.
  const real = async (path: string) => {
    const plain = path.replace(/\/+$/, '')
    try {
      return (await $.fs.stat(plain, { resolve: true })).realPath ?? plain
    } catch {
      return plain
    }
  }
  const viaSkillshare = source === 'Global' && SKILLSHARE_NAME.test(name) && name !== 'agents' &&
    (await real(expand(globalSetting, home))) === (await real(`${home}/.config/skillshare/skills`))
  const argv = viaSkillshare
    ? ['skillshare', 'uninstall', name, '-g', '--force']
    : ['mv', removable(item), `${home}/.Trash/${name} ${stamp(await $.clock.now())}`]
  let failure: string | undefined
  try {
    const result = await $.process.run(argv, home ? { cwd: home } : undefined)
    if (result.exitCode !== 0) {
      failure = result.stderr.split('\n').map(line => line.trim()).find(Boolean) ?? `${argv[0]} exited with ${result.exitCode}`
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  await update($, confirming, () => null)
  if (failure !== undefined) {
    $.ui.toast(failure)
    return
  }
  await update($, keep, () => null)
  $.ui.toast(viaSkillshare ? 'Removed. Commit in ~/.config/skillshare and run skillshare sync.' : 'Moved to Trash.')
  await refresh($, globalSetting)
}

async function reveal($: EngineInterface, target: string) {
  try {
    if ((await $.process.run(['open', '-R', target])).exitCode === 0) return
  } catch {
    // Not on macOS.
  }
  $.ui.toast(`Could not reveal ${target}`)
}

async function copyCommand($: EngineInterface, text: string, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']) {
  const result = await $.ui.copy({ text, surface })
  $.ui.toast(result.isCopied ? `Copied ${text}` : `Could not copy ${text}`)
}

async function openDetail($: EngineInterface, item: Item) {
  await update($, keep, () => null)
  await update($, confirming, () => null)
  await update($, view, () => ({ name: bare(item.name), target: item.target }))
}

async function closeDetail($: EngineInterface) {
  await update($, keep, () => null)
  await update($, confirming, () => null)
  await update($, view, () => null)
}

async function setScope($: EngineInterface, source: Source) {
  if (await $.store.get(SCOPE_KEY) !== source) await $.store.set(SCOPE_KEY, source)
  await update($, showAll, () => false)
  await update($, scope, () => source)
}

async function setSearch($: EngineInterface, isOpen: boolean) {
  if (!isOpen) await update($, query, () => '')
  await update($, searchOpen, () => isOpen)
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
      Object.values(use.byWorkspace).every(number)) {
      // A malformed days map is dropped alone, the counts stay.
      const { days, ...rest } = use
      byName[name] = (object(days) && Object.values(days).every(number) ? use : rest) as Usage['byName'][string]
    }
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
    ...(typeof value.version === 'number' && Number.isFinite(value.version) ? { version: value.version } : {}),
  }
}

async function importHistory($: EngineInterface) {
  const fail = async (error: unknown) => {
    try {
      const saved = await savedHistory($)
      if (saved.importedAt === undefined || saved.version !== HISTORY_VERSION) await $.store.set(HISTORY_KEY, { ...saved, attempts: saved.attempts + 1 })
    } catch {}
    try { await update($, importing, () => false) } catch {}
    try { $.ui.log(`my-skills: history import failed: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' }) } catch {}
  }
  try {
    const startedAt = await $.clock.now()
    const home = (await $.env.get('HOME')) ?? ''
    const projects = `${home}/.claude/projects`
    const listed = new Set((await read($, sections)).flatMap(section => section.items.map(item => item.name.replace(/^\//, ''))))
    const live = await savedUsage($)
    // Uses after a name's live count began are in the live store. That began at
    // `since`, or at `first` for a name listed later (a plugin skill); a name with
    // no live count yet is read to just before this import. The five minutes
    // leave a use still being recorded to the live count alone.
    const cutoffOf = (name: string) => {
      const use = Object.hasOwn(live.byName, name) ? live.byName[name] : undefined
      return (use ? use.first ?? live.since ?? startedAt : startedAt) - BOUNDARY
    }
    const found: Record<string, Use> = {}
    const keys = new Map<string, string>()
    let files = 0, grepped = 0, skipped = 0, uses = 0, oldest = Infinity
    const finish = async () => {
      const now = await $.clock.now()
      const saved = await savedHistory($)
      if (saved.importedAt === undefined) {
        const byName: Record<string, Use> = {}
        for (const [name, use] of Object.entries(found)) byName[name] = { ...use, days: pruneDays(use.days ?? {}, now) }
        const next: History = { byName, importedAt: now, attempts: saved.attempts, version: HISTORY_VERSION,
          ...(oldest === Infinity ? {} : { oldest }) }
        await $.store.set(HISTORY_KEY, next)
        await update($, history, () => next)
      } else if (saved.version !== HISTORY_VERSION) {
        // A version pass only adds `days` and new names: the transcripts are pruned
        // over time, so a re-scan would lose uses the stored counts still have.
        const byName: Record<string, Use> = {}
        for (const [name, use] of Object.entries(saved.byName)) {
          const seen = Object.hasOwn(found, name) ? found[name]!.days : undefined
          byName[name] = seen ? { ...use, days: pruneDays(seen, now) } : use
        }
        // A name the first import did not list (added since) has no stored count
        // to lose, so its found uses go in whole.
        for (const [name, use] of Object.entries(found)) {
          if (!Object.hasOwn(byName, name)) byName[name] = { ...use, days: pruneDays(use.days ?? {}, now) }
        }
        const next: History = { ...saved, byName, attempts: 0, version: HISTORY_VERSION }
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
          if (!(at < startedAt) || typeof row.cwd !== 'string') continue
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
            if (!listed.has(name) || !(at < cutoffOf(name))) continue
            const key = keys.get(row.cwd) ?? await mainRepo($, row.cwd)
            keys.set(row.cwd, key)
            const previous = Object.hasOwn(found, name) ? found[name] : undefined
            found[name] = {
              count: (previous?.count ?? 0) + 1,
              lastUsed: Math.max(previous?.lastUsed ?? -Infinity, at),
              byWorkspace: { ...previous?.byWorkspace,
                [key]: ((previous && Object.hasOwn(previous.byWorkspace, key) ? previous.byWorkspace[key] : 0) ?? 0) + 1 },
              days: bump(previous?.days, dayKey(new Date(at))),
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

function bump(days: Record<string, number> | undefined, key: string): Record<string, number> {
  return { ...days, [key]: (days && Object.hasOwn(days, key) ? days[key]! : 0) + 1 }
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

async function record($: EngineInterface, given: string) {
  const list = await read($, sections)
  const names = list.flatMap(section => section.items.map(item => item.name.replace(/^\//, '')))
  // A plugin skill may arrive without its `<plugin>:`; it counts when one plugin has it.
  const namespaced = names.filter(name => name.endsWith(`:${given}`))
  const skill = names.includes(given) ? given : namespaced.length === 1 ? namespaced[0]! : undefined
  if (skill === undefined) return
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
        ...(previous ? previous.first === undefined ? {} : { first: previous.first } : { first: now }),
        byWorkspace: {
          ...previous?.byWorkspace,
          [root]: ((previous && Object.hasOwn(previous.byWorkspace, root) ? previous.byWorkspace[root] : 0) ?? 0) + 1,
        },
        days: pruneDays(bump(previous?.days, dayAgo(now, 0)), now),
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
  const globalDir = String(options.globalSkillsDir ?? '~/.claude/skills')

  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    try { await record($, e.skill) } catch {}
    return result
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'my-skills',
      description: 'Open the My skills pane: health, search, starred, and every skill by source',
    })
    await refresh($, globalDir)
    // `importing` is shared state and outlives a reload, which cancels this load's
    // timers; whether an import is scheduled is this load's own business.
    const saved = await read($, history)
    if ((saved.importedAt === undefined || saved.version !== HISTORY_VERSION) && saved.attempts < 2 && !importScheduled) {
      importScheduled = true
      await update($, importing, () => true)
      $.clock.after(IMPORT_DELAY, () => void importHistory($))
    } else if (!importScheduled) {
      await update($, importing, () => false)
    }
    return next(e)
  })

  on('command.run', { command: 'my-skills' }, async $ => {
    await refresh($, globalDir)
    await $.ui.open({ id: PANE, title: 'My skills' })

    return { text: 'My skills pane opened.' }
  })

  // Two views in one pane: the list (header, search, health card, sort, Active
  // here, Starred, All skills) and one skill's detail. Every Button holds one
  // string and a key of its own; rows are keyed by list and target, so the same
  // skill in two lists is two controls.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    // No Svg on the terminal, no Input on mobile.
    const Svg = e.surface === 'terminal' ? undefined : ($.ui.resolve(e) as Elements['desktop']).Svg
    const Input = e.surface === 'mobile' ? undefined : ($.ui.resolve(e) as Elements['desktop']).Input
    const list = await read($, sections)
    const stars = new Set(await read($, starred))
    const saved = await read($, usage)
    const imported = await read($, history)
    const busy = await read($, importing)
    const order = await read($, sort)
    const closed = new Set(await read($, collapsed))
    const opened = await read($, view)
    const isSearching = Input ? await read($, searchOpen) : false
    const text = isSearching ? await read($, query) : ''
    const home = (await $.env.get('HOME')) ?? ''
    const now = await $.clock.now()
    const since = Math.min(saved.since ?? Infinity, imported.oldest ?? Infinity)

    const all = list.flatMap(section => section.items)
    const sourceOf = new Map<Item, Source>(list.flatMap(section => section.items.map(item => [item, section.title as Source] as const)))
    const useOf = (item: Item): Use | undefined => {
      const name = bare(item.name)
      const live = own(saved.byName, name)
      const past = own(imported.byName, name)
      if (!live) return past
      if (!past) return live
      const byWorkspace = { ...past.byWorkspace }
      for (const [key, count] of Object.entries(live.byWorkspace)) byWorkspace[key] = (own(byWorkspace, key) ?? 0) + count
      const days = { ...past.days }
      for (const [key, count] of Object.entries(live.days ?? {})) days[key] = (own(days, key) ?? 0) + count
      return { count: live.count + past.count, lastUsed: Math.max(live.lastUsed, past.lastUsed), byWorkspace, days }
    }
    const compare = (a: Item, b: Item) => {
      const byName = a.name.localeCompare(b.name)
      if (order === 'name') return byName
      const first = useOf(a)
      const second = useOf(b)
      const uses = (second?.count ?? 0) - (first?.count ?? 0)
      if (order === 'count') return uses || byName
      const recent = (second?.lastUsed ?? -Infinity) - (first?.lastUsed ?? -Infinity)
      return (Number.isNaN(recent) ? 0 : recent) || uses || byName
    }
    const sorted = (items: Item[]) => [...items].sort(compare)
    const ago = (use: Use | undefined) => {
      // Until the history import ends, no uses yet may still mean some to come.
      if (!use) return busy ? 'updating' : 'never'
      const age = now - use.lastUsed
      return age < HOUR ? 'now' : age < DAY ? `${Math.floor(age / HOUR)}h` : `${Math.floor(age / DAY)}d`
    }
    const close = () => $.ui.close({ id: PANE })

    const footer = (
      <Box key="footer" marginTop={1}>
        <Text dimColor>
          {busy
            ? 'Importing history…'
            : since === Infinity
              ? 'No uses counted yet'
              : `Uses since ${new Date(since).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, preloads included`}
        </Text>
      </Box>
    )

    // One row, the same in every list: star, name (and ! when flagged), trend,
    // uses, age. The name opens the detail view.
    const row = (where: string, item: Item, withSource = false) => {
      const use = useOf(item)
      const points = trendPoints(use?.days, now)
      const word = trendWord(points)
      const isStarred = stars.has(item.target)
      return (
        <Box key={`row:${where}:${item.target}`} flexDirection="column">
          <Box key={`line:${where}:${item.target}`} columnGap={1} alignItems="center">
            <Button key={`star:${where}:${item.target}`} plain dimColor={!isStarred} onPress={() => setStar($, item.target, !isStarred)}>
              {isStarred ? '★' : '☆'}
            </Button>
            <Box flexGrow={1} flexShrink={1} columnGap={1}>
              <Button key={`open:${where}:${item.target}`} plain dimColor={!use} onPress={() => openDetail($, item)}>
                {item.name}
              </Button>
              {item.issues && <Text color="warning">!</Text>}
            </Box>
            {Svg
              ? <Svg source={lineSvg(points, 44, 18, 3, 16, word)} alt={`30-day trend: ${word}`} width={44} height={18} />
              : <Text dimColor>{glyphs(points)}</Text>}
            <Box width={5} justifyContent="flex-end" flexShrink={0}>
              <Text>{use ? `${use.count}×` : busy ? '…' : '—'}</Text>
            </Box>
            <Box width={5} justifyContent="flex-end" flexShrink={0}>
              <Text dimColor>{!use && busy ? '…' : ago(use)}</Text>
            </Box>
          </Box>
          {withSource && <Box paddingLeft={2}><Text dimColor>{sourceOf.get(item) ?? ''}</Text></Box>}
        </Box>
      )
    }

    // The header of a collapsible section: arrow, bold title, dim note and count.
    const heading = (title: string, note: string, count: number) => (
      <Box key={`heading:${title}`} columnGap={1}>
        <Button key={`collapse:${title}`} plain dimColor onPress={() => setCollapsed($, title, !closed.has(title))}>
          {/* U+FE0E keeps ▶ a text glyph rather than an emoji. */}
          {closed.has(title) ? '▶︎' : '▼'}
        </Button>
        <Text bold>{title}</Text>
        {note !== '' && <Text dimColor wrap="truncate-middle">{note}</Text>}
        <Text dimColor>{String(count)}</Text>
      </Box>
    )

    const copies = opened ? all.filter(item => bare(item.name) === opened.name) : []
    const shown = copies.find(item => item.target === opened?.target) ?? copies[0]

    // DETAIL VIEW
    if (opened && shown) {
      const name = opened.name
      const use = useOf(shown)
      const word = trendWord(trendPoints(use?.days, now))
      const daily = dailyCounts(use?.days, now)
      const isStarred = stars.has(shown.target)
      const count = use?.count ?? 0
      const countOf = new Map<string, number>()
      for (const item of all) countOf.set(bare(item.name), useOf(item)?.count ?? 0)
      const rank = 1 + [...countOf.values()].filter(other => other > count).length
      const sources = [...new Set(copies.map(item => sourceOf.get(item)))].filter((one): one is Source => one !== undefined)
      const hasCollision = shown.issues?.some(issue => issue.kind === 'collision') ?? false
      const kept = await read($, keep)
      const asking = await read($, confirming)
      // A plugin's copy is never offered: its files belong to the plugin.
      const fixable = copies.filter(item => sourceOf.get(item) !== 'Plugins')
      const keptTarget = fixable.some(item => item.target === kept) ? kept : null
      const isAccount = sourceOf.get(shown) === 'Account'
      const isFileless = shown.target.startsWith('plugin:')
      const age = ago(use)
      const numbers = ['', '', 'Two', 'Three', 'Four']
      return (
        <Box flexDirection="column" rowGap={1}>
          <Box key="detail-header" justifyContent="space-between">
            <Button key="back" plain dimColor onPress={() => closeDetail($)}>‹ Skills</Button>
            <Button key="close" plain dimColor onPress={close}>Close</Button>
          </Box>
          <Box flexDirection="column">
            <Box key="title" columnGap={1} alignItems="center">
              <Text bold>{shown.name}</Text>
              <Button key={`star:detail:${shown.target}`} plain dimColor={!isStarred} onPress={() => setStar($, shown.target, !isStarred)}>
                {isStarred ? '★' : '☆'}
              </Button>
            </Box>
            <Box key="chips" columnGap={1} flexWrap="wrap">
              <Text color="suggestion">{`/${name}`}</Text>
              {sources.map(source => <Text dimColor>{source}</Text>)}
            </Box>
          </Box>
          <Box key="stats" columnGap={1}>
            {([['uses', String(count)], ['last used', age === 'never' || age === 'updating' || age === 'now' ? age : `${age} ago`], ['rank', count > 0 ? `#${rank}` : '—']] as const)
              .map(([label, value]) => (
                <Box key={`stat:${label}`} flexDirection="column" flexGrow={1} borderStyle="round" borderColor="subtle" paddingX={1}>
                  <Text dimColor>{label}</Text>
                  <Text bold>{value}</Text>
                </Box>
              ))}
          </Box>
          <Box key="chart" flexDirection="column">
            <Box justifyContent="space-between">
              <Text bold>Last 30 days</Text>
              <Text dimColor>{word}</Text>
            </Box>
            {Svg
              ? <Svg source={lineSvg(daily, 340, 56, 4, 52, word)} alt={`Uses per day over the last 30 days: ${word}`} />
              : <Text dimColor>{glyphs(daily)}</Text>}
            <Box justifyContent="space-between">
              <Text dimColor>30d ago</Text>
              <Text dimColor>Today</Text>
            </Box>
          </Box>
          {hasCollision && fixable.length > 1 && (
            <Box key="collision" flexDirection="column" rowGap={1} borderStyle="round" borderColor="warning" paddingX={1}>
              <Box flexDirection="column">
                <Text color="warning" bold>{`${numbers[fixable.length] ?? fixable.length} skills answer to /${name}`}</Text>
                <Text>Claude may load either one. Pick the copy to keep.</Text>
              </Box>
              <Box flexDirection="column">
                {fixable.map(copy => {
                  const source = sourceOf.get(copy) ?? 'Global'
                  const isKept = keptTarget === copy.target
                  return (
                    <Box key={`copy:${copy.target}`} columnGap={1} flexWrap="wrap">
                      <Button key={`keep:${copy.target}`} dimColor={keptTarget !== null && !isKept} onPress={() => update($, keep, () => copy.target)}>
                        {isKept ? `Keep ${source}` : source}
                      </Button>
                      <Text dimColor wrap="truncate-middle">{source === 'Account' ? 'claude.ai › Customize › Skills' : tildeOf(copy.target, home)}</Text>
                    </Box>
                  )
                })}
              </Box>
              {keptTarget !== null && fixable.filter(copy => copy.target !== keptTarget).map(copy => {
                const source = sourceOf.get(copy) ?? 'Global'
                if (source === 'Account') {
                  return (
                    <Button key={`customize:${copy.target}`} onPress={() => openTarget($, copy.target)}>
                      Open Customize › Skills
                    </Button>
                  )
                }
                if (asking === copy.target) {
                  return (
                    <Box key={`ask:${copy.target}`} columnGap={1} flexWrap="wrap" alignItems="center">
                      <Text>{`Move the ${source} copy to trash?`}</Text>
                      <Button key="confirm-remove" variant="primary" onPress={() => removeCopy($, copy, source, globalDir)}>Confirm</Button>
                      <Button key="cancel-remove" onPress={() => update($, confirming, () => null)}>Cancel</Button>
                    </Box>
                  )
                }
                return (
                  <Button key={`remove:${copy.target}`} variant="primary" onPress={() => update($, confirming, () => copy.target)}>
                    {`Remove ${source} copy`}
                  </Button>
                )
              })}
            </Box>
          )}
          {/* Every other flag says what is wrong and what to do about it. */}
          {shown.issues?.some(issue => issue.kind !== 'collision') && (
            <Box key="issues" flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
              {shown.issues.filter(issue => issue.kind !== 'collision').map(issue => <Text color="warning">{issue.text}</Text>)}
            </Box>
          )}
          <Box key="description" flexDirection="column">
            <Text bold>Description</Text>
            <Text>{shown.description || 'No description.'}</Text>
          </Box>
          <Box key="actions" flexDirection="column" alignItems="flex-start">
            {/* A link that points nowhere may still lead to a file outside every
                guarded folder (a repo can aim one at ~/.ssh), so it opens nothing. */}
            {!isDangling(shown) && !isFileless && (
              <Button key="open-file" plain onPress={() => openTarget($, shown.target)}>
                {isAccount ? 'Open Customize › Skills' : shown.target.endsWith('/SKILL.md') ? 'Open SKILL.md' : 'Open file'}
              </Button>
            )}
            <Button key="copy" plain onPress={press => copyCommand($, `/${name}`, press.surface)}>{`Copy /${name}`}</Button>
            {!isAccount && !isFileless && <Button key="reveal" plain onPress={() => reveal($, shown.target)}>Reveal in Finder</Button>}
          </Box>
          {footer}
        </Box>
      )
    }

    // LIST VIEW
    const header = (
      <Box key="header" justifyContent="space-between" alignItems="center">
        <Box columnGap={1}>
          <Text bold>Skills</Text>
          <Text dimColor>{String(all.length)}</Text>
        </Box>
        <Box columnGap={1}>
          {Input && <Button key="search" plain dimColor={!isSearching} onPress={() => setSearch($, !isSearching)}>Search</Button>}
          <Button key="refresh" plain dimColor onPress={() => refresh($, globalDir)}>Refresh</Button>
          <Button key="close" plain dimColor onPress={close}>Close</Button>
        </Box>
      </Box>
    )
    const field = Input && isSearching && (
      <Box key="search-row" columnGap={1} alignItems="center">
        <Box flexGrow={1}>
          <Input
            key="query"
            placeholder="Search skills"
            value={text}
            onInput={value => void update($, query, () => value)}
            onSubmit={value => void update($, query, () => value)}
          />
        </Box>
        {text !== '' && <Button key="clear-search" plain dimColor onPress={() => update($, query, () => '')}>Clear</Button>}
      </Box>
    )

    // While the query holds text, its results replace everything below the field.
    const needle = text.trim().toLowerCase()
    if (needle !== '') {
      const matches = sorted(all.filter(item =>
        item.name.toLowerCase().includes(needle) ||
        (sourceOf.get(item) ?? '').toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle)))
      return (
        <Box flexDirection="column" rowGap={1}>
          {header}
          {field}
          <Box key="results" flexDirection="column">
            <Text dimColor>
              {matches.length === 0
                ? `No skills match "${text.trim()}"`
                : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} across all sources · by ${SORT_WORD[order]}`}
            </Text>
            {matches.map(item => row('Search', item, true))}
          </Box>
          {footer}
        </Box>
      )
    }

    // Health card: one row per colliding name, one per kind of other issue and source.
    const flaggedNames = new Set(all.filter(item => item.issues?.length).map(item => bare(item.name)))
    const collisions = new Map<string, Source[]>()
    const groups = new Map<string, { kind: Exclude<Issue['kind'], 'collision'>; source: Source; count: number }>()
    for (const item of all) {
      const source = sourceOf.get(item) ?? 'Global'
      for (const kind of new Set((item.issues ?? []).map(issue => issue.kind))) {
        if (kind === 'collision') {
          const name = bare(item.name)
          collisions.set(name, [...new Set([...(collisions.get(name) ?? []), source])])
        } else {
          const group = groups.get(`${kind}:${source}`) ?? { kind, source, count: 0 }
          groups.set(`${kind}:${source}`, { ...group, count: group.count + 1 })
        }
      }
    }
    const healthRow = (key: string, title: string, note: string, action: string, onPress: () => unknown) => (
      <Box key={`health:${key}`} justifyContent="space-between" alignItems="center" columnGap={1}>
        <Box flexDirection="column" flexShrink={1}>
          <Text>{title}</Text>
          <Text dimColor>{note}</Text>
        </Box>
        <Button key={`${action.toLowerCase()}:${key}`} plain onPress={() => void onPress()}>{action}</Button>
      </Box>
    )
    const health = flaggedNames.size > 0 && (
      <Box key="health" flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
        <Text color="warning" bold>{`${flaggedNames.size} ${flaggedNames.size === 1 ? 'skill needs' : 'skills need'} attention`}</Text>
        {[...collisions].map(([name, names]) => {
          const first = all.find(item => bare(item.name) === name)
          return healthRow(name, name, `Name collision · ${listed(names)}`, 'Fix', () => first && openDetail($, first))
        })}
        {[...groups.values()].map(group => healthRow(
          `${group.kind}:${group.source}`,
          `${group.count} ${group.source} ${group.count === 1 ? 'skill' : 'skills'}`,
          REASON[group.kind],
          'Review',
          () => setScope($, group.source),
        ))}
      </Box>
    )

    // One header row: the sort options in a box of their own, so they read as
    // controls rather than as the list's first row; the selected one at full strength.
    const sorter = (
      <Box key="sort-row">
        <Box key="sort-options" columnGap={1} borderStyle="round" borderColor="subtle" paddingX={1}>
          <Text dimColor>Sort</Text>
          {([['recent', 'Recent'], ['count', 'Most used'], ['name', 'Name']] as const).map(([value, label]) => (
            <Button key={`sort:${value}`} plain dimColor={order !== value} onPress={() => setSort($, value)}>
              {label}
            </Button>
          ))}
        </Box>
      </Box>
    )

    // Active here: the five skills used most in this repository, once they add up to five uses.
    const root = await mainRepo($, await $.session.root())
    const hereCount = (item: Item) => own(useOf(item)?.byWorkspace ?? {}, root) ?? 0
    const top = all
      .filter(item => hereCount(item) > 0)
      .sort((a, b) => hereCount(b) - hereCount(a) || a.name.localeCompare(b.name))
      .slice(0, 5)
    const here = top.reduce((sum, item) => sum + hereCount(item), 0) >= 5 ? sorted(top) : []
    const active = here.length > 0 && (
      <Box key="section:Active here" flexDirection="column">
        {heading('Active here', tildeOf(root, home), here.length)}
        {!closed.has('Active here') && here.map(item => row('Active here', item))}
      </Box>
    )

    // Starred: the ones used in the last 30 days, the idle ones folded under one button.
    const starredItems = sorted(all.filter(item => stars.has(item.target)))
    const isIdle = (item: Item) => {
      const use = useOf(item)
      return !use || now - use.lastUsed >= 30 * DAY
    }
    const idle = starredItems.filter(isIdle)
    const isIdleShown = idle.length > 0 && await read($, showIdle)
    const starSection = (
      <Box key="section:Starred" flexDirection="column">
        {heading('Starred', '', starredItems.length)}
        {!closed.has('Starred') && (
          <Box flexDirection="column">
            {starredItems.length === 0 && <Text dimColor>Press ☆ beside a name to star it</Text>}
            {starredItems.filter(item => !isIdle(item)).map(item => row('Starred', item))}
            {idle.length > 0 && (
              <Button key="idle" plain dimColor onPress={() => update($, showIdle, () => !isIdleShown)}>
                {`${idle.length} idle · no use in 30+ days · ${isIdleShown ? 'Hide' : 'Show'}`}
              </Button>
            )}
            {isIdleShown && idle.map(item => row('Starred', item))}
          </Box>
        )}
      </Box>
    )

    // All skills: one source at a time, picked by chip, the first twelve then the rest on request.
    const chip = await read($, scope)
    const isAll = await read($, showAll)
    const picked = list.find(section => section.title === chip)
    const rows = sorted(picked?.items ?? [])
    const everything = (
      <Box key="section:All skills" flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold>All skills</Text>
          <Text dimColor>{`by ${SORT_WORD[order]}`}</Text>
        </Box>
        <Box key="chips" columnGap={2} flexWrap="wrap">
          {SOURCES.map(source => {
            const items = list.find(section => section.title === source)?.items ?? []
            return (
              <Box key={`chip-box:${source}`}>
                <Button key={`chip:${source}`} plain dimColor={chip !== source} onPress={() => setScope($, source)}>
                  {`${source} ${items.length}`}
                </Button>
                {items.some(item => item.issues?.length) && <Text color="warning">•</Text>}
              </Box>
            )
          })}
        </Box>
        <Text dimColor>{picked?.folders.join(' · ') ?? ''}</Text>
        {rows.length === 0 && <Text dimColor>none</Text>}
        {(isAll ? rows : rows.slice(0, FIRST_ROWS)).map(item => row('All', item))}
        {!isAll && rows.length > FIRST_ROWS && (
          <Button key="show-all" plain dimColor onPress={() => update($, showAll, () => true)}>
            {`Show all ${rows.length}`}
          </Button>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" rowGap={1}>
        {header}
        {field}
        {health}
        {sorter}
        {active}
        {starSection}
        {everything}
        {footer}
      </Box>
    )
  })
}
