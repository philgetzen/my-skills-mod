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

test('four sources by chip, rows open the detail view, which opens the file or the Customize page', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
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

  const verify = '/home/u/.config/skillshare/skills/verify/SKILL.md'
  const talk = 'claude://claude.ai/customize/skills/yours/id/skill_01ABC'
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'chip:Global' }))?.text).toBe('Global 1')
    expect((await ui.find({ key: 'chip:User' }))?.text).toBe('User 0')
    expect((await ui.find({ key: 'chip:Account' }))?.text).toBe('Account 1')
    expect((await ui.find({ key: 'chip:Project' }))?.text).toBe('Project 1')
    expect(await ui.find({ key: `open:All:${verify}` })).toBeDefined()
    await ui.press({ key: 'chip:Project' })
    expect(await ui.find({ key: 'open:All:/proj/.claude/skills/good/SKILL.md' })).toBeDefined()
    expect(await ui.find({ key: 'open:All:/proj/.claude/skills/evil/SKILL.md' })).toBeUndefined()
    await ui.press({ key: 'chip:Account' })
    expect(await ui.find({ key: 'open:All:claude://claude.ai/customize/skills/yours/id/pdf' })).toBeUndefined()
    expect(await ui.find({ key: 'open:All:claude://claude.ai/customize/skills/yours/id/skill_x/../settings' })).toBeUndefined()
    await ui.press({ key: 'chip:Global' })
    // A row opens the detail view; its first action opens the file.
    await ui.press({ key: `open:All:${verify}` })
    expect((await ui.find({ key: 'open-file' }))?.text).toBe('Open SKILL.md')
    expect((await ui.find({ type: 'Text', text: 'Checks the work twice.' }))).toBeDefined()
    await ui.press({ key: 'open-file' })
    await ui.press({ key: 'back' })
    await ui.press({ key: 'chip:Account' })
    await ui.press({ key: `open:All:${talk}` })
    expect(await ui.find({ key: 'reveal' })).toBeUndefined()
    await ui.press({ key: 'open-file' })
    await ui.press({ key: 'back' })
    await ui.press({ key: 'chip:Global' })
    await ui.unmount()
  }
  const file = ['open', '-t', verify]
  const link = ['open', talk]
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
  const verify = '/home/u/.config/skillshare/skills/verify/SKILL.md'
  // verify was never used, so once starred it sits in the idle fold.
  const idle = async (ui: any) => (await ui.find({ key: 'idle' }))?.text

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await idle(ui)).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Press ☆/ })).toBeDefined()
    await ui.press({ key: `star:All:${verify}` })
    expect(await idle(ui)).toBe('1 idle · no use in 30+ days · Show')
    expect((await ui.find({ key: `star:All:${verify}` }))?.text).toBe('★')
    await ui.unmount()

    // A new session reloads stars from the store; without the store write it would show none.
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const again = await $.ui.mount({ ...PANE, surface })
    expect(await idle(again)).toBe('1 idle · no use in 30+ days · Show')
    await again.press({ key: `star:All:${verify}` })
    expect(await idle(again)).toBeUndefined()
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
  const star = async (ui: any) => (await ui.find({ key: `star:All:${verify}` }))?.text
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await star(ui)).toBe('☆')

  // Starring here keeps what the other thread starred meanwhile.
  disk.starred = ['/elsewhere/SKILL.md']
  await ui.press({ key: `star:All:${verify}` })
  expect(disk.starred).toEqual(['/elsewhere/SKILL.md', verify])

  // Refresh shows the other thread's change.
  disk.starred = ['/elsewhere/SKILL.md']
  await ui.press({ key: 'refresh' })
  expect(await star(ui)).toBe('☆')
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
  expect(await ui.find({ type: 'Text', text: '2×' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '3d' })).toBeDefined()
  expect((await ui.find({ key: 'open:All:/home/u/.config/skillshare/skills/verify/SKILL.md' }))?.props.dimColor).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /^Uses since / }))?.text).toContain('preloads included')
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

  expect((await ui.find({ key: 'chip:User' }))?.text).toBe('User 3')
  // gone, mine and verify: three names, one row for the collision and one per kind in User.
  expect((await ui.find({ type: 'Text', text: /need attention$/ }))?.text).toBe('3 skills need attention')
  expect(await ui.find({ type: 'Text', text: 'Name collision · Global and User' })).toBeDefined()
  expect(await ui.find({ key: 'fix:verify' })).toBeDefined()
  for (const kind of ['dangling', 'bare', 'unmanaged']) expect(await ui.find({ key: `review:${kind}:User` })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: '1 User skill' })).length).toBe(3)
  await ui.press({ key: 'chip:User' })
  // Each flag reads as a warning in the detail view that says what is wrong and what to do.
  const flags: [string, RegExp][] = [
    ['/home/u/.claude/skills/mine/SKILL.md', /^No description: .*Add a description: line/],
    ['/home/u/.claude/skills/mine/SKILL.md', /^Not in your Global folder: .*skillshare collect/],
    ['/home/u/.claude/skills/gone', /^Broken link: .*Delete the link/],
  ]
  for (const [target, flag] of flags) {
    await ui.press({ key: `open:All:${target}` })
    expect((await ui.find({ type: 'Text', text: flag }))?.props.color).toBe('warning')
    await ui.press({ key: 'back' })
  }
  expect(reads).not.toContain('/home/u/.claude/skills/gone/SKILL.md')
  // The link may lead to any file (a repo can point one at ~/.ssh), so its detail offers nothing to open.
  await ui.press({ key: 'open:All:/home/u/.claude/skills/gone' })
  expect(await ui.find({ key: 'open-file' })).toBeUndefined()
  expect(opened).toEqual([])
  await ui.unmount()
})

