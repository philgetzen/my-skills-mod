# Panel redesign (0.8.0) — implementation plan

Source: Phil's build spec `~/Downloads/SPEC.md` with mockups `Main.dc.html` and `Detail.dc.html` (design canvas https://claude.ai/artifact/VYTeP7gC79tnAhdfgKGgfK). All work in `/Users/philgetzen/Development/my-skills-mod`, mostly `hooks/register.tsx`, `types/index.d.ts`, `hooks/pane.test.tsx`.

Budget: 4 agent-hours (Phil, 2026-10-27; Rename cut)

| Task | Hours |
|---|---|
| 1. Data: per-day counts + typed issues | 0.75 |
| 2. List view: header, search, health card, sort, Active here, Starred fold, All skills chips | 1.5 |
| 3. Detail view: stats, 30-day chart, collision fix, actions | 1.0 |
| 4. Tests re-keyed + README + 0.8.0 | 0.5 |
| 5. Review pass (Fable) and fixes | 0.25 |

## Answers to the spec's open questions

- **User-source flag:** it is `UNMANAGED`, "Not in your Global folder: skillshare doesn't track it, so your other agents don't get it." It fires on every skill in `~/.claude/skills` that is not under the Global folder, only when Global points at a non-empty shared folder. Kept as is; the health row reads "9 User skills · Not in your Global folder".
- **Rank:** cheap (sort all listed skills by uses). Kept as `#N`.
- **Show all N:** inline.

## Spec changes forced by the engine (Claude Code 2.1.290)

The pane draws with Box/Text/Button/Input/Svg, sized in character cells, not HTML. So:

1. **Pixel tokens become theme keys.** 44px targets, radii and hex text colors cannot be set; hex would also break dark mode. Text uses the theme (`warning` for amber, `dimColor` for muted). The sparkline SVG uses the spec's hex with a `prefers-color-scheme: dark` override, checked live before calling it done.
2. **No Esc-to-close-search.** `Input` has no Escape handler (Escape hands focus back). The clear button and the Search toggle cover it.
3. **No Expand button.** No API widens a desktop pane; `columns` only affects the terminal dock.
4. **Row click = name click.** The engine rejects mixed children in a Button, so the name is the target that opens detail; the star stays its own button.
5. **Terminal and mobile:** no `Svg` on terminal (block-glyph sparkline `▁▂▃▅▇` instead); no `Input` on mobile (search button hidden there).

## Tasks

### 1. Data
- `Use.days?: Record<'YYYY-MM-DD', number>`, local dates, pruned to the last 30 on every write. `record()` adds today.
- History import fills `days` from each use's timestamp. `History.version = 2`: an install whose history predates it re-imports once (cutoff `since − 5 min` already prevents double counting). Without this Phil's trends stay empty.
- `Item.health: string[]` becomes `issues: { kind: 'collision' | 'bare' | 'dangling' | 'unmanaged'; text: string }[]`, so the health card can group by kind + source.
- View state atoms declared in `PluginState`: `view` (list | detail target), `query`, `searchOpen`, `scope` (chip, saved in store like sort), `showAll`, `keep`, `confirming`.
- Proving test: a use recorded today and one imported 10 days ago land in the right trend buckets.

### 2. List view
Header (`Skills N`, Search, Refresh, Close), search results across all sources (name, source, description), health card (collision rows → Fix opens detail; same kind + source grouped → Review selects that chip), sort segmented control (Recent ties by uses, Most used ties by name, Name), Active here (replaces Most used here, same five-use threshold, shortened cwd + count), Starred with the idle fold, All skills with chips + amber dot + path + first 12 + Show all, footer. Row columns: star · name (+ ! when flagged) · trend · `N×` · `4h`.
- Proving test: one test walks the list: health card rows, chip filter, search results label, idle fold.

### 3. Detail view
Back, title + star, `/name` chip + source chips, three stats (uses, last used, rank), 30-day chart with trend word, collision card, description, actions (Open SKILL.md, Copy `/name` via `$.ui.copy`, Reveal in Finder via `open -R`).

**Collision card (the risky part).** No copy is selected at first; Remove is disabled until Phil picks. Remove asks once more ("Move Global copy to trash?" → Confirm / Cancel). Mechanism by source:
- Global when it is the skillshare folder: `skillshare uninstall <name> --force` (moves to skillshare's trash, kept 7 days), then a toast: "Removed. Commit in ~/.config/skillshare and run skillshare sync."
- Global at `~/.claude/skills`, User, Project: `mv` to `~/.Trash`.
- Account: no remove; the button opens Customize › Skills.
- Proving test: Remove is disabled before a pick, needs the confirm press, and runs `skillshare uninstall` (not `rm`) for a skillshare Global copy.

### 4. Tests, README, version
Re-key the 12 existing tests to the new keys, README sections for the new layout, plugin.json 0.8.0.

### 5. Review
`reviewer` (Fable) on the diff; Phil's live look via `/reload-plugins` then `/my-skills`.

## Cut list
- **Rename other copy.** Renaming touches the skillshare git repo, the frontmatter `name:`, and leaves `~/.claude/skills/<old>` dangling until `skillshare sync`. Proposed as a follow-up; the button is omitted in 0.8.0.
- Esc closes search, Expand button (engine, above).
- Pixel-exact tokens (engine, above).
- Hover description cards on rows (detail view replaces them).
- Auto-commit or auto-sync in the skillshare repo after a remove.

## Advisory amendments (2026-10-27)

Reviewer: frontier-reviewer (Fable 5.1 / high, same family). 5 findings: 4 fixed, 0 filed, 1 dropped (skillshare upgrade suggestion). These override the task text above.

1. **Global remove runs in global mode.** `$.process.run` defaults `cwd` to the session folder, and skillshare switches to project mode in any repo with `.skillshare/`, so it could trash the project copy. Use `['skillshare', 'uninstall', name, '-g', '--force']`.
2. **History v2 pass never replaces counts.** Transcripts before ~Aug 22 are pruned, so a re-scan that rewrites `byName` loses uses. The v2 pass only fills `days` on existing entries (and on names it newly finds within the last 30 days, without touching count/lastUsed/byWorkspace of existing ones); `count`, `lastUsed`, `byWorkspace`, `oldest` stay as stored. `savedHistory` must keep `version`; `fail()` must count attempts for the v2 pass too, so a failing pass stops after 2 tries.
3. **No globs or keywords into skillshare.** Use skillshare only when the name matches `/^[A-Za-z0-9][A-Za-z0-9._-]*$/` and is not `agents`; otherwise fall back to the trash move.
4. **Trash move never collides or overshoots.** Destination `~/.Trash/<name> <YYYY-MM-DD HH.MM.SS>`. The path moved is the skill's folder: `dirname(target)` for a SKILL.md, the `target` itself for a dangling link, the `.md` file for a command. Never the parent skills folder.
