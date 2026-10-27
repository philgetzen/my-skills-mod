import { expect, mock, test } from 'claude-code/testing'

import { trendPoints } from './register'

const PANE = {
  plugin: 'my-skills',
  component: 'Pane',
  requestId: 'my-skills',
  props: { title: 'My skills', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const FILES: Record<string, string> = {
  '/home/u/.config/skillshare/skills/verify/SKILL.md': '---\nname: verify\ndescription: >\n  Checks the work\n  twice.\n---\nbody',
  '/home/u/.claude/skills/synced/b1/manifest.json': JSON.stringify({ skills: [
    { skillId: 'pdf', name: 'pdf', description: 'Anthropic' },
    { skillId: 'skill_01ABC', name: 'lightning-talk', description: 'Talk builder' },
    { skillId: 'skill_x/../settings', name: 'sneaky', description: 'bad id' },
  ] }),
  '/proj/.claude/skills/good/SKILL.md': '---\ndescription: Fine\n---',
  '/proj/.claude/skills/evil/SKILL.md': 'PRIVATE KEY',
}
const DIRS: Record<string, any[]> = {
  '/home/u/.config/skillshare/skills': [{ name: 'verify', kind: 'other', isLink: true, size: 0, mtimeMs: 0 }],
  '/home/u/.claude/skills': [
    { name: 'verify', kind: 'other', isLink: true, size: 0, mtimeMs: 0 },
    { name: 'synced', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
  ],
  '/proj/.claude/skills': [
    { name: 'good', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
    { name: 'evil', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
  ],
  '/home/u/.claude/skills/synced': [{ name: 'b1', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }],
}

test('four sections, clicks open the file or the Customize page', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  mock.clock(on)
  const opened: string[][] = []
  mock.store(on)
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  const reads: string[] = []
  const REAL: Record<string, string> = {
    '/proj': '/proj',
    '/proj/.claude/skills/good/SKILL.md': '/proj/.claude/skills/good/SKILL.md',
    '/proj/.claude/skills/evil/SKILL.md': '/home/u/.ssh/id_ed25519',
  }
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: REAL[e.path] } }))
  on('fs.read', (_, e: any) => reads.push(e.path) && (e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)
  on('process.run', (_, e: any) => { opened.push([...e.argv]); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'open:Global:/home/u/.config/skillshare/skills/verify/SKILL.md' })).toBeDefined()
    expect(await ui.find({ key: 'open:User:/home/u/.claude/skills/synced/SKILL.md' })).toBeUndefined()
    expect(await ui.find({ key: 'open:Account:claude://claude.ai/customize/skills/yours/id/pdf' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /User \(/ }))?.text).toBe('User (0)')
    expect((await ui.find({ type: 'Text', text: /Account \(/ }))?.text).toBe('Account (1)')
    expect((await ui.find({ type: 'Text', text: /Project \(/ }))?.text).toBe('Project (1)')
    expect(await ui.find({ key: 'open:Project:/proj/.claude/skills/good/SKILL.md' })).toBeDefined()
    expect(await ui.find({ key: 'open:Project:/proj/.claude/skills/evil/SKILL.md' })).toBeUndefined()
    expect(await ui.find({ key: 'open:Account:claude://claude.ai/customize/skills/yours/id/skill_x/../settings' })).toBeUndefined()
    await ui.press({ key: 'open:Global:/home/u/.config/skillshare/skills/verify/SKILL.md' })
    await ui.press({ key: 'open:Account:claude://claude.ai/customize/skills/yours/id/skill_01ABC' })
    await ui.unmount()
  }
  const file = ['open', '-t', '/home/u/.config/skillshare/skills/verify/SKILL.md']
  const link = ['open', 'claude://claude.ai/customize/skills/yours/id/skill_01ABC']
  expect(opened).toEqual([file, link, file, link])
  expect(reads).not.toContain('/proj/.claude/skills/evil/SKILL.md')
  expect(reads).toContain('/proj/.claude/skills/good/SKILL.md')
})

test('stars move a skill into Starred and survive a new session', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/home/u' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.read', (_, e: any) => (e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const count = async (ui: any) => (await ui.find({ type: 'Text', text: /Starred \(/ }))?.text

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await count(ui)).toBe('Starred (0)')
    await ui.press({ key: 'star:Global:/home/u/.config/skillshare/skills/verify/SKILL.md' })
    expect(await count(ui)).toBe('Starred (1)')
    expect(await ui.find({ key: 'open:Starred:/home/u/.config/skillshare/skills/verify/SKILL.md' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: 'Global · ~/.config/skillshare/skills/verify/SKILL.md' }))?.props.dimColor).toBe(true)
    await ui.unmount()

    // A new session reloads stars from the store; without the store write it would show 0.
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const again = await $.ui.mount({ ...PANE, surface })
    expect(await count(again)).toBe('Starred (1)')
    await again.press({ key: 'star:Starred:/home/u/.config/skillshare/skills/verify/SKILL.md' })
    expect(await count(again)).toBe('Starred (0)')
    await again.unmount()
  }
})

