# My Skills panel redesign: build spec

Redesign of the "My skills" side-panel mod. The design canvas is https://claude.ai/artifact/VYTeP7gC79tnAhdfgKGgfK. Two reference mockups sit next to this file: `Main.dc.html` (list) and `Detail.dc.html` (skill detail). They are HTML mockups with sample data, not production code. Use them for layout, copy and styling, and build it the way the existing mod is built.

## Goals

1. **Scanability.** The same skills no longer show up in three lists, every row uses the same columns, and muted styling has a stated meaning.
2. **Health.** Problems show at the top of the panel and can be fixed there, not only in hover tooltips.
3. **Skill detail.** Clicking a skill opens a detail view with stats, a 30-day trend, the fix for any health issue, and actions.
4. **Search.** This is new; the panel has no search today.

## Data the panel needs

For each skill:

- `name`
- `source`: one of `global` (~/.config/skillshare/skills), `user` (~/.claude/skills, ~/.claude/commands), `account` (claude.ai › Customize › Skills), `project` (<cwd>/.claude)
- `path`
- `description`
- `starred`
- `uses`: total since counting began
- `lastUsedAt`
- `issues[]`: health problems
- `dailyUses[30]`: **new.** A per-day count for the last 30 days, which drives the trend line. If the usage log stores a timestamp for each use, compute this from the log. If it only keeps a running total, start writing a dated event for each use now; the trend line shows "no data" until there is history.

Per working directory, the panel also needs the list of skills used there and their counts. This already exists as "Most used here".

Known issue types:

- `name-collision`: the same name exists in two or more sources, so the `/name` command could load either one. Example: phil-writing exists in both Global and Account.
- The 9 User-source skills are flagged today. **Find out what that flag means in the current code** and keep its message.

## Panel layout (top to bottom)

### 1. Header

- Title "Skills" followed by the total count in a muted color.
- Icon buttons, each 44×44: Search, Refresh, Expand, Close.
- Search highlights while it is open.
- Refresh replaces the old "Refr…" text button, which was cut off.

### 2. Search field

Shown when Search is toggled on.

- Searches across **all sources**. It matches the skill name and the source name. Also matching the description is a good addition.
- While the search text is not empty, sections 3 to 7 are hidden and a results list shows instead. Each result is a normal row with its source name underneath.
- The results header reads "N matches across all sources · by <sort>". With no results it reads `No skills match "<q>"`.
- A clear button empties the field. Esc empties it and closes search.

### 3. Health card

Only shown when at least one skill has an issue.

- Amber card titled "N skills need attention".
- One action row per issue group:
  - A name collision is one row: the skill name, "Name collision · Global and Account", and a **Fix** button that opens that skill's detail view.
  - Issues of the same type in the same source are grouped into one row: "9 User skills", the reason, and a **Review** button that filters the list to that source.

### 4. Sort control

- Segmented control with Recent, Most used and Name. The selected option is a white pill.
- It sorts **every list**: Active here, Starred, All skills and search results.
- Recent sorts by `lastUsedAt` descending, with ties broken by uses. Most used sorts by uses descending, with ties broken by name. Name sorts A to Z.

### 5. "Active here" section

- Collapsible.
- The header shows the shortened current directory (~/Development) and the count.
- Contains the skills used most in this directory. This replaces "Most used here".

### 6. "Starred" section

- Collapsible.
- Starred skills used in the last 30 days are listed normally.
- Starred skills that are idle (not used in 30+ days, or never used) are folded into one row: "N idle · no use in 30+ days" with Show and Hide. This replaces the old grey text, which had no explanation.

### 7. "All skills" section

- The header shows "All skills" and, on the right, "by <sort>".
- Filter chips for the sources: Global 65, User 9, Account 7, Project 0. The selected chip is filled dark. A source that has issues shows a small amber dot on its chip.
- Below the chips is the selected source's path in muted text.
- The list shows the first 12 skills, followed by a "Show all N" button.
- This replaces the old stacked Global, User, Project and Account sections, which repeated the starred and most-used skills.

### 8. Footer

"Uses since <date>, preloads included".

## Row (same in every list)

