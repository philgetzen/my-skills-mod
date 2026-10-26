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
