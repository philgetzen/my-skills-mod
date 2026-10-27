# my-skills for Claude Code

A mod for [Claude Code](https://claude.com/claude-code) that adds a **My skills** pane to the session rail. It lists the skills and slash commands you wrote or added yourself, shows how often you use each one, and flags the ones that are broken or in the wrong place.

## Quick start

1. Install it. At the prompt of a Claude Code terminal session:

   ```
   /plugin install my-skills --marketplace philgetzen/my-skills-mod
   ```

   Answer `y` to add the marketplace, then pick a scope. From a shell, run `claude plugin install my-skills --marketplace philgetzen/my-skills-mod` instead. In the Claude desktop app, where `/plugin` does not run, click + next to the prompt box, then Plugins, Add marketplace with `philgetzen/my-skills-mod`, then Add plugin.

2. Start a new session. The pane opens on its own and lists the skills in `~/.claude/skills`, the commands in `~/.claude/commands`, your project's own skills and commands, and the skills on your claude.ai account.

That's all most people need. If you share one skills folder across several agents with [skillshare](https://github.com/runkids/skillshare), see [Using skillshare](#using-skillshare).

Close the pane and run `/my-skills` to bring it back and rescan.

## What it does

- **Lists your skills by where they live:** Global, User, Project and Account, each with its own section.
- **Counts use:** every row shows how many times you've used it and when you last did (`12× · 3d ago`). Your past sessions are imported on first run, so the counts start with your history.
- **Dims what you don't use:** anything untouched for 30 days is greyed out.
- **Flags problems:** a `!` marks a skill with no description, a broken link, or a name that appears in two places. The hover card says what's wrong and how to fix it.
- **Shows what you use in this repo:** a **Most used here** section lists your top five skills in the current project.
- **Stars, sorting and collapsing:** star the ones you reach for, sort by Recent, Most used or Name, and fold away sections you don't need.
- **Opens the source:** click a name to open its `SKILL.md` or command file in your editor.

## Why I built it

I have more skills than I can remember the names of. As I write this, 66 live in my shared skills folder alone, and more sit in `~/.claude/skills`, in single projects, and on my claude.ai account. When I wanted one, I often couldn't recall what I'd called it, and the only way to see the list was to run a skills command in the session. That stopped whatever I was doing to answer a question that should have taken a glance.

So the first version did one thing: it kept the list beside the conversation, grouped by where each skill lives, where I could check a name without leaving my work.

Once the list was always in view, two more problems showed up. I couldn't tell which skills I still used, so I was deciding what to prune from memory. And a broken symlink, a skill with no description, or two skills answering to the same name only came to light when one of them misfired in the middle of real work. Use counts and health flags came next, so each row now carries the two facts I kept wanting: how much I use it, and whether anything is wrong with it.

## How it works

### Sections

| Section | What it reads |
|---|---|
| **Global** | `~/.claude/skills` by default: the personal skills Claude Code loads in every project. Point it at a shared folder instead if you keep one (see [Using skillshare](#using-skillshare)). |
| **User** | `~/.claude/commands`. When Global points at another folder, User also lists the skills in `~/.claude/skills` that aren't already under Global. |
| **Project** | `.claude/skills` and `.claude/commands` in the session's project root. Links that point outside the project are left out. |
| **Account** | Skills uploaded to your claude.ai account, read from the copy Claude Code syncs to `~/.claude/skills/synced`. |

Two more sections sit above those. **Starred** holds the skills you've starred: hover a row, click the ☆ after the name, and click ★ to unstar. **Most used here** appears once you've used skills five times in the current project and lists the five you use most there. Uses in a git worktree count toward its main repo, so every worktree of a project shares one list. Hovering a skill in either section also shows where it lives (`Global · ~/.claude/skills/verify/SKILL.md`).

Click the ▼ beside a section's title to collapse it to that one line, and the ▶ to open it again. Stars, collapsed sections and your sort choice are all saved across sessions.

### Hover and click

Hover a name to see its description in a floating card. Click it to open the file in your default editor. An Account skill opens its page in Customize › Skills in the Claude desktop app instead.

### Use counts

The mod counts a use each time Claude Code loads a skill or command, whether you typed `/name` or Claude called it, and keeps the count and the last-used date per name. Rows show both. The **Sort** box at the top orders every section by Recent, Most used or Name.

Counts would be empty for weeks if they started at install, so on its first run the mod reads your past sessions under `~/.claude/projects` once, in the background, and counts the skills and commands they used. The pane says "Importing history…" while it works. Only names the pane lists are counted, so built-in commands and other plugins' skills drop out. Subagent transcripts are skipped. Transcripts over 4 MB are read with `grep` where your system has it (macOS and Linux do) and skipped where it doesn't. The note at the bottom of the pane says how far back the counts go.

From then on, every load counts, including skills a subagent preloads. Treat the numbers as a guide to what you use, not an exact tally.

### Health flags

A `!` after a name means one of these, and the hover card leads with the fix:

- **No description.** Claude can't tell when to use the skill. Add a `description:` line to the top of its file.
- **Broken link.** The entry points at something that isn't a skill folder. Delete the link or repoint it.
- **Same name in two sections.** Both answer to `/name`, so the wrong one may load. Rename or remove one.
- **Not in your Global folder.** Only when Global points at a shared folder: a skill in `~/.claude/skills` that didn't come from it, so your other agents don't get it. See [Using skillshare](#using-skillshare).

A section with flagged rows shows the count beside its title (`2 health`), and the count stays visible when the section is collapsed.

### What it touches

Everything stays on your machine. The mod reads your skill folders and session transcripts and keeps its counts, stars and settings in Claude Code's plugin store. It makes no network calls. Watching skill loads never changes them: if the counter fails, the skill runs exactly as it would have.

## Using skillshare

[skillshare](https://github.com/runkids/skillshare) keeps one folder of skills, `~/.config/skillshare/skills` by default, and links it into Claude Code and your other AI agents. If that's how you work, point the pane's Global section at that folder:

1. Set **Global skills folder** to `~/.config/skillshare/skills` (or wherever your skillshare source lives). The install asks for it; to change it later, open `/config` and find the my-skills setting.
2. Start a new session or run `/my-skills`.

Global then lists your shared folder, and User lists anything in `~/.claude/skills` that skillshare didn't put there. Each of those gets a **Not in your Global folder** flag, because your other agents won't see it. Run `skillshare collect claude` to move it into the shared folder, or delete it if it's a leftover.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Global skills folder | `~/.claude/skills` | The folder shown as Global. Change it only if you keep skills in a folder shared across agents. |
