import { expect, mock, test } from 'claude-code/testing'

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

test('four sections, clicks open the file or the Customize page', async ($, on) => {
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

test('stars move a skill into Starred and survive a new session', async ($, on) => {
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

test('stars another thread saved are kept and shown', async ($, on) => {
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

test('counts a use, shows it on the row, and leaves the prompt untouched', async ($, on) => {
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

  expect(disk.usage?.byName.verify).toEqual({ count: 2, lastUsed: 40 * DAY, byWorkspace: { '/proj': 2 } })
  expect(disk.usage.byName.clear).toBeUndefined()
  expect(disk.usage.byName.old).toEqual(old)
  expect(disk.usage.byName.bad).toBeUndefined()
  expect(disk.usage.since).toBe(40 * DAY)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /2× · 3d ago/ })).toBeDefined()
  expect((await ui.find({ key: 'open:Global:/home/u/.config/skillshare/skills/verify/SKILL.md' }))?.props.dimColor).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /Since / }))?.text).toContain('preloads included')
  await ui.unmount()
})

test('health flags a dangling link, a bare skill and a name collision, without reading the link', async ($, on) => {
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
  expect(await ui.find({ type: 'Text', text: /no description · not in Global/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /link points nowhere/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /also in Global/ })).toBeDefined()
  expect(reads).not.toContain('/home/u/.claude/skills/gone/SKILL.md')
  // The link may lead to any file (a repo can point one at ~/.ssh), so the row opens nothing.
  await ui.press({ key: 'open:User:/home/u/.claude/skills/gone' })
  expect(opened).toEqual([])
  await ui.unmount()
})

test('suggests the skills used most in this repo once there are five uses', async ($, on) => {
  const disk: Record<string, any> = {
    usage: { since: 1, byName: { verify: { count: 4, lastUsed: 1, byWorkspace: { '/proj': 4 } } } },
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
  on('fs.exists', (_, e: any) => ({ value: e.path in FILES || e.path in DIRS }))
  on('fs.list', (_, e: any) => ({ value: DIRS[e.path] ?? [] }))
  on('fs.stat', (_, e: any) => ({ value: { kind: e.path === '/proj' ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: false, realPath: e.path } }))
  on('fs.read', (_, e: any) => (e.path in FILES ? { value: FILES[e.path] } : { deny: 'missing' }) as any)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const before = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await before.find({ type: 'Text', text: /Suggested for this repo/ })).toBeUndefined()
  await before.unmount()

  await $.skill.prompt({ skill: 'verify', text: 'x' })

  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await after.find({ type: 'Text', text: /Suggested for this repo/ }))?.text).toBe('Suggested for this repo (1)')
  expect(await after.find({ key: 'open:Suggested for this repo:/home/u/.config/skillshare/skills/verify/SKILL.md' })).toBeDefined()
  await after.unmount()
})
