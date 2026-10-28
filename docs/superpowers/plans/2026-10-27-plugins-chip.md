# Plugins chip (0.9.0) — implementation plan

Ask: Phil, 2026-10-27, "Yes push and build plugins", after the panel turned out to miss 74 of the session's 130 skills (56 of them from enabled plugins). All work in `/Users/philgetzen/Development/my-skills-mod`.

Budget: 1.5 agent-hours (my estimate; Phil to confirm or cut)

| Task | Hours |
|---|---|
| 1. Plugins source: list, resolve files, chip, detail actions | 0.75 |
| 2. History v3 pass with a per-name cutoff so past plugin uses count | 0.25 |
| 3. One proving test, README, 0.9.0 | 0.25 |
| 4. Review (Fable) and fixes | 0.25 |

## Design

- **Where the list comes from:** `$.command.list()` (in the installed 2.1.290 engine), entries with `source === 'plugin'`. That is what the session can run now, so disabled plugins stay out and mod commands such as `/my-skills` show up. Built-in and MCP entries are left out. If the call fails the chip shows 0 and the rest of the panel is unchanged.
- **Opening the file:** the name before `:` finds the plugin's `installPath` in `~/.claude/plugins/installed_plugins.json`; the file is `skills/<name>/SKILL.md`, else `commands/<name>.md`. With no file found the target is `plugin:<name>`, and Open and Reveal are hidden in the detail view (Copy `/name` stays).
- **Chip:** fifth, after Project: `Plugins N`, path line "Enabled plugins".
- **Health:** plugin skills are never flagged and take no part in collisions (namespaced names cannot clash; a remove button on a plugin copy would be wrong).
- **Usage:** `record()` matches the exact listed name, else the one Plugins item named `<plugin>:<skill>` (the event's docs don't say whether it carries the namespace). `HISTORY_VERSION` goes to 3: the existing add-only pass adds the plugin names' past uses without touching stored counts.
- **History cutoff per name (advisory fix):** the import reads transcripts only up to `since − 5 min` because later uses are in the live store. Plugin names were never recorded live, so for a name with no live entry the import reads up to its own start instead.

## Proving test

`command.list` returns one plugin skill, one built-in and one MCP command: the Plugins chip reads `Plugins 1`, its row opens a detail view whose Open SKILL.md runs `open -t <installPath>/skills/<name>/SKILL.md`; a transcript use of it dated after `since` lands in its trend.

## Advisory

advisor (Fable, same-family), before build: 1 blocking finding fixed (history cutoff above), 3 checks folded into the design (namespaced name matching, `source`/`:` filter, Plugins kept out of every issue loop).

## Cut list

- **Built-in chip** (17 skills such as code-review, simplify, loop): no file to open; cheap to add later from the same list.
- Anthropic account skills with plain ids (deep-research): left out on purpose since 0.6.
- Collision checks between an unnamespaced mod command and a user skill.
- Enabling or disabling plugins from the panel.

Code review: Codex (Astra/high, cross-family) on the diff. 4 findings: 4 fixed, 0 filed, 0 dropped. A plugin copy could reach the collision card's Remove (now excluded, and `removeCopy` refuses Plugins and Account); a `..` name could open a file outside the plugin (now confined to the resolved install folder); a live use before the import hid older plugin uses (live entries now carry `first`, the cutoff is per name); an in-flight use could count twice (names with no live entry stop 5 minutes before the import).