test('Active here lists the skills used most in this repo once there are five uses', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
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
  expect(await before.find({ type: 'Text', text: 'Active here' })).toBeUndefined()
  await before.unmount()

  await $.skill.prompt({ skill: 'verify', text: 'x' })

  expect(disk.usage.byName.verify.byWorkspace).toEqual({ '/main': 5 })

  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await after.find({ type: 'Text', text: 'Active here' })).toBeDefined()
  // The worktree's main repository names the section.
  expect(await after.find({ type: 'Text', text: '/main' })).toBeDefined()
  expect(await after.find({ key: 'open:Active here:/home/u/.config/skillshare/skills/verify/SKILL.md' })).toBeDefined()
  await after.unmount()
})

test('a collapsed section hides its rows and stays collapsed', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const DAY = 24 * 60 * 60 * 1000
  const target = '/home/u/.config/skillshare/skills/verify/SKILL.md'
  const verify = `open:Starred:${target}`
  const disk: Record<string, any> = {
    starred: [target],
    usage: { since: DAY, byName: { verify: { count: 1, lastUsed: 39 * DAY, byWorkspace: { '/x': 1 } } } },
  }
  mock.clock(on, { now: 40 * DAY })
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
  await ui.press({ key: 'collapse:Starred' })
  const collapsed = {
    row: await ui.find({ key: verify }),
    arrow: (await ui.find({ key: 'collapse:Starred' }))?.text,
    title: (await ui.find({ type: 'Text', text: 'Starred' }))?.text,
    saved: disk.collapsed,
  }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await ui.press({ key: 'refresh' })
  const reloaded = await ui.find({ key: verify })
  await ui.press({ key: 'collapse:Starred' })
  expect({ ...collapsed, reloaded, reopened: (await ui.find({ key: verify })) !== undefined, saved2: disk.collapsed }).toEqual({
    row: undefined, arrow: '▶\uFE0E', title: 'Starred', saved: ['Starred'],
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
    .toEqual({ position: undefined, border: 'round', label: 'Sort' })
  await ui.unmount()
})

test('one saved sort orders every list', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
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
  // Both uses are moments old, so both starred skills are listed, not idle.
  mock.clock(on, { now: 1000 })
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
    return ['All', 'Starred', 'Active here'].map(list =>
      buttons.filter(one => one.key?.startsWith(`open:${list}:`)).map(one => one.text))
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
  // While importing, a skill with no uses yet reads as pending, not as never used.
  await ui.press({ key: 'chip:Project' })
  expect(await ui.find({ type: 'Text', text: 'never' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '…' })).toBeDefined()
  await ui.press({ key: 'open:All:/proj/.claude/skills/good/SKILL.md' })
  expect(await ui.find({ type: 'Text', text: 'updating' })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'chip:Global' })
  await clock.advance(2000)
  expect(disk.history.byName.verify).toMatchObject({ count: 3, lastUsed: 20 * DAY, byWorkspace: { '/main': 2, '/dead': 1 } })
  expect(disk.history.version).toBe(3)
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
  expect(await ui.find({ type: 'Text', text: '4×' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '5d' })).toBeDefined()
  // A skill never used is drawn dim, a used one at full strength.
  // (With no folder set, Global is ~/.claude/skills, where verify is a link.)
  expect((await ui.find({ key: 'open:All:/home/u/.claude/skills/verify' }))?.props.dimColor).toBe(false)
  await ui.press({ key: 'chip:Project' })
  expect((await ui.find({ key: 'open:All:/proj/.claude/skills/good/SKILL.md' }))?.props.dimColor).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'never' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^Uses since / }))?.text).toBe(
    `Uses since ${new Date(10 * DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, preloads included`)
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

  expect(disk.history.version).toBe(3)
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

  expect(await ui.find({ key: 'open:All:/home/u/.claude/skills/mine/SKILL.md' })).toBeDefined()
  expect((await ui.find({ key: 'chip:Global' }))?.text).toBe('Global 1')
  expect((await ui.find({ key: 'chip:User' }))?.text).toBe('User 1')
  expect(await ui.find({ type: 'Text', text: /need attention$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '•' })).toBeUndefined()
  await ui.press({ key: 'chip:User' })
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

