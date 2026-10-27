# my-skills: first-run history import — implementation plan

Date: 2026-10-26. From the intent note `/Users/philgetzen/Development/my-skills-mod/docs/superpowers/specs/2026-10-26-history-import-intent.md` (its cut list stands and is not reopened here). Builds on the working tree as it is: HEAD `4f6977e` plus the uncommitted sort control, `mainRepo()` keying, location lines, header row and "Counts since …" footer in `hooks/register.tsx`, `hooks/pane.test.tsx`, `types/index.d.ts` (7 tests pass).

Budget: 3.5 agent-hours (Phil, 2026-10-26: 3 h, raised to 3.5 h for the grep read of large transcripts).
Task hours: research and this plan 0.5 h (spent) + T1 0.5 h + T2 1.75 h + T3 0.5 h + advisory pass 0.25 h = 3.5 h.

## Decided by Phil (2026-10-26)

Amendment: decision 1 resolved as "read files over 4 MiB with grep where it exists, skip them where it does not" (+0.5 h on T2). Decision 2 accepted as picked (oldest counted use).

### As originally put

1. **Coverage: 59 % of Skill calls, 55 % of typed commands, because `$.fs.read` refuses files over 4 MiB.** Of Phil's 3,146 top-level transcripts, 206 are over 4 MiB and hold 928 of the 2,274 real Skill tool calls and 445 of the 997 typed slash commands; the mod cannot read them through `$.fs` (no range read, same cap for `as: "bytes"`). My pick: ship with the skip, counted in the completion receipt, and keep a `grep`-based fallback on the Cut list with these numbers. A bare "yes" starts T1. The alternative (a `$.process.run(["grep", …])` pass for the 206 files) breaks the intent's "no shell tools" constraint and adds a second parser.
2. **`since` after the import is the oldest counted use, not the oldest transcript** (the intent says transcript). With a 41 % hole, "Counts since Mar 21" would overstate coverage; the oldest counted use is what the footer can stand behind, and it costs no extra parsing (the oldest transcript's date would mean parsing every row's timestamp). My pick: oldest counted use.

## Amendment 2 (Codex Astra plan review, 2026-10-26) — overrides T1/T2/T3 where they conflict

Two Critical findings changed the storage design; two Warnings were plan defects that would fail the plan's own test and are fixed here rather than filed.