Each row is at least 44px tall and uses a flex layout with an 8px border radius. The background is #F4F2EC on hover. Left to right:

| Column | Spec |
| --- | --- |
| Star | 32×32 button. Filled #1F1E1D when starred, outline #B5B2A8 when not. It toggles in place. aria-label is "Star X" or "Unstar X", plus aria-pressed. |
| Name | 14px. Grows to fill the space and truncates with an ellipsis. #1F1E1D, or #5F5E5A when never used. If the skill has an issue, a 14px amber warning icon follows the name (aria-label "Needs attention"). |
| Trend | 44×18 sparkline (see below). |
| Uses | 36px wide, right-aligned, 13px, tabular numbers, #4A4945. Shows `N×`, or `—` if never used. |
| Last used | 40px wide, right-aligned, 12px, #73726C. Shows `4h`, `1d`, `33d` or `never`. |

Clicking the row, but not the star, opens the detail view.

## Trend sparkline

- Shows the last 30 days as 10 points, each summing 3 days of `dailyUses`.
- Drawn as a polyline: x from 1 to 43, y scaled to the row's own maximum (16 at zero, 3 at the maximum). Stroke width 1.5, round caps and joins.
- Trend rule: compare the average of the last 3 points with the average of the first 3. Above 1.2× the first is **rising**, below 0.8× is **fading**, anything else is **steady**.
- Colors: rising and steady #4A4945, fading #A9A69C. With no uses in 30 days it is a flat line at y=16 in #D6D3CA.
- `role="img"` with aria-label "30-day trend: rising / steady / fading / no use".

## Detail view

Opens inside the same panel. A back chevron returns to the list.

1. **Title row:** the name (22px, semibold) and a star toggle button (44px).
2. **Chips:** a monospace `/name` command chip, plus an outlined chip for each source the skill exists in.
3. **Stats:** three tiles in a grid of three columns: uses, last used, and a third stat. The mockup shows rank as `[#]`; leave it out if rank is not cheap to compute.
4. **Last 30 days:** a 340×56 line chart of `dailyUses` with "30d ago" and "Today" labels. The trend word (rising, steady, fading) appears at the top right.
5. **Health card:** only shown if the skill has an issue. For `name-collision`:
   - Title: "Two skills answer to /name"
   - Body: "Claude may load either one. Pick the copy to keep."
   - A radio group with one card per copy, showing the source name and its path. The selected card reads "Keep <Source>".
   - Main button: "Remove <other> copy". Second button: "Rename other copy". Rename asks for the new name inline.
   - **Ask for confirmation before deleting anything.** Removing a Global copy deletes files under ~/.config/skillshare. An Account copy can't be removed from here, so link out to claude.ai › Customize › Skills instead.
6. **Description:** the full description text.
7. **Actions:** Open SKILL.md, Copy /name, Reveal in Finder.

## Visual tokens (match the Claude app)

- **Font:** system-ui.
- **Sizes:** 16 for the header, 14 for body text and rows, 13 for section titles and controls, 12 for meta text.
- **Background:** #FFFFFF.
- **Hover:** #F4F2EC.
- **Segment track:** #F0EEE7.
- **Dividers:** #ECEAE3 and #F0EEE7.
- **Text:** #1F1E1D, #4A4945, #5F5E5A, #73726C. All of these pass 4.5:1 contrast on white. Don't use anything lighter for text.
- **Chip border:** #DEDBD2. Selected chip: #1F1E1D background with #FFFFFF text.
- **Warning:** background #FDF8EC, border #F0DDB5, title #6B4600, body #5C3F00, icon and action text #8A5A00, dot #C27C0E.
- **Radii:** 12 for cards, 10 for icon buttons and the search field, 8 for rows and the segment pill, 999 for chips.
- **Hit targets:** 44px minimum everywhere except the 32px star button and chips. Every clickable element is a real `<button>` or `<a>`, and icon-only buttons have an aria-label.

## Out of scope / open questions

- The meaning of the current User-source flag. Find it in the code.
- Whether rank is worth computing.
- Whether "Show all N" opens the list inline or as a full view. Default: inline.