test('the list walk: health rows, Review picks the chip, search shows matches, the idle fold opens and closes', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const files: Record<string, string> = {
    '/home/u/.config/skillshare/skills/verify/SKILL.md': FILES['/home/u/.config/skillshare/skills/verify/SKILL.md']!,
    '/home/u/.claude/skills/drafts/SKILL.md': '---\ndescription: Old drafts\n---',
    '/home/u/.claude/skills/notes/SKILL.md': '---\ndescription: Old notes\n---',
    '/home/u/.claude/skills/synced/b1/manifest.json': JSON.stringify({ skills: [{ skillId: 'skill_01V', name: 'verify', description: 'Account copy' }] }),
  }
  const dirs: Record<string, any[]> = {
    '/home/u/.config/skillshare/skills': [{ name: 'verify', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }],
    '/home/u/.claude/skills': [
      { name: 'drafts', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
      { name: 'notes', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
      { name: 'synced', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
    ],
    '/home/u/.claude/skills/synced': [{ name: 'b1', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }],
  }
  const drafts = '/home/u/.claude/skills/drafts/SKILL.md'
  const disk: Record<string, any> = { starred: [drafts] }
  mock.clock(on)
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => { disk[e.key] = e.value; return { value: undefined } })
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

  // Health card: verify, drafts and notes; one collision row, one grouped User row.
  expect((await ui.find({ type: 'Text', text: /need attention$/ }))?.text).toBe('3 skills need attention')
  expect(await ui.find({ type: 'Text', text: 'Name collision · Global and Account' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2 User skills' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Not in your Global folder' })).toBeDefined()
  expect((await ui.find({ key: 'chip:User' }))?.props.dimColor).toBe(true)
  await ui.press({ key: 'review:unmanaged:User' })
  expect({ user: (await ui.find({ key: 'chip:User' }))?.props.dimColor, global: (await ui.find({ key: 'chip:Global' }))?.props.dimColor,
    saved: disk.scope, row: (await ui.find({ key: `open:All:${drafts}` })) !== undefined })
    .toEqual({ user: false, global: true, saved: 'User', row: true })

  // Search: the results replace the sections below the field, each row with its source.
  await ui.press({ key: 'search' })
  await ui.input({ key: 'query', text: 'notes', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: '1 match across all sources · by recent' })).toBeDefined()
  expect(await ui.find({ key: 'open:Search:/home/u/.claude/skills/notes/SKILL.md' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /need attention$/ })).toBeUndefined()
  await ui.input({ key: 'query', text: 'account', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: '1 match across all sources · by recent' })).toBeDefined()
  await ui.input({ key: 'query', text: 'zzz', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: 'No skills match "zzz"' })).toBeDefined()
  await ui.press({ key: 'clear-search' })
  expect(await ui.find({ type: 'Text', text: /need attention$/ })).toBeDefined()

  // Starred: drafts was never used, so it folds into the idle row until shown.
  expect(await ui.find({ key: `open:Starred:${drafts}` })).toBeUndefined()
  expect((await ui.find({ key: 'idle' }))?.text).toBe('1 idle · no use in 30+ days · Show')
  await ui.press({ key: 'idle' })
  expect(await ui.find({ key: `open:Starred:${drafts}` })).toBeDefined()
  expect((await ui.find({ key: 'idle' }))?.text).toBe('1 idle · no use in 30+ days · Hide')
  await ui.press({ key: 'idle' })
  expect(await ui.find({ key: `open:Starred:${drafts}` })).toBeUndefined()
  await ui.unmount()
})