test('stars another thread saved are kept and shown', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  mock.clock(on)
  // The store as it is on disk; a second thread writes to it while this pane is open.
  const disk: Record<string, unknown> = {}
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => { disk[e.key] = e.value; return { value: undefined } })
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/home/u' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.read', (_, e: any) => (e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const verify = '/home/u/.config/skillshare/skills/verify/SKILL.md'
  const count = async (ui: any) => (await ui.find({ type: 'Text', text: /Starred \(/ }))?.text
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await count(ui)).toBe('Starred (0)')

  // Starring here keeps what the other thread starred meanwhile.
  disk.starred = ['/elsewhere/SKILL.md']
  await ui.press({ key: `star:Global:${verify}` })
  expect(disk.starred).toEqual(['/elsewhere/SKILL.md', verify])

  // Refresh shows the other thread's change.
  disk.starred = ['/elsewhere/SKILL.md']
  await ui.press({ key: 'refresh' })
  expect(await count(ui)).toBe('Starred (0)')
  await ui.unmount()
})

test('counts a use, shows it on the row, and leaves the prompt untouched', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const DAY = 24 * 60 * 60 * 1000
  const clock = mock.clock(on, { now: 40 * DAY })
  // One malformed entry already saved; the valid one beside it must survive.
  const old = { count: 7, lastUsed: DAY, byWorkspace: { '/x': 7 } }
  const disk: Record<string, any> = { usage: { byName: { old, bad: { count: 'x' } } } }
  let full = false
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => {
    if (full) { full = false; return { deny: 'full' } }
    disk[e.key] = e.value
    return { value: undefined }
  })
  on('skill.prompt', () => ({ text: 'expanded' }))
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(await $.skill.prompt({ skill: 'verify', text: 'raw' })).toEqual({ text: 'expanded' })
  expect(await $.skill.prompt({ skill: 'verify', text: 'raw' })).toEqual({ text: 'expanded' })
  await clock.advance(3 * DAY)
  expect(await $.skill.prompt({ skill: 'clear', text: 'raw' })).toEqual({ text: 'expanded' })
  full = true
  expect(await $.skill.prompt({ skill: 'verify', text: 'raw' })).toEqual({ text: 'expanded' })

  expect(disk.usage?.byName.verify).toMatchObject({ count: 2, lastUsed: 40 * DAY, byWorkspace: { '/proj': 2 } })
  expect(disk.usage.byName.clear).toBeUndefined()
  expect(disk.usage.byName.old).toEqual(old)
  expect(disk.usage.byName.bad).toBeUndefined()
  expect(disk.usage.since).toBe(40 * DAY)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /2×\s·\s3d\sago/ })).toBeDefined()
  expect((await ui.find({ key: 'open:Global:/home/u/.config/skillshare/skills/verify/SKILL.md' }))?.props.dimColor).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /^Counts since / }))?.text).toContain('preloads included')
  await ui.unmount()
})

