# my-skills for Claude Code

A mod for [Claude Code](https://claude.com/claude-code) that adds a **My skills** pane to the session rail. It lists the skills and slash commands you wrote or added yourself, shows how often you use each one, and flags the ones that are broken or in the wrong place.

## Quick start

1. Install it. At the prompt of a Claude Code terminal session:

   ```
   /plugin install my-skills --marketplace philgetzen/my-skills-mod
   ```

   Answer `y` to add the marketplace, then pick a scope. From a shell, run `claude plugin install my-skills --marketplace philgetzen/my-skills-mod` instead. In the Claude desktop app, where `/plugin` does not run, click + next to the prompt box, then Plugins, Add marketplace with `philgetzen/my-skills-mod`, then Add plugin.

2. Start a new session and run `/my-skills`. The pane opens in the session rail and lists the skills in `~/.claude/skills`, the commands in `~/.claude/commands`, your project's own skills and commands, and the skills on your claude.ai account.

That's all most people need. If you share one skills folder across several agents with [skillshare](https://github.com/runkids/skillshare), see [Using skillshare](#using-skillshare).

Run `/my-skills` again any time to reopen the pane and rescan.

## What it does

- **Lists every skill once:** pick a source with the chips (Global, User, Account, Project, Plugins) and the list shows that source's skills, twelve at a time.
- **Counts use:** every row shows how many times you've used it, when you last did, and a small 30-day trend line. Your past sessions are imported on first run, so the counts start with your history.
- **Puts problems at the top:** a health card lists what needs attention, with a button that opens the fix or filters the list to the skills it means.
- **Fixes a name collision for you:** when two copies answer to the same `/name`, the skill's detail view lets you pick the copy to keep and move the other to the Trash.
- **Searches:** find a skill by name, source or description across every source at once.
- **Shows what you use in this repo:** an **Active here** section lists your top five skills in the current project.
- **Stars and sorting:** star the ones you reach for, and sort every list by Recent, Most used or Name.

## Why I built it

I have more skills than I can remember the names of. As I write this, 66 live in my shared skills folder alone, and more sit in `~/.claude/skills`, in single projects, and on my claude.ai account. When I wanted one, I often couldn't recall what I'd called it, and the only way to see the list was to run a skills command in the session. That stopped whatever I was doing to answer a question that should have taken a glance.

So the first version did one thing: it kept the list beside the conversation, grouped by where each skill lives, where I could check a name without leaving my work.

Once the list was always in view, two more problems showed up. I couldn't tell which skills I still used, so I was deciding what to prune from memory. And a broken symlink, a skill with no description, or two skills answering to the same name only came to light when one of them misfired in the middle of real work. Use counts and health flags came next, so each row now carries the two facts I kept wanting: how much I use it, and whether anything is wrong with it.

## How it works

### The list

From the top, the pane shows:

1. **Header.** "Skills" and how many there are, then Search, Refresh and Close.
2. **Search.** Press Search to open the field (the mobile app has no text field yet, so it's hidden there). While it holds text, everything below it gives way to the matches from every source, each with its source under it, and a line such as "3 matches across all sources · by recent". Clear empties it; pressing Search again closes it.
3. **Health card.** Shown only when something is wrong, titled with how many skills need attention. A name collision gets a row of its own with a **Fix** button that opens that skill's detail view. Every other problem is grouped by kind and source, such as "9 User skills · Not in your Global folder", with a **Review** button that switches the All skills list to that source.
4. **Sort.** Recent, Most used or Name. It orders every list in the pane, search results included. Recent breaks ties by uses, Most used by name.
5. **Active here.** Appears once you've used skills five times in the current project and lists the five you use most there. The header names the project folder. Uses in a git worktree count toward its main repo, so every worktree of a project shares one list.
6. **Starred.** The skills you've starred and used in the last 30 days. Starred skills you haven't touched in 30 days or more fold into one line, "4 idle · no use in 30+ days", which shows or hides them.
7. **All skills.** One chip per source with its count; an amber dot beside a chip means that source has a skill needing attention. Under the chips is the folder the source reads from. The list shows the first twelve skills and a "Show all" button for the rest.

Click the ▼ beside Active here or Starred to collapse it, and the ▶ to open it again. Stars, collapsed sections, the sort and the chosen source are saved across sessions.

### Sources

| Source | What it reads |
|---|---|
| **Global** | `~/.claude/skills` by default: the personal skills Claude Code loads in every project. Point it at a shared folder instead if you keep one (see [Using skillshare](#using-skillshare)). |
| **User** | `~/.claude/commands`. When Global points at another folder, User also lists the skills in `~/.claude/skills` that aren't already under Global. |
| **Account** | Skills uploaded to your claude.ai account, read from the copy Claude Code syncs to `~/.claude/skills/synced`. |
| **Project** | `.claude/skills` and `.claude/commands` in the session's project root. Links that point outside the project are left out. |
| **Plugins** | The skills and commands your enabled plugins add, named `plugin:skill` as you type them. They're never flagged: plugin names can't clash with yours, and the mod won't move a plugin's files. |

### Rows

Every list uses the same row: a star, the name, a `!` when the skill needs attention, a 30-day trend line, the use count (`12×`, or `—` if never used) and how long ago you last used it (`4h`, `3d`, `never`). A name you've never used is drawn dim. While the history import is still running, a skill with no uses yet shows `…` in place of `—` and `never`, since its uses may still be on the way. The trend line sums the last 30 days in ten three-day steps and reads as rising, steady or fading; in the terminal it's drawn with block characters. In a narrow pane (under 48 columns) the trend line is left out, a name too long for its column is shortened in the middle (`anthrop…insights-writer`), and the header and sort controls wrap onto a second line.

Click the star to star or unstar a skill. Click the name to open its detail view.

### Detail view

The detail view replaces the list in the same pane; "‹ Skills" goes back. It shows:

- The name, a star, the `/name` you type, and every source that has a skill by that name.
- Uses, when you last used it, and its rank among your skills by uses.
- A chart of the last 30 days, day by day, with the trend word.
- Any problem with the skill, and what to do about it.
- The full description.
- Actions: **Open SKILL.md** (or the command's file; an Account skill opens its page in Customize › Skills in the Claude desktop app), **Copy /name**, and **Reveal in Finder**. A plugin skill opens from the plugin's install folder. A broken link, or a plugin command with no file, offers nothing to open.

### Fixing a name collision

When two copies answer to the same `/name`, Claude may load either one. The detail view lists each copy with its path and asks which to keep. Nothing is picked at first and nothing can be removed until you pick. Then a "Remove Global copy" button (or whichever source the other copy is in) asks once more, "Move the Global copy to trash?", and only Confirm does it.

How the other copy goes depends on where it lives:

- **Global, when Global is a skillshare folder.** The mod runs `skillshare uninstall <name> -g --force`, which moves the skill into skillshare's own trash. Commit the change in `~/.config/skillshare` and run `skillshare sync` afterwards so your other agents drop it too. A name skillshare could read as anything other than a plain skill name goes to the Trash instead.
- **Everything else** (Global at `~/.claude/skills`, User, Project). The skill's folder, or the command's file, moves to `~/.Trash` with the date and time added to its name, so nothing there is overwritten and you can put it back from the Finder.
- **Account.** The mod can't remove it. The button opens the skill's page in Customize › Skills instead.

If the move fails, the pane shows the error and changes nothing. There is no rename yet.

### Use counts

The mod counts a use each time Claude Code loads a skill or command, whether you typed `/name` or Claude called it, and keeps the count, the last-used date, the uses per day for the last 30 days, and the uses per project.

Counts would be empty for weeks if they started at install, so on its first run the mod reads your past sessions under `~/.claude/projects` once, in the background, and counts the skills and commands they used. The pane says "Importing history…" while it works. Only names the pane lists are counted, so built-in commands and other plugins' skills drop out. Subagent transcripts are skipped. Transcripts over 4 MB are read with `grep` where your system has it (macOS and Linux do) and skipped where it doesn't. The note at the bottom of the pane says how far back the counts go.

From then on, every load counts, including skills a subagent preloads. Treat the numbers as a guide to what you use, not an exact tally.

### Health flags

A `!` after a name means one of these:

- **No description.** Claude can't tell when to use the skill. Add a `description:` line to the top of its file.
- **Broken link.** The entry points at something that isn't a skill folder. Delete the link or repoint it.
- **Name collision.** Two sources have a skill by the same name, so the wrong one may load. Fix it from the skill's detail view.
- **Not in your Global folder.** Only when Global points at a shared folder that has skills in it: a skill in `~/.claude/skills` that didn't come from it, so your other agents don't get it. See [Using skillshare](#using-skillshare).

### What it touches

Everything stays on your machine. The mod reads your skill folders and session transcripts and keeps its counts, stars and settings in Claude Code's plugin store. It makes no network calls. It changes your skill folders only when you confirm a collision fix, and then only the one copy you chose to remove. Watching skill loads never changes them: if the counter fails, the skill runs exactly as it would have.

## Using skillshare

[skillshare](https://github.com/runkids/skillshare) keeps one folder of skills, `~/.config/skillshare/skills` by default, and links it into Claude Code and your other AI agents. If that's how you work, point the pane's Global section at that folder:

1. Set **Global skills folder** to `~/.config/skillshare/skills` (or wherever your skillshare source lives). The install asks for it; to change it later, open `/config` and find the my-skills setting.
2. Run `/my-skills` to reopen the pane with the new folder.

Global then lists your shared folder, and User lists anything in `~/.claude/skills` that skillshare didn't put there. Once the shared folder has skills in it, each of those User skills gets a **Not in your Global folder** flag, because your other agents won't see it. Run `skillshare collect claude` to move it into the shared folder, or delete it if it's a leftover.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Global skills folder | `~/.claude/skills` | The folder shown as Global. Change it only if you keep skills in a folder shared across agents. |
