# my-skills

A Claude Code mod that adds a **My skills** pane to the session rail. It lists the skills and slash commands you wrote yourself, shows how often you use each one, and flags the ones that are broken or in the wrong place.

## Quick start

1. Install it. At the prompt of a terminal session:

   ```
   /plugin install my-skills --marketplace philgetzen/my-skills-mod
   ```

   Answer `y` to add the marketplace, then pick a scope. From a shell, run `claude plugin install my-skills --marketplace philgetzen/my-skills-mod` instead. In the desktop app, where `/plugin` does not run, click + next to the prompt box, then Plugins, Add marketplace with `philgetzen/my-skills-mod`, then Add plugin.

2. Start a new session. The pane opens on its own.

3. If you keep shared skills somewhere other than `~/.config/skillshare/skills`, set **Global skills folder** when the install asks, or later in `/config`. If you don't keep a shared folder, leave the default.

Close the pane and run `/my-skills` to bring it back and rescan.

## What it does

- **Lists your skills by where they live:** Global, User, Project and Account, each with its own section.
- **Counts use:** every row shows how many times you've used it and when you last did (`12× · 3d ago`). Your past sessions are imported on first run, so the counts start with your history.
- **Dims what you don't use:** anything untouched for 30 days is greyed out.
- **Flags problems:** a `!` marks a skill with no description, a broken link, a name that appears in two places, or a skill sitting outside your shared folder. The hover card says what's wrong and how to fix it.
- **Shows what you use in this repo:** a **Most used here** section lists your top five skills in the current project.
- **Stars, sorting and collapsing:** star the ones you reach for, sort by Recent, Most used or Name, and fold away sections you don't need.
- **Opens the source:** click a name to open its `SKILL.md` or command file in your editor.

## Why I built it

My skills live in four places. Most sit in a shared folder that [skillshare](https://github.com/runkids/skillshare) links into Claude Code and my other agents. A few live in `~/.claude/skills` directly, some belong to a single project, and some I uploaded to my claude.ai account. As I write this, the shared folder alone holds 66.

Typing `/` in the prompt box is a good way to find and run a skill, so this pane doesn't try to replace it. What `/` doesn't tell me is which of those skills I wrote, which ones I still use, and which ones are quietly broken. I was deciding what to prune from memory. A broken symlink, a skill with no description, or two skills answering to the same name only came to light when one of them misfired in the middle of real work.

So the pane's job is judgment rather than launching. It puts every skill I made in one list, grouped by where it lives, and attaches the two facts I kept wanting: how much I use it, and whether anything is wrong with it.

## How it works

### Sections

| Section | What it reads |
|---|---|
| **Global** | Your shared skills folder, `~/.config/skillshare/skills` by default. |
| **User** | `~/.claude/skills` and `~/.claude/commands`, minus anything already listed under Global. |
| **Project** | `.claude/skills` and `.claude/commands` in the session's project root. Links that point outside the project are left out. |
| **Account** | Skills uploaded to your claude.ai account, read from the copy Claude Code syncs to `~/.claude/skills/synced`. |

Two more sections sit above those. **Starred** holds the skills you've starred: hover a row, click the ☆ after the name, and click ★ to unstar. **Most used here** appears once you've used skills five times in the current project and lists the five you use most there. Uses in a git worktree count toward its main repo, so every worktree of a project shares one list. Hovering a skill in either section also shows where it lives (`Global · ~/.config/skillshare/skills/verify/SKILL.md`).

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
- **Not in your Global folder.** A skill in `~/.claude/skills` that didn't come from your shared folder, so your other agents don't get it. Move it with `skillshare collect claude`, or delete it if it's a leftover. This flag only appears when your Global folder has skills in it.

A section with flagged rows shows the count beside its title (`2 health`), and the count stays visible when the section is collapsed.

### What it touches

Everything stays on your machine. The mod reads your skill folders and session transcripts and keeps its counts, stars and settings in Claude Code's plugin store. It makes no network calls. Watching skill loads never changes them: if the counter fails, the skill runs exactly as it would have.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Global skills folder | `~/.config/skillshare/skills` | The folder shown as Global. Point it at wherever you keep skills shared across agents. |