test('health flags a dangling link, a bare skill and a name collision, without reading the link', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const files: Record<string, string> = {
    '/home/u/.config/skillshare/skills/verify/SKILL.md': FILES['/home/u/.config/skillshare/skills/verify/SKILL.md']!,
    '/home/u/.claude/skills/mine/SKILL.md': '---\nname: mine\n---\nbody',
    '/home/u/.claude/commands/verify.md': '---\ndescription: Command shim\n---\nbody',
  }
  const dirs: Record<string, any[]> = {
    '/home/u/.config/skillshare/skills': [{ name: 'verify', kind: 'other', isLink: true, size: 0, mtimeMs: 0 }],
    '/home/u/.claude/skills': [
      { name: 'gone', kind: 'other', isLink: true, size: 0, mtimeMs: 0 },
      { name: 'mine', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
    ],
    '/home/u/.claude/commands': [{ name: 'verify.md', kind: 'file', isLink: false, size: 0, mtimeMs: 0 }],
  }
  const reads: string[] = []
  const opened: string[][] = []
  mock.clock(on)
  mock.store(on)
  on('process.run', (_, e: any) => { opened.push([...e.argv]); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/home/u' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in files || e.path in dirs }))
  on('fs.list', (_, e: any) => ({ value: dirs[e.path] ?? [] }))
  on('fs.read', (_, e: any) => reads.push(e.path) && (e.path in files ? { value: files[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect((await ui.find({ type: 'Text', text: /User \(/ }))?.text).toBe('User (3)')
  expect(await ui.find({ type: 'Text', text: /3 health/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 health/ })).toBeDefined()
  // Each flag reads as a warning that says what is wrong and what to do.
  for (const flag of [/^No description: .*Add a description: line/, /^Not in your Global folder: .*skillshare collect/,
    /^Broken link: .*Delete the link/, /^Same name in Global: both answer to \/verify.*Rename or remove one/]) {
    expect((await ui.find({ type: 'Text', text: flag }))?.props.color).toBe('warning')
  }
  expect(reads).not.toContain('/home/u/.claude/skills/gone/SKILL.md')
  // The link may lead to any file (a repo can point one at ~/.ssh), so the row opens nothing.
  await ui.press({ key: 'open:User:/home/u/.claude/skills/gone' })
  expect(opened).toEqual([])
  await ui.unmount()
})

test('lists the skills used most in this repo once there are five uses', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const disk: Record<string, any> = {
    usage: { since: 1, byName: { verify: { count: 4, lastUsed: 1, byWorkspace: { '/main': 4 } } } },
  }
  mock.clock(on)
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => { disk[e.key] = e.value; return { value: undefined } })
  on('skill.prompt', () => ({ text: 'expanded' }))
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path === '/proj/.git' || e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path === '/proj/.git' ? { value: 'gitdir: /main/.git/worktrees/topic\n' } : e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const before = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await before.find({ type: 'Text', text: /Most used here/ })).toBeUndefined()
  await before.unmount()

  await $.skill.prompt({ skill: 'verify', text: 'x' })

  expect(disk.usage.byName.verify.byWorkspace).toEqual({ '/main': 5 })

  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await after.find({ type: 'Text', text: /Most used here/ }))?.text).toBe('Most used here (1)')
  expect(await after.find({ key: 'open:Most used here:/home/u/.config/skillshare/skills/verify/SKILL.md' })).toBeDefined()
  await after.unmount()
})

test('a collapsed section hides its rows and stays collapsed', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const verify = 'open:Global:/home/u/.config/skillshare/skills/verify/SKILL.md'
  const disk: Record<string, any> = {}
  mock.clock(on)
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => { disk[e.key] = e.value; return { value: undefined } })
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: verify })).toBeDefined()
  await ui.press({ key: 'collapse:Global' })
  const collapsed = {
    row: await ui.find({ key: verify }),
    folders: await ui.find({ type: 'Text', text: '~/.config/skillshare/skills' }),
    arrow: (await ui.find({ key: 'collapse:Global' }))?.text,
    title: (await ui.find({ type: 'Text', text: /Global \(/ }))?.text,
    saved: disk.collapsed,
  }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await ui.press({ key: 'refresh' })
  const reloaded = await ui.find({ key: verify })
  await ui.press({ key: 'collapse:Global' })
  expect({ ...collapsed, reloaded, reopened: (await ui.find({ key: verify })) !== undefined, saved2: disk.collapsed }).toEqual({
    row: undefined, folders: undefined, arrow: '▶\uFE0E', title: 'Global (1)', saved: ['Global'],
    reloaded: undefined, reopened: true, saved2: [],
  })
  await ui.unmount()
})