test('a collision is fixed only after a pick and a confirm, through skillshare or the Trash, never rm', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const shared = '/home/u/.config/skillshare/skills'
  const files: Record<string, string> = {
    [`${shared}/verify/SKILL.md`]: FILES[`${shared}/verify/SKILL.md`]!,
    [`${shared}/agents/SKILL.md`]: '---\ndescription: A name skillshare reserves\n---',
    '/home/u/.claude/skills/synced/b1/manifest.json': JSON.stringify({ skills: [
      { skillId: 'skill_01V', name: 'verify', description: 'Account copy' },
      { skillId: 'skill_02A', name: 'agents', description: 'Account copy' },
    ] }),
  }
  const dirs: Record<string, any[]> = {
    [shared]: [
      { name: 'verify', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
      { name: 'agents', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 },
    ],
    '/home/u/.claude/skills': [{ name: 'synced', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }],
    '/home/u/.claude/skills/synced': [{ name: 'b1', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }],
  }
  const ran: { argv: string[]; cwd?: string }[] = []
  const toasts: string[] = []
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e: any) => { toasts.push(e.text); return { value: undefined } })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/home/u' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in files || e.path in dirs }))
  on('fs.list', (_, e: any) => ({ value: dirs[e.path] ?? [] }))
  on('fs.read', (_, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'missing' }) as any)
  on('process.run', (_, e: any) => {
    ran.push({ argv: [...e.argv], cwd: e.init?.cwd })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const removes = async () => (await ui.findAll({ type: 'Button' })).filter(one => one.key?.startsWith('remove:')).map(one => one.text)
  const global = `${shared}/verify/SKILL.md`
  const account = 'claude://claude.ai/customize/skills/yours/id/skill_01V'

  await ui.press({ key: 'fix:verify' })
  expect(await ui.find({ type: 'Text', text: 'Two skills answer to /verify' })).toBeDefined()
  // Nothing is picked at first, so there is nothing to remove.
  expect(await removes()).toEqual([])
  // Keeping Global leaves the Account copy, which only claude.ai can remove.
  await ui.press({ key: `keep:${global}` })
  expect({ keep: (await ui.find({ key: `keep:${global}` }))?.text, removes: await removes(),
    customize: (await ui.find({ key: `customize:${account}` }))?.text })
    .toEqual({ keep: 'Keep Global', removes: [], customize: 'Open Customize › Skills' })
  await ui.press({ key: `keep:${account}` })
  expect(await removes()).toEqual(['Remove Global copy'])
  await ui.press({ key: `remove:${global}` })
  expect(ran).toEqual([])
  expect(await ui.find({ type: 'Text', text: 'Move the Global copy to trash?' })).toBeDefined()
  await ui.press({ key: 'confirm-remove' })
  expect(ran).toEqual([{ argv: ['skillshare', 'uninstall', 'verify', '-g', '--force'], cwd: '/home/u' }])
  expect(toasts).toEqual(['Removed. Commit in ~/.config/skillshare and run skillshare sync.'])
  // The detail view stays open after the fix.
  expect(await ui.find({ key: 'back' })).toBeDefined()

  // A name skillshare would read as a keyword goes to the Trash instead: the skill's folder, under a dated name.
  await ui.press({ key: 'back' })
  await ui.press({ key: 'fix:agents' })
  await ui.press({ key: 'keep:claude://claude.ai/customize/skills/yours/id/skill_02A' })
  await ui.press({ key: `remove:${shared}/agents/SKILL.md` })
  await ui.press({ key: 'confirm-remove' })
  expect(ran[1]?.argv.slice(0, 2)).toEqual(['mv', `${shared}/agents`])
  expect(ran[1]?.argv[2]).toMatch(/^\/home\/u\/\.Trash\/agents \d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d$/)
  expect(toasts.at(-1)).toBe('Moved to Trash.')
  expect(ran.some(one => one.argv[0] === 'rm')).toBe(false)
  await ui.unmount()
})

