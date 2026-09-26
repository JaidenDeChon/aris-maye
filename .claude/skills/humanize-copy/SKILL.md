---
name: humanize-copy
description: Run the copy-humanizer agent on a loop, one file at a time, so every label, sentence and message a player sees on Aris Maye is checked against the humanizer skill and rewritten to sound human, and to make sense to an OSRS player who has never used the site, without losing details. Use when asked to humanize the site, clean up AI-sounding UI text or copy, or run the humanizer loop. Optional args are a file path to do just that one, a number N to stop after N files, or `docs` to sweep the Markdown docs instead of the interface.
---

# Humanize copy on a loop

Drives `.claude/agents/copy-humanizer.md` one file at a time. The agent takes the next file from `python3 scripts/humanize_copy.py next`, goes through its user-facing text with `.claude/skills/humanizer/SKILL.md`, verifies with `scripts/humanize_copy.py check` plus Prettier, ESLint, `bun run check` and `bun test`, records the file in `.claude/humanized-copy.json`, and commits locally. This skill repeats that and pushes the results.

The default queue walks the interface in the order that settles a control's name before anything refers to it (`UI_ORDER` in the script): the layout, header and sidebar; the account types, character switcher, character dialog and My character page; the items list, item card and its buttons; the item page and its recipe card; then the home page hero and the FAQ, which describe all of the above. Any other `.svelte` file under `src/` that holds copy comes after, alphabetically. The shadcn-svelte components in `src/lib/components/ui/`, the developer-only item upload dialog and the unused `nav-user.svelte` are never offered. After every file is done once, a file whose content changed since it was humanized comes back into the queue.

The docs sweep (`docs`) uses `python3 scripts/humanize_copy.py next --docs`. It covers `README.md`, `docs/ironman-feature-recommendations.md`, `docs/ironman-ui-plan.md` and the Markdown notes in `scripts/`, for a developer who is new to the repo. Run it after the interface sweep, so a doc that mentions a control can use its final name.

## Arguments

- **A file path:** run the agent once on that file, then stop.
- **`docs`** (optionally followed by N): work the docs sweep instead of the default queue.
- **A number N:** stop after N files.
- **No arguments:** keep going until the agent reports `ALL DONE`, or something blocks.

## Before the first iteration

Run `python3 scripts/humanize_copy.py status` (with `--docs` for the docs sweep) and tell the user how many files are done and how many remain.

## Each iteration

1. Dispatch the `copy-humanizer` agent in the foreground, one at a time. Pass the file if one was given; otherwise give no target (and in the docs sweep, tell it to work the docs sweep). Never let parallel runs pick their own "next" item: they would take the same one and collide on the ledger.
    - Docs (not interface files) may run in parallel batches if each agent is given an explicit, distinct path and told not to record or commit. After the batch, for each doc: run `check`, spot-check it (step 3), then `record` and commit it yourself, one commit per doc. Interface files always run one at a time, because later files, the FAQ and the docs depend on the names they settle on, and several files share tests and copy.
2. Read its report:
    - **`ALL DONE`** → stop.
    - **A blocker** (uncommitted changes on the file, a check it could not pass without losing meaning, a failing test that is not about wording) → tell the user what's blocking and stop. Don't retry blindly.
3. Spot-check the commit. `git show --stat HEAD` must touch only that file and the ledger, plus, for an interface file, any test that asserts its wording. Then skim `git show HEAD -- "<file>"` for a changed game term (item, skill or account-type name), a changed number or duration, a switch whose `aria-label` no longer matches its visible label, a string that was also an id, or plan-fixed copy from `docs/ironman-ui-plan.md` that was rewritten anyway. If you find one, fix it in a follow-up commit before moving on.
4. Push every 5 files, and at the end: `git push -u origin <current branch>`. If there's no open PR for the branch, open one. Never push to the default branch.
5. Give the user a one-line status per file: path, strings changed, main patterns removed. List any renamed control and pass that rename to every later agent in the sweep, so the FAQ, the hero and the docs use the new name. Collect the agent's suggested rewrites for plan-fixed copy and its reported fact conflicts, and give them to the user at the end, since only a person can settle those.

## Pacing

The interface sweep is about 30 files and the docs sweep 5, so one session can usually finish a sweep. Large files (the item page, the My character page, the recipe tree) take the longest. For an unattended run, prefer `/loop /humanize-copy 5` or a scheduled Routine that invokes this skill with a number, so each firing does a batch in a fresh context.