test('the sort options sit in a box at the top of the list', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, scroll: { offset: 7, bodyRows: 20 } } })
  const box = await ui.find({ key: 'sort-options' })
  expect({ position: (await ui.find({ key: 'sort-row' }))?.props.position, border: box?.props.borderStyle,
    label: (await ui.find({ type: 'Text', text: /^Sort/ }))?.text })
    .toEqual({ position: undefined, border: 'round', label: 'Sort:' })
  await ui.unmount()
})

test('one saved sort orders every section', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const alpha = '/home/u/.config/skillshare/skills/alpha/SKILL.md'
  const verify = '/home/u/.config/skillshare/skills/verify/SKILL.md'
  const files: Record<string, string> = { ...FILES, [alpha]: '---\ndescription: Alpha\n---' }
  const dirs = { ...DIRS, '/home/u/.config/skillshare/skills': [
    ...DIRS['/home/u/.config/skillshare/skills']!,
    { name: 'alpha', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
  ] }
  const disk: Record<string, any> = {
    starred: [alpha, verify],
    usage: { since: 1, byName: {
      alpha: { count: 9, lastUsed: 10, byWorkspace: { '/proj': 9 } },
      verify: { count: 2, lastUsed: 20, byWorkspace: { '/proj': 2 } },
    } },
  }
  mock.clock(on)
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => { disk[e.key] = e.value; return { value: undefined } })
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in files || e.path in dirs }))
  on('fs.list', (_, e: any) => ({ value: dirs[e.path as keyof typeof dirs] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const orders = async () => {
    const buttons = await ui.findAll({ type: 'Button' })
    return ['Global', 'Starred', 'Most used here'].map(section =>
      buttons.filter(one => one.key?.startsWith(`open:${section}:`)).map(one => one.text).reverse())
  }
  const recent = await orders()
  await ui.press({ key: 'sort:count' })
  const count = await orders()
  await ui.press({ key: 'sort:name' })
  const name = await orders()
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await ui.press({ key: 'refresh' })
  expect({ recent, count, name, reloaded: await orders(), saved: disk.sort,
    selected: (await ui.find({ key: 'sort:name' }))?.props.dimColor }).toEqual({
    recent: Array(3).fill(['verify', 'alpha']),
    count: Array(3).fill(['alpha', 'verify']),
    name: Array(3).fill(['alpha', 'verify']),
    reloaded: Array(3).fill(['alpha', 'verify']), saved: 'name', selected: false,
  })
  await ui.unmount()
})

test('imports history once in the background, skipping subagents and files over 4 MiB', async ($, on) => {
  const DAY = 24 * 60 * 60 * 1000
  const clock = mock.clock(on, { now: 40 * DAY })
  const live = { since: 35 * DAY, byName: { verify: { count: 1, lastUsed: 35 * DAY, byWorkspace: { '/main': 1 } } } }
  const disk: Record<string, any> = { usage: live }
  const skillRow = (skill: string, at: number, cwd: string) => JSON.stringify({
    type: 'assistant', timestamp: new Date(at).toISOString(), cwd,
    message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] },
  })
  const typedRow = (name: string, at: number, cwd: string) => JSON.stringify({
    type: 'user', timestamp: new Date(at).toISOString(), cwd,
    message: { content: `<command-message>${name} is running…</command-message>\n<command-name>/${name}</command-name>\n<command-args></command-args>` },
  })
  const projects = '/home/u/.claude/projects'
  const big = `${projects}/-proj/big.jsonl`
  const files: Record<string, string> = { ...FILES,
    [`${projects}/-proj/s1.jsonl`]: [
      skillRow('verify', 10 * DAY, '/proj'),
      typedRow('verify', 20 * DAY, '/dead/.claude/worktrees/gone'),
      skillRow('clear', 12 * DAY, '/proj'),
      skillRow('verify', 38 * DAY, '/proj'),
      skillRow('verify', 35 * DAY - 1000, '/proj'),
      'not json',
      JSON.stringify({ type: 'api-request-shape', shape: { name: 'Skill' } }),
    ].join('\n'),
    [big]: Array(5).fill(skillRow('verify', 15 * DAY, '/proj')).join('\n'),
    [`${projects}/-proj/s1/subagents/agent-1.jsonl`]: skillRow('verify', 15 * DAY, '/proj'),
  }
  const dirs: Record<string, any[]> = { ...DIRS,
    [projects]: [{ name: '-proj', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }],
    [`${projects}/-proj`]: [
      { name: 's1.jsonl', kind: 'file', isLink: false, size: 600, mtimeMs: 0 },
      { name: 'big.jsonl', kind: 'file', isLink: false, size: 4 * 1024 * 1024 + 1, mtimeMs: 0 },
      { name: 's1', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
    ],
  }
  const reads: string[] = []
  const processes: string[][] = []
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => { disk[e.key] = e.value; return { value: undefined } })
  on('skill.prompt', () => ({ text: 'expanded' }))
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path === '/proj/.git' || e.path in files || e.path in dirs }))
  on('fs.list', (_, e: any) => ({ value: dirs[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => {
    reads.push(e.path)
    return (e.path === '/proj/.git' ? { value: 'gitdir: /main/.git/worktrees/topic\n' } : e.path in files ? { value: files[e.path] } : { deny: 'missing' }) as any
  })
  on('process.run', (_, e: any) => {
    processes.push([...e.argv])
    return { value: { exitCode: 0, stdout: skillRow('verify', 15 * DAY, '/proj'), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Importing history/ })).toBeDefined()
  await clock.advance(2000)
  expect(disk.history.byName.verify).toMatchObject({ count: 3, lastUsed: 20 * DAY, byWorkspace: { '/main': 2, '/dead': 1 } })
  expect(disk.history.version).toBe(2)
  expect(disk.history.byName.clear).toBeUndefined()
  expect(disk.history.oldest).toBe(10 * DAY)
  expect(disk.history.importedAt).toBe(40 * DAY + 2000)
  expect(disk.history.attempts).toBe(0)
  expect(disk.usage).toEqual(live)
  expect(processes).toEqual([['grep', '-h', '-F', '-e', '"name":"Skill"', '-e', '<command-name>', big]])
  expect(reads).not.toContain(big)
  expect(reads.some(path => path.includes('subagents'))).toBe(false)
  expect(reads.filter(path => path.endsWith('s1.jsonl')).length).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^Importing history/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /4×\s·\s5d\sago/ })).toBeDefined()
  // An unused skill dims once the merged history reaches back 30 days, not 30 days after install.
  expect((await ui.find({ key: 'open:Project:/proj/.claude/skills/good/SKILL.md' }))?.props.dimColor).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^Counts since / }))?.text).toBe(
    `Counts since ${new Date(10 * DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, preloads included`)
  await ui.unmount()
  const history = JSON.stringify(disk.history)
  await $.skill.prompt({ skill: 'verify', text: 'x' })
  expect(JSON.stringify(disk.history)).toBe(history)
  expect(disk.usage.byName.verify.count).toBe(2)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)
  expect(disk.usage.byName.verify.count + disk.history.byName.verify.count).toBe(5)
  expect(reads.filter(path => path.endsWith('s1.jsonl')).length).toBe(1)
})

