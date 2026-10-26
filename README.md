# my-skills

A Claude Code mod that opens a "My skills" pane listing the skills and slash commands you created yourself, in three groups:

- **Global**: a folder of skills shared across all your agents. It defaults to `~/.config/skillshare/skills`, and you can change it when you install the mod or later in `/config`.
- **User**: `~/.claude/skills` and `~/.claude/commands`, minus anything already listed under Global.
- **Project**: `.claude/skills` and `.claude/commands` in the session's project root.
- **Account**: the skills you uploaded to your claude.ai account, read from the copy Claude Code syncs to `~/.claude/skills/synced`.

A **Starred** section sits at the top: hover a row and click the ☆ after the name to star it, click ★ to unstar. Stars are saved across sessions.

Hover a name to see what the skill does. Click it to open its `SKILL.md` (or command file) in your default editor, or, for an Account skill, its page in Customize › Skills in the Claude desktop app.

Each row shows how often you have used the skill and when you last did (`12× · 3d ago`). A skill you have not used in 30 days is dimmed. Counts start when you install the mod and include every time a skill is loaded, subagent preloads included, so treat them as a guide rather than an exact tally.

A `!` after a name flags a problem, with the reason in the hover card: the skill has no description, its link points nowhere, the same name appears in two sections, or it sits in `~/.claude/skills` without coming from your Global folder. A section with flagged rows says how many beside its title (`2 health`).

Once you have used skills five times in a project, a **Suggested for this repo** section lists the ones you use most there.

Run `/my-skills` to reopen the pane and rescan. The pane also has a Refresh button.

## Install

At the prompt of a terminal session:

```
/plugin install my-skills --marketplace philgetzen/my-skills-mod
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install my-skills --marketplace philgetzen/my-skills-mod
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `philgetzen/my-skills-mod`, then Add plugin.
