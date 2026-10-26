# my-skills: usage counts, health flags, repo suggestions — implementation plan

Date: 2026-10-26. From the intent note `/Users/philgetzen/Development/my-skills-mod/docs/superpowers/specs/2026-10-26-usage-and-health-intent.md` (settled questions and cut list are decided there and not reopened here).

Budget: 6 agent-hours (Phil, 2026-10-26).
Task hours: T1 2 h + T2 2 h + T3 1 h + T4 1 h = 6 h.

## Findings against HEAD (`1e8cab0`) and the API types

Checked `/Users/philgetzen/Development/my-skills-mod/.claude-plugin/types/claude-code/index.d.ts` (16 949 lines).

1. **Preload cannot be told apart (settled question 1, fallback branch).** `SkillPromptInput` (line 12617) has seven fields: `skill`, `text`, `frontmatter`, `frontmatterProblem?`, `source`, `pluginName?`, `path?`. Its doc comment says the event fires "typed as `/name`, run by the Skill tool, or preloaded into a subagent" with no field naming which. `source` is the settings tier (`userSettings`, `plugin`, `syncedSkills`...), not the trigger. So the mod counts every expansion and the pane footer says so.
2. **One hook, not two.** A typed `/verify` fires `command.run` (`command: 'verify'`) and then `skill.prompt` (`skill: 'verify'`); `SkillPromptInput.path` is documented as "a skill's SKILL.md, or a command's own `.md` file" (line 12657), so `.md` commands in `~/.claude/commands` also arrive at `skill.prompt`. Counting on both hooks would record 2 per typed slash. This plan hooks `skill.prompt` only; the note's "Affected systems" line naming `command.run` is corrected here, not a settled question. Built-ins (`/clear`, `/model`) never reach `skill.prompt`, which is settled question 2 for free; the existing `command.run { command: 'my-skills' }` hook is untouched.
3. **Key counts by name.** The engine's `path` for a Global skill is the unresolved `~/.claude/skills/<name>/SKILL.md` link, while the pane's `target` is the skillshare path, so path matching would miss. `e.skill` matched against item names with a leading `/` stripped covers skills, `.md` commands and account skills alike.
4. **A new atom is needed for live counts.** The "a `get` during `ui.render` subscribes" rule (line 3466) is `$.state`'s, which `atom`/`read`/`update` wrap; `$.store` has no such rule. Counts therefore get an atom mirroring `starred`, loaded in `refresh`, updated after each store write.
5. **The test kit's bottom hook throws** for any event no test hook answers (line 16896), so each new test that drives `$.skill.prompt` registers `on('skill.prompt', (_, e) => ({ text: ... }))` beneath. `mock.clock(on, { now })` (with `advance`) and `FoundElement.props` (so `props.dimColor` is assertable) already exist in the kit: no new infrastructure. `Text` takes no `key` (`Box` and `Button` do), so new text is found by `{ type: 'Text', text: /.../ }` as the existing tests do; `warning` is in the `ThemeKey` colour union.
6. **Dangling links are dropped today.** `skills()` returns nothing for a folder without `SKILL.md`, so a symlink pointing nowhere never reaches the pane; T2 changes that one branch.

## Shared rules for every task

