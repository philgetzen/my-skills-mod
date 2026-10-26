# my-skills: usage, health, and repo suggestions — intent note

Date: 2026-10-26. Status: budget set by Phil 2026-10-26; open questions settled as the agent's calls (Phil accepted the guesses with "6").

## Problem

The pane shows what skills exist, not which ones earn their place. Phil has 65 skillshare skills plus user, project and account ones, and prunes from memory. Broken or colliding skills show up only when one misfires. Typing `/` already handles finding and starting a skill (Phil, 2026-10-26: search and run-from-pane are "easily done in the prompt box"), so the pane's job is judgment, not launching.

## Proposed outcome

1. **Use counts (#3).** Every skill expansion and every slash command adds to a count with a last-used date. Rows show "12× · 3d ago"; Starred sorts by most recent use; anything unused for 30 days is dimmed. A "Since <install date>" line keeps early numbers honest.
2. **Health flags (#4).** A small marker on a row, with the reason in the hover card, for: no description, a symlink pointing nowhere, the same name in two sections (the command-shim collision in CLAUDE.md), and a skill in `~/.claude/skills` that skillshare does not manage. A Health count sits in the section header.
3. **Suggested for this repo (#5).** A section at the top listing the skills used most in the current project's workspace, from the counts in #1. Hidden until there is enough data (my guess: 5 or more uses in that workspace).

## Affected systems

- `hooks/register.tsx` only: new `skill.prompt` and `command.run` hooks (both observe and call `next(e)`, never change the run), new checks in `scan()`, new pane rows.
- `$.store`: a `usage` key holding `{ name → { count, lastUsed, byWorkspace } }`, written the way stars are (re-read before write).
- No new dependencies, no network, nothing outside the mod.

## Constraints

- Observing never changes behaviour: a hook that fails must pass the run through untouched.
- Health checks that `skillshare doctor` already runs (valid SKILL.md, integrity, git state) are not duplicated.
- Store stays small (4 MiB limit across all keys); counts are per name, not per call.
- One failing test per feature, no extra harness (CLAUDE.md minimal-design rule).

## Settled questions (agent's calls, accepted by Phil 2026-10-26)

1. Count `/name` and Skill tool expansions only, not subagent preloads, if the event lets them be told apart; if it does not, count all and say so in the pane footer.
2. Count only commands that appear in the pane's scanned sections; built-ins (`/clear`, `/model`) are ignored.
3. "Unused" means no use in 30 days.
4. "Workspace" for #5 is the git root of the session's project (`$.session.root`), not the PGDash map.

## Cut list

- Search box and run-from-pane (#1, #2): the prompt box already does both.
- Surfacing `skillshare doctor` output in the pane: it overlaps with that tool's own report.
- Cross-machine or cloud sync of counts.
- Usage charts or history beyond count and last-used date.

Budget: 6 agent-hours (Phil, 2026-10-26).
- #3 use counts: 2 h
- #4 health flags: 2 h
- #5 suggested for this repo: 1 h
- review and polish: 1 h