test('a use today and a v2 history pass land in the right trend buckets without touching old counts', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const DAY = 24 * 60 * 60 * 1000
  const clock = mock.clock(on, { now: 40 * DAY })
  const stored = { count: 7, lastUsed: 12 * DAY, byWorkspace: { '/main': 7 } }
  const disk: Record<string, any> = {
    usage: { since: 35 * DAY, byName: {} },
    history: { byName: { verify: stored }, importedAt: 30 * DAY, oldest: 5 * DAY, attempts: 0 },
  }
  const row = JSON.stringify({
    type: 'assistant', timestamp: new Date(30 * DAY).toISOString(), cwd: '/proj',
    message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'verify' } }] },
  })
  const projects = '/home/u/.claude/projects'
  const files: Record<string, string> = { ...FILES, [`${projects}/-proj/s1.jsonl`]: row }
  const dirs: Record<string, any[]> = { ...DIRS,
    [projects]: [{ name: '-proj', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }],
    [`${projects}/-proj`]: [{ name: 's1.jsonl', kind: 'file', isLink: false, size: 600, mtimeMs: 0 }],
  }
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => { disk[e.key] = e.value; return { value: undefined } })
  on('skill.prompt', () => ({ text: 'expanded' }))
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path === '/proj/.git' || e.path in files || e.path in dirs }))
  on('fs.list', (_, e: any) => ({ value: dirs[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.skill.prompt({ skill: 'verify', text: 'raw' })
  await clock.advance(2000)

  expect(disk.history.version).toBe(2)
  expect(disk.history.importedAt).toBe(30 * DAY)
  expect(disk.history.byName.verify).toMatchObject(stored)
  const past = trendPoints(disk.history.byName.verify.days, 40 * DAY + 2000)
  const today = trendPoints(disk.usage.byName.verify.days, 40 * DAY + 2000)
  expect(past.length).toBe(10)
  expect(past[6]).toBe(1)
  expect(today[9]).toBe(1)
})

test('with no folder set, Global is ~/.claude/skills and nothing there is flagged as outside it', async ($, on) => {
  const files: Record<string, string> = {
    '/home/u/.claude/skills/mine/SKILL.md': '---\ndescription: Mine\n---\nbody',
    '/home/u/.claude/commands/hi.md': '---\ndescription: Says hi\n---\nbody',
  }
  const dirs: Record<string, any[]> = {
    '/home/u/.claude/skills': [
      { name: 'mine', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
      { name: 'synced', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
    ],
    '/home/u/.claude/commands': [{ name: 'hi.md', kind: 'file', isLink: false, size: 0, mtimeMs: 0 }],
  }
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/home/u' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in files || e.path in dirs }))
  on('fs.list', (_, e: any) => ({ value: dirs[e.path] ?? [] }))
  on('fs.read', (_, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ key: 'open:Global:/home/u/.claude/skills/mine/SKILL.md' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /Global \(/ }))?.text).toBe('Global (1)')
  expect((await ui.find({ type: 'Text', text: /User \(/ }))?.text).toBe('User (1)')
  expect(await ui.find({ type: 'Text', text: /health/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^~\/\.claude\/commands/ }))?.text).toBe('~/.claude/commands')
  await ui.unmount()
})

test('the pane stays closed until /my-skills opens it', async ($, on) => {
  const opens: string[] = []
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', (_, e: any) => { opens.push(e.id); return { value: { isPlaced: true } } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/home/u' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.list', () => ({ value: [] }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opens).toEqual([])
  await $.command.run({ command: 'my-skills', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(opens).toEqual(['my-skills'])
})
