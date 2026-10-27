# my-skills: first-run history import — intent note

Date: 2026-10-26. Status: approved direction and budget (Phil, 2026-10-26).

## Problem

Use counts start the day the mod is installed, so counts, the 30-day dim and Suggested are empty for weeks. Claude Code already keeps every session's transcript under `~/.claude/projects/`, with the skills the model called and the slash commands the person typed, plus the folder each session ran in. Phil's go back to 2026-03-21: 6,802 transcripts in 341 project folders, 2,466 Skill tool calls and 1,019 typed slash commands (measured 2026-10-26 with grep; may include subagent transcripts).

## Proposed outcome

On first run, for every user (Phil included, whose store has no import marker), the mod imports that history once in the background:

1. Scans `~/.claude/projects/**/*.jsonl`, skipping subagent transcripts, and counts (a) Skill tool calls by skill name and (b) typed slash commands by name, each with its timestamp and the session's folder.
2. Keeps only names the pane lists (built-ins and other plugins' commands drop out, as for live counts).
3. Files each use under the main repo of its folder (same worktree-to-main rule as live counts).
4. Merges into `usage` through the re-read-then-write store path: counts add, `lastUsed` takes the later, `since` becomes the oldest transcript's date.
5. Writes an import marker so it never runs twice; the pane shows "Importing history…" while it runs and drops the line when done.

## Constraints

- Never blocks the session or the pane; a failure leaves live counting untouched and is retried next session at most once more.
- Reads transcripts through the mod's own `$.fs`; files over its 4 MiB read cap go through `grep` where it exists and are skipped where it does not (Phil, 2026-10-26).
- No double counting: a typed `/name` that expands a skill is one use, not two; subagent transcripts are skipped.
- One failing test for the parser and merge on a small fake projects folder; no new harness.

## Open for the planner

- How a mod runs work that outlives `session.start` (`$.clock.after`, budgets) and how long a scan of ~7k files takes through `$.fs`.
- How to tell subagent transcripts apart (path or a field inside).
- How a typed `/name` and its skill expansion appear in a transcript, to avoid the double count.

## Cut list

- A manual "re-import" button.
- Importing from `~/.claude/history.jsonl` (prompt history without session folders).
- Per-day history or charts.

Budget: 3.5 agent-hours (Phil, 2026-10-26; raised from 3 h to read transcripts over 4 MiB with grep).
- research and plan: 0.5 h
- scanner and merge, test-first, grep for large files: 2 h
- pane status line, wiring, review: 1 h