**A. History lives in its own store key, never written by live counting (fixes Critical 1, concurrent overwrite).**
- New store key `HISTORY_KEY = 'history'` holding `History = { byName: Record<string, Use>, oldest?: number, importedAt?: number, attempts: number }`. `record()` and `savedUsage()` are NOT changed to carry any marker (drop T2 step 3's `history` pass-through and the `Usage.history` type); `usage` stays exactly as live counting writes it today.
- Only the importer writes `history`: `finish()` re-reads `history`, abandons if `importedAt` is set, else writes `{ byName: found, oldest, importedAt: now, attempts }`; `fail()` re-reads and writes `attempts + 1` only when `importedAt` is unset. Two importers racing write near-identical snapshots; no live count can be lost because live counts are in a different key.
- A `history` atom (mirroring `usage`) is loaded in `refresh` and updated by `finish()`. The Pane render, Suggested, sorting and the 30-day dim read a merged view computed in render: `combined(name) = { count: live.count + hist.count, lastUsed: max, byWorkspace: summed per key }`, and the footer date is `min(usage.since, history.oldest)`. The session hook skips the import when `history.importedAt` is set or `history.attempts >= 2`.

**B. Boundary margin (fixes Critical 2, first live use counted twice).**
- `cutoff = (usage.since ?? startedAt) - BOUNDARY` with `const BOUNDARY = 5 * 60 * 1000`. A transcript row's Skill call is written before `skill.prompt` stamps `since`, by milliseconds to seconds; dropping the 5 minutes before the first live use makes imported and live sets disjoint. Error direction: undercount of at most the uses in those 5 minutes, never a double count. T1's fixture dates sit days apart, so its expected numbers do not change; T1 adds one row stamped `since - 1000` for a listed skill and asserts it is NOT counted.

**C. "Importing history…" moves into T2 (fixes Warning 3).** The `importing` atom and its one dim line in the Pane render are part of T2, so T2 can turn T1 fully green; T3 keeps README, version 0.4.0 and the footer text only.

**D. T1 answers `ui.log` (fixes Warning 4).** The T1 test registers `on('ui.log', () => ({ value: undefined }))` with the other hooks, before the first `$` call.

**T1 assertion updates implied by A:** step 3 reads imported counts from `disk.history.byName` (verify = `{ count: 2, … }` historical uses only, plus the grep use) and the live entry stays untouched in `disk.usage`; the pane row shows the combined count; step 3's marker check is `disk.history.importedAt === 40 * DAY + 2000` and `disk.history.attempts === 0`; step 6 asserts a live `skill.prompt` write leaves `disk.history` unchanged; step 7's "no second import" is unchanged. The implementer adjusts the exact literals to the fixture and states them in the receipt.

## Findings against the working tree and the API types

Checked `/Users/philgetzen/Development/my-skills-mod/.claude-plugin/types/claude-code/index.d.ts` (16,949 lines) and `/Users/philgetzen/.claude/projects` read-only (6,802 `.jsonl` files in 341 project folders; nothing copied beyond field names).

1. **Work that outlives `session.start`: `$.clock.after`.** `$.clock` docs (line 3508): "A timer's callback is the plugin's own function, kept in its environment and run there when the wait resolves"; `$.session.cwd` (line 2831): "A timer that outlives its hook reads the session's directory". The `process.spawn` example (line 3624) blesses the same shape for a detached loop after `next(e)`. `HookBudget.ms` is 10 s of a hook's OWN code per dispatch; `$` calls stop the clock (line 5258). Nothing states a budget for a timer callback, so the scan is shaped so it does not matter: one project folder per `$.clock.after(0, …)` tick that re-arms for the next folder, and an `await $.fs.read` per file inside a tick. Largest folder on Phil's disk: 317 MiB over 640 readable files, so one tick's own code (split and `includes` over that text) stays well under 10 s, and the plugin's event loop is free between files for `skill.prompt` and `ui.render`. The kit's `mock.clock.advance(ms)` resolves each due wait "and what one started runs before the next resolves", so the chain fires inside one `advance` in the test.
2. **`$.fs.read` rejects over 4 MiB** (line 3318, "which bounds what one read copies into the plugin's environment"); no range or offset option (`FsReadOptions` is `{ as }` only). `$.fs.list` gives `size` per entry in one call (line 5095), so the cap check costs no stat. Readable set: 2,940 top-level files, 2,015 MiB. Longest readable line: 1.4 MB.
3. **Transcript rows.** A Skill call is an `assistant` row whose `message.content[]` holds `{ type: "tool_use", name: "Skill", input: { skill } }`; a typed slash command is a `user` row whose `message.content` is a string carrying `<command-name>/name</command-name>` (with `<command-message>` and `<command-args>` beside it). Both carry `cwd` (a string) and `timestamp` (ISO string). The row's `cwd` is a proxy for what live counts key on (`$.session.root()`): I checked its type, not that it always equals the root, so a row whose `cwd` is a subfolder of a repo keys under that subfolder, and the worktree strip in finding 6 only helps inside `.claude/worktrees/`. The error direction is undercount for Suggested, never a wrong repo. `"name":"Skill"` also appears in `api-request-shape` rows (tool definitions), which is why the intent's grep count (2,466) overstates: the real tool_use count is 2,274 top-level + 47 in subagents.
4. **No double count.** In 2,940 of 2,940 readable top-level files, a typed `/name` row was followed by a Skill tool_use of the same name within 4 events in 0 cases (110 `/pickup`, 68 `/handoff`, 65 `/session-handoff`, 4 `/verify`, …). A typed command expands inline; the model's own Skill calls are separate rows. Both kinds count once, no pairing logic. Built-ins (`/clear` 79, `/model` 36) and other plugins' commands (`/pr-review-toolkit:review-pr` 17, `superpowers:systematic-debugging` 50) drop out by the pane-name filter, as live counts do.
5. **Subagents by path, not by field.** Subagent transcripts sit at `<folder>/<session-uuid>/subagents/agent-*.jsonl` (3,656 files). Inside them 18 of 47 Skill rows carry `isSidechain: false`, so the flag is not the rule: the scan lists `<projects>/<folder>/*.jsonl` only and never descends, which also drops the 19 nested `vercel-plugin` files. All 2,940 of 2,940 readable top-level files hold 0 `isSidechain: true` rows (grep over every file under 4 MiB), so no inline sidechain row exists for a row-level check to catch.
6. **Dead worktrees.** 425 of 578 distinct `cwd` values are Claude worktrees (`…/.claude/worktrees/<name>`); only 60 still have a `.git`, so `mainRepo()` as written would key 365 of them under paths no live session will ever match and Suggested would miss most history. For the 60 live ones, the `gitdir:` parent equals the path with `/.claude/worktrees/<name>…` stripped in 60 of 60. The strip therefore goes inside `mainRepo()` as its no-`.git` branch, one rule for live and imported counts.
7. **`record()` and `savedUsage()` would erase a marker kept in `usage`.** `record()` builds `{ since, byName }` and `savedUsage()` reconstructs only those two fields, so a `history` field would be dropped by the first live use and the next session would import again. Both carry it through (T2); the test's "second session does not re-import" assertion exists for this.
8. **Concurrent sessions.** Phil runs several at once; two started before any marker will both scan. The merge re-reads the store and abandons when `history.importedAt` is already set, so the second scan wastes IO and merges nothing. `skill.prompt` fires once per expansion, "typed as `/name`, run by the Skill tool, or preloaded" (line 12610), so the cutoff rule in T2 (`timestamp < since`) keeps imported and live rows disjoint.
9. **Store cap** is 4 MiB of JSON for the whole store (line of `$.store.set` docs); `usage` after import is a few hundred names at most. `$.ui.log(text, { to: "debug" })` (line 2450) is the receipt channel.
10. **Test kit.** `mock.clock(on, { now })` with `advance`/`settle`, `mock.store`, a hand-rolled `disk` store and the `reads` array are all in use in `pane.test.tsx` already; nothing new is needed.

## Shared rules for every task

- Files touched, and no others: `/Users/philgetzen/Development/my-skills-mod/hooks/register.tsx`, `/Users/philgetzen/Development/my-skills-mod/hooks/pane.test.tsx`, `/Users/philgetzen/Development/my-skills-mod/types/index.d.ts`, `/Users/philgetzen/Development/my-skills-mod/.claude-plugin/plugin.json`, `/Users/philgetzen/Development/my-skills-mod/README.md`. No helper module, no fixture file, no new harness. The shared `FILES`/`DIRS` constants are not extended (test 1 asserts exact counts against them); the new test declares its own entries inline.
- The import never throws out of a timer: every step is inside `try/catch`, a failure writes `history.attempts + 1` and clears the status line, and live counting is untouched either way.
- Every `usage` write is re-read-then-write through `savedUsage($)`, with no `await` between the read and the `$.store.set` (keys are resolved before the read).
- Verification after each task, from a shell, all three exit 0, status unmasked:
  ```
  cd /Users/philgetzen/Development/my-skills-mod && claude plugin test /Users/philgetzen/Development/my-skills-mod
  cd /Users/philgetzen/Development/my-skills-mod && npx -y -p typescript@5.6.3 tsc -p /Users/philgetzen/Development/my-skills-mod --noEmit
  cd /Users/philgetzen/Development/my-skills-mod && claude plugin validate /Users/philgetzen/Development/my-skills-mod
  ```
- Do not commit; Phil's main thread commits after the advisory pass.

## Task 1 — The failing test — 0.5 h — tier: workhorse (`implementer`, sonnet/medium)

Traces to: the intent's "one failing test for the parser and merge on a small fake projects folder; no new harness".

**Files:** `/Users/philgetzen/Development/my-skills-mod/hooks/pane.test.tsx`.

**The test** (appended): `imports history once in the background, skipping subagents and files over 4 MiB`.

- `const DAY = 24 * 60 * 60 * 1000`; `const clock = mock.clock(on, { now: 40 * DAY })`; hand-rolled `disk` store (as test 3) starting with `usage: { since: 35 * DAY, byName: { verify: { count: 1, lastUsed: 35 * DAY, byWorkspace: { '/main': 1 } } } }`, so the cutoff rule is tested in Phil's own situation (live counts already running).
- Row builders, local to the test, each `JSON.stringify` of a minimal row: `skillRow(skill, at, cwd)` → `{ type: 'assistant', timestamp: new Date(at).toISOString(), cwd, message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } }`; `typedRow(name, at, cwd)` → `{ type: 'user', timestamp, cwd, message: { content: `<command-message>${name} is running…</command-message>\n<command-name>/${name}</command-name>\n<command-args></command-args>` } }`.
- Inline fake projects folder (local `files`/`dirs`, merged over the shared `FILES`/`DIRS` for the skill listing):
  - `dirs['/home/u/.claude/projects'] = [{ name: '-proj', kind: 'dir', isLink: false, size: 0, mtimeMs: 0 }]`
  - `dirs['/home/u/.claude/projects/-proj'] = [ { name: 's1.jsonl', kind: 'file', size: 600, … }, { name: 'big.jsonl', kind: 'file', size: 4 * 1024 * 1024 + 1, … }, { name: 's1', kind: 'dir', … } ]`
  - `files['/home/u/.claude/projects/-proj/s1.jsonl']` = these lines joined by `\n`: `skillRow('verify', 10 * DAY, '/proj')` (counts, keyed `/main` through `/proj/.git`); `typedRow('verify', 20 * DAY, '/dead/.claude/worktrees/gone')` (counts, dead worktree keyed `/dead`); `skillRow('clear', 12 * DAY, '/proj')` (not listed, dropped); `skillRow('verify', 38 * DAY, '/proj')` (after `since`, already live-counted, dropped); `'not json'` (skipped); `JSON.stringify({ type: 'api-request-shape', shape: { name: 'Skill' } })` (passes the prefilter, no `cwd`, skipped).
  - `files['/home/u/.claude/projects/-proj/big.jsonl']` = five `skillRow('verify', …)` lines (must never be read); `files['/home/u/.claude/projects/-proj/s1/subagents/agent-1.jsonl']` = one `skillRow('verify', …)` (must never be listed or read; `dirs` has no entry for `…/s1`).
- Hooks: the usual `command.register`, `ui.open`, `session.start`, `env.get` → `/home/u`, `session.root` → `/proj`; `fs.exists` → `e.path === '/proj/.git' || e.path in files || e.path in dirs`; `fs.list` → `dirs[e.path] ?? []`; `fs.stat` → kind `dir` for `/proj`, else `file` (as the `suggests` test); `fs.read` pushes `e.path` to `reads`, answers `/proj/.git` with `'gitdir: /main/.git/worktrees/topic\n'`, else `files[e.path]` or `{ deny: 'missing' }`.
- Sequence and assertions:
  1. `await $.session.start(…)`; mount the pane; `ui.find({ type: 'Text', text: /^Importing history/ })` is defined.
  2. `await clock.advance(2000)` (the import delay; if the re-armed 0 ms ticks have not all run, one `await clock.settle()` after it is allowed, and the implementer says so in the receipt).
  3. `disk.usage.byName.verify` equals `{ count: 3, lastUsed: 35 * DAY, byWorkspace: { '/main': 2, '/dead': 1 } }`; `disk.usage.byName.clear` is undefined; `disk.usage.since` is `10 * DAY`; `disk.usage.history` equals `{ attempts: 0, importedAt: 40 * DAY + 2000 }`.
  4. (Amended for grep: the test's `process.run` hook answers `grep` on `…/big.jsonl` with one `skillRow` line for a listed skill dated before the cutoff, and the step-3 expected counts include that use; also assert `process.run` was called with `big.jsonl` as its last argument.) `reads` does not contain `…/big.jsonl` and no entry contains `subagents`; `reads.filter(p => p.endsWith('s1.jsonl')).length` is 1.
  5. On the same mount, `ui.find({ type: 'Text', text: /^Importing history/ })` is now undefined and `ui.find({ type: 'Text', text: /^Counts since / })` is defined; unmount. (If the step-1 mount does not redraw after `advance`, the fallback is unmount before `advance` and a fresh mount after it, and the receipt says so.)
  6. `await $.skill.prompt({ skill: 'verify', text: 'x' })` with `on('skill.prompt', () => ({ text: 'expanded' }))` registered: `disk.usage.history.importedAt` is still `40 * DAY + 2000` (the marker survives a live write, finding 7).
  7. `await $.session.start(…)`; `await clock.advance(2000)`; `disk.usage.byName.verify.count` is 4 (3 + the live use, no second import) and `reads.filter(p => p.endsWith('s1.jsonl')).length` is still 1.

Red check: `claude plugin test …` fails this test only, the other 7 still pass; `tsc` may fail on the missing `history`/`importing` types until T2, which is acceptable at this step.

## Task 2 — Scanner, scheduler, merge, marker, grep for large files — 1.75 h — tier: workhorse-reasoning (`opus`, high)

Reasoning tier because the change spans the session hook, a timer chain, the store's merge invariant, `mainRepo()` and two existing functions whose field pass-through decides whether the import runs once.

**Files:** `/Users/philgetzen/Development/my-skills-mod/hooks/register.tsx`, `/Users/philgetzen/Development/my-skills-mod/types/index.d.ts`.

**Proven by:** the T1 test going green (steps 1–4, 6, 7).

**The change.**

1. `types/index.d.ts`: `Usage` gains `history?: { attempts: number; importedAt?: number }`; `PluginState['my-skills']` gains `importing: boolean`.
2. `register.tsx` constants: `const importing = atom({ plugin: 'my-skills', key: 'importing' } as const, false)`; `const READ_CAP = 4 * 1024 * 1024` (finding 2); `const IMPORT_DELAY = 2000` (lets the pane paint first); `const WORKTREE = /\/\.claude\/worktrees\/[^/]+(\/.*)?$/`.
3. `savedUsage($)`: when `object(saved.history) && number(saved.history.attempts)`, carry `history: { attempts, importedAt }` (`importedAt` only when `number`); otherwise no `history`. `record($)`: build `next` as `{ ...saved, since: saved.since ?? now, byName: { … } }` so `history` rides through (finding 7).
4. `mainRepo($, root)`: when `${root}/.git` does not exist, return `root.replace(WORKTREE, '')` instead of `root` (finding 6, 60 of 60 live worktrees agree with the strip); the `.git`-is-a-dir and `gitdir:` branches are unchanged.
5. `session.start` hook, after `await refresh(...)` and before `return next(e)`: `const saved = await read($, usage)`; if `saved.history?.importedAt === undefined && (saved.history?.attempts ?? 0) < 2`, `await update($, importing, () => true)` and `$.clock.after(IMPORT_DELAY, () => void importHistory($))`. Nothing is awaited past that line; the hook returns as it does today. In the other 7 tests the timer is scheduled and never advanced (their `fs.exists` answers false for `~/.claude/projects`, so it would import nothing); the kit lets a held wait go after the hook's budget, and if it instead reports the pending timer at test end, the one allowed workaround is an `await $.fs.exists(projects)` in the hook before scheduling (a `$` call, budget-free), which also means those 7 tests never schedule a timer; the receipt says which case fired.
6. `importHistory($)`, one function, every branch inside `try/catch`:
   - Setup: `startedAt = await $.clock.now()`; `home`, `projects = ${home}/.claude/projects`; `listed` = every section item's `name` with a leading `/` stripped (from `read($, sections)`, the same rule as `record()`); `cutoff = (await savedUsage($)).since ?? startedAt` (rows at or after it are live-counted already, or being written now); `found: Record<string, Use> = {}`; `keys = new Map<string, string>()` (cwd → `mainRepo`); counters `files`, `grepped`, `skipped`, `uses`, `oldest = Infinity`.
   - If `!(await $.fs.exists(projects))`, go straight to finish (an empty import still writes the marker, so a machine with no history does not rescan every session).
   - `folders = (await $.fs.list(projects)).filter(one => one.kind === 'dir')`; `step(i)`: `$.clock.after(0, () => void (async () => { try { await scanFolder(folders[i]); i + 1 < folders.length ? step(i + 1) : await finish() } catch (error) { await fail(error) } })())`; `step(0)` (finding 1: one folder per tick).
   - `scanFolder(folder)`: for each entry of `$.fs.list(${projects}/${folder.name})` with `kind === 'file'` and a `.jsonl` name (never descend, finding 5): `size > READ_CAP` → large-file path: `$.process.run(['grep', '-h', '-F', '-e', '"name":"Skill"', '-e', '<command-name>', path], { timeoutMs: 60000 })` (no shell; grep prints only the lines that can match, so stdout stays far under its 4 MiB cap); exit 0 → its stdout is `text`, `grepped++`; exit 1 (no match) → nothing to count, `grepped++`; a rejection (no grep on this machine, e.g. Windows), any other exit code, or `isStdoutTruncated` → `skipped++`, continue; never `$.fs.read` a file over the cap. Otherwise `text = await $.fs.read(path)` (a rejection skips the file); `files++`; for each line of `text.split('\n')`: skip unless `line.includes('"name":"Skill"') || line.includes('<command-name>')` (keeps `JSON.parse` to the rows that can match); `row = JSON.parse(line)` (catch → continue); `at = Date.parse(row.timestamp)`, skip unless `at < cutoff` (NaN fails this); skip unless `typeof row.cwd === 'string'`; names: for an `assistant` row with an array `message.content`, every block with `type === 'tool_use' && name === 'Skill' && typeof input?.skill === 'string'` gives `input.skill`; for a `user` row, `text` = `message.content` when a string, else its first block's `text` when an array, and `/<command-name>\/?([^<]+)<\/command-name>/` gives the name; each name with a leading `/` stripped is kept only when `listed.has(name)`; key = `keys.get(cwd) ?? (await mainRepo($, cwd))` (cached); accumulate `found[name]` (`count + 1`, `lastUsed = max`, `byWorkspace[key] + 1`), `uses++`, `oldest = min(oldest, at)`.
   - `finish()`: `now = await $.clock.now()`; `saved = await savedUsage($)` (re-read); if `saved.history?.importedAt !== undefined`, another session imported first: skip the write (finding 8). Else merge: for each `[name, use]` of `found`, `byName[name] = { count: prev.count + use.count, lastUsed: max(prev.lastUsed, use.lastUsed), byWorkspace: prev's plus use's per key }`; `since = oldest === Infinity ? saved.since : min(saved.since ?? Infinity, oldest)` (an empty scan leaves `since` alone); `next = { ...saved, since, byName, history: { attempts: saved.history?.attempts ?? 0, importedAt: now } }`; `await $.store.set(USAGE_KEY, next)`; `await update($, usage, () => next)`. Then `await update($, importing, () => false)` and the receipt: `$.ui.log(`my-skills: imported ${uses} uses from ${files} transcripts, ${grepped} over 4 MiB read with grep, ${skipped} skipped, ${now - startedAt} ms`, { to: 'debug' })`.
   - `fail(error)`: `saved = await savedUsage($)`; if `saved.history?.importedAt === undefined`, write `{ ...saved, history: { attempts: (saved.history?.attempts ?? 0) + 1 } }`; `update($, importing, () => false)`; `$.ui.log(`my-skills: history import failed: ${message}`, { to: 'debug' })`; its own body in `try/catch` that swallows.
   - Rule, stated once: `attempts` moves only in `fail`; `importedAt` only in `finish`; the session hook skips when either `importedAt` is set or `attempts >= 2`. A session that ends mid-scan is not a failure and simply tries again next time, which is safe because nothing is written before `finish`.

Not in this task: a per-row `isSidechain` check (finding 5 shows the path is the rule), a checkpoint for resuming a half-done scan (Cut list), reading files over the cap through `$.fs` (no range read exists; grep covers them).

## Task 3 — Pane line, README, version — 0.5 h — tier: workhorse (`implementer`, sonnet/medium)

Traces to: the intent's outcome 5 ("the pane shows 'Importing history…' while it runs and drops the line when done") and the README's "Counts start when you install the mod" sentence, which becomes false.

**Files:** `/Users/philgetzen/Development/my-skills-mod/hooks/register.tsx`, `/Users/philgetzen/Development/my-skills-mod/README.md`, `/Users/philgetzen/Development/my-skills-mod/.claude-plugin/plugin.json`.

**Proven by:** the T1 test's steps 1 and 5, plus `tsc` and `claude plugin validate` green.

**The change.**
1. `ui.render`: `const busy = await read($, importing)`; in the column-reverse tree, right after the `<Box height={16} />` spacer and before the "Counts since …" `Text`, add `{busy && <Text dimColor>Importing history…</Text>}` (it draws as the last line of the pane while the scan runs).
2. `README.md`: replace "Counts start when you install the mod and include every time a skill is loaded, subagent preloads included, so treat them as a guide rather than an exact tally." with a paragraph saying: the first time it runs the mod reads your past sessions under `~/.claude/projects` once, in the background, and counts the skills and commands it lists there; transcripts over 4 MiB and subagent transcripts are skipped, and the pane says "Importing history…" meanwhile; counts include every expansion, subagent preloads included, so they are a guide rather than an exact tally.
3. `plugin.json`: version `0.3.1` → `0.4.0`; description unchanged.
4. Run the three verification commands; then the live receipt: start one session in `/Users/philgetzen/Development/my-skills-mod` and read the debug log line (`my-skills: imported N uses from M transcripts, K over 4 MiB skipped, T ms`). Expected on Phil's machine: M about 2,940, K about 206, N at most 1,346 Skill uses plus typed commands the pane lists. Report M, K, N and T in the transcript; that one line is the `$.fs` throughput measurement, no timing fixture.

## Advisory pass — 0.25 h — tier: frontier (Codex Astra via `codex-dispatch.sh --role reviewer`, cross-family; or `frontier-reviewer`, fable/high)

Traces to: CLAUDE.md's advisory gate (merge and race semantics are load-bearing; open decision 1 funds or defers 41 % of the history).

Before T1 starts, on this plan: the merge and race rules (findings 7, 8), the cutoff rule, and the T1 fixture's expected numbers. A Critical finding is fixed here; a Warning is filed to PGDash; a Suggestion is dropped; no finding adds a task, mechanism or test on its own. The outcome is stated in the transcript as reviewer + model + effort + family.

## Cut list

- ~~**Reading the 206 files over 4 MiB**~~ (moved into T2 via grep, Phil 2026-10-26) (928 Skill calls, 445 typed commands, 1,688 MiB): no `$.fs` range read exists; a `$.process.run(["grep", …])` fallback breaks the intent's "no shell tools" rule and needs a second parser. Deferred outcome: 41 % of Phil's Skill history and 45 % of his typed commands stay uncounted; the receipt line reports the skipped count. Open decision 1.
- **Resumable scan (checkpoint per folder):** a session shorter than the scan retries from scratch next time; with nothing written before `finish`, retrying is safe and costs background IO only. Added only if the receipt shows the scan is longer than Phil's typical session.
- **Per-row `isSidechain` skip:** 18 of 47 subagent Skill rows carry `false`, so the path rule is the one that works; and 2,940 of 2,940 readable top-level files hold 0 `isSidechain: true` rows, so a row check would catch nothing.
- **Reading `~/.claude/history.jsonl`:** no session folder per row, as the intent already cut.
- **Importing subagent-preloaded uses:** live counts include preloads (`skill.prompt` fires for them); the import skips `subagents/` per the intent, so history undercounts preloads relative to live. One sentence in the README's "guide, not a tally"; no task.
- **Which Project skills get history depends on which session imports first** (the `listed` set is that session's pane). Global, User and Account names are the same in every session; a Project-only skill's history is counted only when the importing session is in that project. Noted, not solved.
- **A manual re-import button and per-day charts:** cut in the intent.