test('the Plugins chip lists enabled plugin skills, opens their SKILL.md, and imports their uses since tracking began', { options: { globalSkillsDir: '~/.config/skillshare/skills' } }, async ($, on) => {
  const DAY = 24 * 60 * 60 * 1000
  const clock = mock.clock(on, { now: 40 * DAY })
  const install = '/home/u/.claude/plugins/cache/official/superpowers/7.0.0'
  const brainstorm = `${install}/skills/brainstorming/SKILL.md`
  // Live tracking began on day 35, the history import already ran at version 2;
  // the plugin skill was used on day 38, after tracking began, and never counted.
  const disk: Record<string, any> = {
    usage: { since: 35 * DAY, byName: {} },
    history: { byName: {}, importedAt: 30 * DAY, oldest: 5 * DAY, attempts: 0, version: 2 },
  }
  const row = JSON.stringify({
    type: 'assistant', timestamp: new Date(38 * DAY).toISOString(), cwd: '/proj',
    message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'superpowers:brainstorming' } }] },
  })
  const projects = '/home/u/.claude/projects'
  const files: Record<string, string> = { ...FILES,
    [`${projects}/-proj/s1.jsonl`]: row,
    [brainstorm]: '---\ndescription: Shape it first\n---',
    '/home/u/.claude/plugins/installed_plugins.json': JSON.stringify({ version: 2, plugins: {
      'superpowers@official': [{ scope: 'user', installPath: install }],
    } }),
  }
  const dirs: Record<string, any[]> = { ...DIRS,
    [projects]: [{ name: '-proj', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }],
    [`${projects}/-proj`]: [{ name: 's1.jsonl', kind: 'file', isLink: false, size: 600, mtimeMs: 0 }],
  }
  const opened: string[][] = []
  on('store.get', (_, e: any) => ({ value: disk[e.key] }))
  on('store.set', (_, e: any) => { disk[e.key] = e.value; return { value: undefined } })
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('command.list', () => ({ value: [
    { name: 'superpowers:brainstorming', description: 'Shape it first', source: 'plugin', plugin: 'superpowers' },
    { name: 'simplify', description: 'Built in', source: 'builtin' },
    { name: 'mcp__notion__search', description: 'From a server', source: 'mcp' },
  ] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path === '/proj/.git' || e.path in files || e.path in dirs }))
  on('fs.list', (_, e: any) => ({ value: dirs[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'missing' }) as any)
  on('process.run', (_, e: any) => { opened.push([...e.argv]); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })

  on('skill.prompt', () => ({ text: 'expanded' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // Used again before the delayed import runs: the day-38 use must still import.
  await $.skill.prompt({ skill: 'superpowers:brainstorming', text: 'raw' })
  await clock.advance(2000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'chip:Plugins' }))?.text).toBe('Plugins 1')
  await ui.press({ key: 'chip:Plugins' })
  expect((await ui.find({ key: `open:All:${brainstorm}` }))?.text).toBe('superpowers:brainstorming')
  await ui.press({ key: `open:All:${brainstorm}` })
  await ui.press({ key: 'open-file' })
  expect(opened).toContainEqual(['open', '-t', brainstorm])
  expect(trendPoints(disk.history.byName['superpowers:brainstorming']?.days, 40 * DAY + 2000)[9]).toBe(1)
  await ui.unmount()
})

test('a narrow pane cuts long names to fit, drops the trend, and wraps the header and sort controls', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const long = 'anthropic-skills:consulting-insights-writer'
  on('command.register', () => ({ value: { command: 'my-skills' } }))
  on('command.list', () => ({ value: [{ name: long, description: 'Drafts insights', source: 'plugin', plugin: 'anthropic-skills' }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: '/home/u' }))
  on('session.root', () => ({ value: '/proj' }))
  on('fs.exists', (_, e: any) => ({ value: e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 30 } })
  await ui.press({ key: 'chip:Plugins' })
  // 30 cells: star 1, count 5, age 5 and three gaps leave the name 16.
  const name = (await ui.find({ key: `open:All:plugin:${long}` }))?.text ?? ''
  expect({ fits: name.length <= 16, cut: name.includes('…'), tail: name.endsWith('writer'),
    trend: await ui.find({ type: 'Svg' }),
    header: (await ui.find({ key: 'header' }))?.props.flexWrap,
    sort: (await ui.find({ key: 'sort-options' }))?.props.flexWrap })
    .toEqual({ fits: true, cut: true, tail: true, trend: undefined, header: 'wrap', sort: 'wrap' })
  await ui.unmount()
})