- Observing hooks `return next(e)`'s result unchanged; the recording runs inside `try/catch` and a failure is swallowed (a toast would spam every skill use).
- Store writes follow the stars pattern: re-read the key, merge, write. The simultaneous-write race is accepted.
- No new files beyond editing `hooks/register.tsx`, `hooks/pane.test.tsx`, `types/index.d.ts`, `.claude-plugin/plugin.json`, `README.md`. No helpers file, no fixture file. New tests declare their own local `FILES`/`DIRS`-style entries inline (test 3's hand-rolled disk store is the precedent); the shared `FILES`/`DIRS` constants are not extended, because test 1 asserts exact `User (0)` / `Project (1)` counts against them.
- Verification, run after each task from a shell (all three must exit 0, status unmasked):
  ```
  cd /Users/philgetzen/Development/my-skills-mod && claude plugin test /Users/philgetzen/Development/my-skills-mod
  cd /Users/philgetzen/Development/my-skills-mod && npx -y -p typescript@5.6.3 tsc -p /Users/philgetzen/Development/my-skills-mod --noEmit
  cd /Users/philgetzen/Development/my-skills-mod && claude plugin validate /Users/philgetzen/Development/my-skills-mod
  ```

## Task 1 — Use counts (#3) — 2 h — tier: workhorse-reasoning (`opus`, high)

Reasoning tier because the change spans a hook, the store, an atom and the render with one invariant (never alter the run) across them.

**Files:** `/Users/philgetzen/Development/my-skills-mod/hooks/register.tsx`, `/Users/philgetzen/Development/my-skills-mod/hooks/pane.test.tsx`, `/Users/philgetzen/Development/my-skills-mod/types/index.d.ts`.

**The failing test** (added to `pane.test.tsx`): `counts a use, shows it on the row, and leaves the prompt untouched`.
- Hand-rolled `disk` store (as test 3), `mock.clock(on, { now: 40 * DAY })`, `on('skill.prompt', () => ({ text: 'expanded' }))`, the usual `command.register` / `ui.open` / `session.start` / `env.get` / `fs.*` hooks, `session.root` → `'/proj'`. Uses the shared `FILES`/`DIRS` read-only.
- Fire `$.skill.prompt({ skill: 'verify', text: 'raw' })` twice; `clock.advance(3 * DAY)`; fire `$.skill.prompt({ skill: 'clear', text: 'raw' })` once (a built-in, not in any section).
- Then make `store.set` deny once (`disk` hook returns `{ deny: 'full' }` while a flag is set) and fire `verify` again: the resolved `.text` must still be `'expanded'`.
- Assertions: every `$.skill.prompt` call resolved `{ text: 'expanded' }`; `disk.usage.byName.verify` is `{ count: 2, lastUsed: 40 * DAY, byWorkspace: { '/proj': 2 } }`; `disk.usage.byName.clear` is undefined; `disk.usage.since` is `40 * DAY`. Mount the pane after the prompts: `ui.find({ type: 'Text', text: /2× · 3d ago/ })` is defined; the `open:Global:<verify target>` button's `props.dimColor` is falsy; the footer `ui.find({ type: 'Text', text: /Since / })` exists and its text contains `preloads included`.
- Not asserted (visual only, named here so the gap is known): the 30-day dim turning on, the Starred re-order (one more star and a second use would double the fixture; left to the hover/eyeball check in T4).

**The change.**
1. `types/index.d.ts`: `Use = { count: number; lastUsed: number; byWorkspace: Record<string, number> }`, `Usage = { since?: number; byName: Record<string, Use> }`; `PluginState['my-skills']` gains `usage: Usage`.
2. `register.tsx`: `const usage = atom({ plugin: 'my-skills', key: 'usage' } as const, { byName: {} })`, `USAGE_KEY = 'usage'`; `savedUsage($)` validates the shape the way `savedStars` does (anything malformed reads as `{ byName: {} }`); `loadUsage($)` called from `refresh` beside `loadStars`.
3. `record($, skill)`: read the `sections` atom; the known names are every item's `name` with a leading `/` stripped; return early if `skill` is not known (settled question 2, and keeps the store to the names the pane shows). Then `now = await $.clock.now()`, `root = await $.session.root()`, re-read `savedUsage`, bump `count`, set `lastUsed = now`, `byWorkspace[root] += 1`, set `since` when absent, `$.store.set(USAGE_KEY, next)`, `update($, usage, () => next)`.
4. Hook: `on('skill.prompt', async ($, e, next) => { const result = await next(e); try { await record($, e.skill) } catch {} return result })`. No matcher. A rejected `next` propagates as it would without the hook.
5. Render: `now = await $.clock.now()` once; after the star box on each row, `<Text dimColor>{count}× · {ago}</Text>` when the item has a use (`ago`: `just now` under 1 h, `Nh ago` under 24 h, else `Nd ago`); the name button gets `dimColor={stale}` where `stale` is `now - lastUsed >= 30 d` for a used item and `since !== undefined && now - since >= 30 d` for one never used. Starred sorts by `lastUsed` descending, unused last by name. Under the Refresh button: `<Text dimColor>Since <date> · counts every expansion, subagent preloads included</Text>`, or `No uses recorded yet` before the first write.

## Task 2 — Health flags (#4) — 2 h — tier: workhorse (`sonnet`, medium)

**Files:** `/Users/philgetzen/Development/my-skills-mod/hooks/register.tsx`, `/Users/philgetzen/Development/my-skills-mod/hooks/pane.test.tsx`, `/Users/philgetzen/Development/my-skills-mod/types/index.d.ts`.

**The failing test:** `health flags a dangling link, a bare skill and a name collision, without reading the link`.
- Local entries: Global `verify` with a description (as the shared fixture); `~/.claude/skills` listing `gone` (`kind: 'other', isLink: true`, no `SKILL.md` anywhere) and `mine` (dir, `SKILL.md` with no `description:`); `~/.claude/commands` listing `verify.md` with a description. `session.root` → `'/home/u'` so Project is empty.
- Assertions: `User (3)` stays the exact title text; `ui.find({ type: 'Text', text: /3 health/ })` is defined (gone, mine, /verify) and `ui.find({ type: 'Text', text: /1 health/ })` is defined (Global verify, also in User); hover-card texts found by type and text: `/no description · not in Global/` (mine), `/link points nowhere/` (gone), `/also in Global/` (the command); `reads` never includes `/home/u/.claude/skills/gone/SKILL.md`.

**The change.**
1. `types/index.d.ts`: `Item` gains `health?: string[]`.
2. `skills()`: when `entry.isLink` and `SKILL.md` does not exist, emit `{ name, target: \`${folder}/${name}\`, description: '', health: ['link points nowhere'] }` and read nothing. A non-link folder without `SKILL.md` is still dropped (the `synced` folder rule).
3. `scan()`, after the four lists exist and before sorting: `no description` for any item outside Account with `description === ''` that is not already the dangling case; `not in Global (unmanaged)` for every `userSkills` item without the dangling flag (a dangling link there is usually a skillshare link whose target moved) when `global.length > 0` (the skillshare-managed links share a name with a Global skill and are already hidden by `seen`; a link into Global under a different name would be flagged wrongly, accepted); `also in <other section title>` for every item whose stripped name appears in more than one section (this is the CLAUDE.md command-shim collision, and a project skill shadowing a global one). Account items take part in the collision check only.
4. Render: a `<Text color="warning">{n} health</Text>` beside the title (wrap title and count in one `Box` so they share a line), rendered only when `n > 0` and as a separate element so the existing exact-title assertions hold; a `!` marker in the same colour after the star box on a flagged row; the hover card shows `[item.description, ...(item.health ?? [])].filter(Boolean).join(' · ') || 'No description.'`.

## Task 3 — Suggested for this repo (#5) — 1 h — tier: workhorse (`sonnet`, medium)

**Files:** `/Users/philgetzen/Development/my-skills-mod/hooks/register.tsx`, `/Users/philgetzen/Development/my-skills-mod/hooks/pane.test.tsx`.

**The failing test:** `suggests the skills used most in this repo once there are five uses`.
- Hand-rolled `disk` seeded with `usage = { since: 1, byName: { verify: { count: 4, lastUsed: 1, byWorkspace: { '/proj': 4 } } } }`, `mock.clock`, `on('skill.prompt', ...)` beneath, `session.root` → `'/proj'`, shared `FILES`/`DIRS` read-only.
- Mount: `ui.find({ type: 'Text', text: /Suggested for this repo/ })` is undefined. Unmount, fire `$.skill.prompt({ skill: 'verify', text: 'x' })`, mount again: the header text is `'Suggested for this repo (1)'` and `ui.find({ key: 'open:Suggested for this repo:<verify target>' })` is defined.

**The change.** In the render, `root = await $.session.root()`; `inRepo` = every item with `byWorkspace[root] > 0`, sorted by that count descending then name, first five; `total` = the sum over them. When `total >= 5`, `shown` starts with `{ title: 'Suggested for this repo', folders: [\`Most used in ${root}\`], items: inRepo }` ahead of Starred; otherwise the section is absent.

## Task 4 — Review and polish — 1 h — tier: frontier (`reviewer` agent, fable/medium)

Trace: the CLAUDE.md verification chain (`/verify` → `/code-review`) and the plugin release step.

**Files:** `/Users/philgetzen/Development/my-skills-mod/.claude-plugin/plugin.json` (version `0.3.0`, description mentions use counts and health), `/Users/philgetzen/Development/my-skills-mod/README.md` (one paragraph: what a count, a dim row, a `!` marker and the Suggested section mean; the preload caveat).

**Steps.** `/verify` (read-first) on the three feature diffs; dispatch `reviewer` with the diff since `1e8cab0`, this plan, and the one question "does any hook path change what the run returns?"; fix a Critical in place, file a Warning to PGDash, drop Suggestions. Open the pane once in a live session, use one skill, and eyeball the `N× · just now` row and the footer (the visual checks T1 does not assert). The three verification commands run last, exit codes reported.

**No proving test:** this task is review, not a feature.

## Cut list

- From the note: search box and run-from-pane; surfacing `skillshare doctor`; cross-machine sync; usage charts or history.
- A `command.run` counting hook: double-counts every typed `/name` (finding 2). If the live check in T4 shows a `~/.claude/commands/*.md` run does not reach `skill.prompt`, the amendment is a `command.run` observer that counts only items whose pane name starts with `/`, partitioned from the skill hook; it fits inside T1's 2 h by dropping the footer's `since` date to a plain line.
- Telling a subagent preload from a typed use via `agent.spawn`'s `skills` list: would need a second hook and a time-window heuristic to subtract preloads; the footer caveat covers it.
- Resolving a dangling link's `realPath` to show where it pointed: one stat per link for a reason Phil can read from `ls -l`.
- Health checks on the Account section beyond name collisions (an account skill has no file to be bare or dangling).
- Asserting the 30-day dim and the Starred re-order in T1's test: both are pure arithmetic on `lastUsed`; the eyeball check in T4 covers them, and a second clock scenario would outweigh the feature.
- A usage reset button: Phil can delete the store key; not asked for.
