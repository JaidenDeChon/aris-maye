# Wiki name normalization

## The problem

OSRSBox (`osrsreboxed-db`) does not store the real OSRS Wiki page title for items that
live on a "switch infobox" page. Instead it synthesises `wiki_name` by appending the
infobox **version label** in parentheses, and points `wiki_url` at an anchor:

| field       | value                                                |
| ----------- | ---------------------------------------------------- |
| `id`        | `5364`                                               |
| `name`      | `Oak seedling (w)` ← real in-game name               |
| `wiki_name` | `Oak seedling (Watered)` ← **synthetic, not a page** |
| `wiki_url`  | `.../w/Oak_seedling#Watered`                         |

There is no wiki page called `Oak seedling (Watered)`. The real page is `Oak seedling`,
and `Watered` is one of its infobox versions.

`scripts/populate-ingredients.ts` derived the wiki page title to scrape from
`owner.wiki_name ?? owner.name`, so for every one of these items it requested a page
that does not exist, found no `Creation` section, and left the item with **no
`creationSpecs`**.

### Scope

Measured against `osrsreboxed-db` `items-complete.json` (28,744 items):

- **8,377** items have an anchored `wiki_url` (~29% of the dataset).
- **8,266** of those have `wiki_name != name`.
- For **all 8,377**, `wiki_name` is exactly `"<page title> (<anchor>)"` — the pattern is
  perfectly consistent, so it can be undone mechanically.
- `normalizeTitleForLookup()` previously stripped only `(N)` dose suffixes and
  `(unpoisoned)`, which covers roughly 1,500 of them. The rest silently failed.

Most common version labels: `2 dose`, `1 dose`, `Unpoisoned`, `Normal`, `4 dose`,
`3 dose`, `Broken`, `Inventory`, `Poison`, `Poison+`, `Poison++`, `Uncharged`,
`Un-attuned`, `Inactive`, `Charged`, `Locked`, `Worn`, `Attuned`, `Undamaged`,
`Unpolished`, `Polished`, `Active`, `Empty`, `Watered`, `Unwatered`, …

So this is **not** a seedling-specific problem. Watered seedlings are just the instance
that surfaced, because saplings sort to the top of the ROI list.

### Why a regex on `wiki_name` is the wrong fix

**4,257** items have a `wiki_name` that legitimately ends in a parenthetical _and_ is a
real page title — `Longbow (u)`, `Oak shortbow (u)`, `Holy grail (item)`, `Ring of
charos (a)`. Blindly stripping a trailing `(...)` would corrupt all of those.

`wiki_url` is the reliable discriminator. Verified across the whole dataset:

- anchored items where `wiki_name` does **not** start with the URL's page title: **0**
- items with a `wiki_url` but no `wiki_name`: **0**

So: **if `wiki_url` contains a `#`, the page title is the part before it and the version
is the part after it.** No guessing, no heuristics.

## The fix

`src/lib/helpers/wiki-page-title.ts` derives, from `wiki_url` (authoritative) with a
`wiki_name`/`name` fallback:

- `wiki_page_title` — the real, fetchable wiki page title (`Oak seedling`)
- `wiki_version` — the infobox version label, or `null` (`Watered`)

These are persisted as new fields on the item document. `wiki_name` and `wiki_url` are
left untouched, so nothing that already relies on them changes behaviour, and the
variant information is preserved rather than thrown away.

Applied in three places so the data cannot drift back:

1. **`scripts/grab-osrsbox-items.ts`** — stamps the fields on every upsert, so a fresh
   import is correct from the start. (Without this, re-running the import would
   reintroduce the problem on every update.)
2. **`scripts/backfill-missing-items.ts`** — same, for items sourced from the price
   mapping / wiki rather than from OSRSBox.
3. **`scripts/normalize-wiki-names.ts`** — a standalone, idempotent repair pass over the
   existing collection, wired into `scripts/update-db.ts` as the `wiki-names` step so it
   runs before `populate-ingredients`.

`scripts/populate-ingredients.ts` then scrapes `wiki_page_title` instead of `wiki_name`.

## The second defect: untradeable ingredients priced at 1gp

Fixing the names lets watered seedlings acquire `creationSpecs`, but on its own it does
**not** fix the "saplings show ≤1gp investment / absurd ROI" symptom. That has an
independent cause, also fixed here.

The profit/ROI aggregation in `src/lib/services/game-item-mongo-service.server.ts` priced
an ingredient as `highPrice ?? lowPrice ?? cost`. A watered seedling is untradeable, so
it has no `highPrice`/`lowPrice` and fell through to `cost` — the game's base value of
**1**. `Oak sapling` therefore reported a creation cost of 1gp and an ROI of ~31,500%,
which is why saplings dominated the new ROI sort.

`cost` is now used only for ingredients that are actually tradeable on the GE. An
untradeable ingredient is priced as _unknown_, which nulls the creation cost and keeps
the item out of the profit and ROI sorts rather than letting it top them on a fabricated
number. `game-item-creation-cost-table.svelte` applies the same rule client-side, where
the recursive walk it already does surfaces the real underlying cost on the child rows.

Note the list pipeline still only descends **one** level (`primarySpec.ingredients`), so
it does not sum an item's full creation tree. Making saplings show their _true_ acorn-based
investment (rather than dropping out as unknown) would mean either recursing in the
aggregation or precomputing an effective value per item offline, in the style of
`compute-creation-tree-skills.ts`. That is a larger change and is not attempted here.

## The third defect: every variant's recipe stored on every variant

Recovering the page title exposes the next layer. `wiki_url` anchors an item at **one**
panel of a shared page, but the MediaWiki API cannot serve part of a section — asking for
`Creation` on `Steel dart` returns all eleven recipes, eight fletching panels and three
poisoning panels. `populate-ingredients.ts` stored every one of them on every variant.

Both the item page and the profit aggregation take the _first_ spec with ingredients, so
whichever panel the wiki happens to list first became the item's recipe:

| Item               | Primary spec it was given        | What that recipe actually makes |
| ------------------ | -------------------------------- | ------------------------------- |
| `Steel dart(p)`    | 10x Steel dart tip + 10x Feather | unpoisoned darts                |
| `Steel javelin(p)` | 15x Javelin shaft                | unpoisoned javelins             |
| `Oak seedling (w)` | Filled plant pot + Acorn         | an _unwatered_ seedling         |

Measured on the live collection: **1,838** versioned items carried more than one spec,
and the item page rendered each of them as a "Spec N" tab.

`src/lib/helpers/wiki-creation-variants.ts` narrows the scraped methods to the item's own
version. The wiki labels its switch panels with the same names OSRSBox anchors on, so the
label is the discriminator, applied in two steps:

1. Panels labelled with the item's own version win outright.
2. Failing that, panels labelled with a _sibling_ version are dropped. This is what keeps
   the three poisoning recipes off unpoisoned `Steel bolts`, whose own panels are named
   for the feather rather than for the version and so never match by name.

Anything the labels cannot account for is kept, and the filter only runs when the page
scraped is the one this item's own `wiki_url` points at. Sampled over 60 versioned pages
against the live wiki: **44** item/version pairs narrowed, **127** left alone.

Step 2 can empty the list, and that is an answer rather than a failure. `Abyssal dagger`
documents only the three poisoning recipes — the plain dagger is a drop, not a craft — so
it was being handed the cheapest of them and reported a **399gp** creation cost on a 2.2M
item, which made it the **top result of the live ROI sort**. Items in that position now
have their inherited specs cleared instead. It only happens when _every_ panel is claimed
by a named sibling, which across three 70-page samples came to 1–3 pages each: the plain
variants of `Abyssal dagger`, `Black knife`, `Black spear`, `Dragon knife`, `Dark bow`.
A page whose labels stop matching keeps everything rather than losing it, so the failure
mode is "too much", never "too little".

Pages that label by something other than a version are untouched: `Candle lantern`
("White candle", "Black candle"), `Crystal bow` ("Crafting", "Ilfeen"), and the many
Creation sections that are plain subsections with no labels at all — `Oak seedling` among
them.

## The fourth defect: the product row read as an ingredient

Filtering to the right panel made a latent scraper bug visible. The wiki's recipe table
lists inputs, a `Total cost` row, then the output, then profit rows. The parser instead
identified the output _by name_: a self-link, an exact title match, or a numeric dose
variant.

On a variant panel that is exactly backwards. The `Poison` panel of `Adamant dagger` reads
`Adamant dagger` + `Weapon poison` -> `Adamant dagger(p)`; the input is the self-link and
the output links away to its own redirect page. The parser called `Adamant dagger(p)` an
ingredient — leaving the poisoned dagger an ingredient of itself — and the base dagger the
product.

`parseMaterialsAndInlineProducts` now splits on the `Total cost` row the template already
provides, falling back to the old name-based rule for tables that have none. Compared
old-vs-new over 130 sampled pages against the live wiki: **119 identical, 11 changed, and
every change a correction** —

- `Dragon knife(p)` = 5x Dragon knife + Weapon poison, instead of listing itself.
- `Granite maul (clamp)` = Granite maul + Granite clamp, instead of the reverse.
- `Soft clay` no longer charges for the Bucket it _returns_ to you.
- `Guthix max cape` correctly produces both the cape and the hood.

Belt and braces, `mapWikiMethodToCreationSpecs` now refuses to store an item as its own
ingredient. On a page whose variants share one name — watered and unwatered
`Oak seedling` — the input resolves straight back to the owner, and no amount of parser
accuracy can separate them.

## Currency is not an untradeable ingredient

The "untradeable ingredients are priced as unknown" rule above is right about materials
and wrong about money. `Coins` carries `tradeable_on_ge: false` — you cannot list coins on
the Grand Exchange — but a recipe that charges 5 coins costs 5gp, and **3,257** of the
9,824 items with recipes charge a coin fee. Pricing coins as unknown nulled the creation
cost for a third of the catalogue and dropped all of it out of the profit and ROI sorts.

`src/lib/helpers/ingredient-price.ts` now holds the single rule both the aggregation and
the item page apply: GE price first, then `cost` — but only for an item that is GE
tradeable or _is_ money (`Coins`, `Platinum token`). Simulated over the whole live
collection, that takes the number of items whose cost becomes unknown from **4,497** down
to **2,282**, and the remainder are genuinely ungettable-for-gp inputs: `Bone in vinegar`,
`Lovakite ore`, `Crystal shard`, `Max cape`.

## Unknown ingredient prices no longer read as free

`game-item-creation-cost-table.svelte` skipped rows whose price was unknown when summing,
which counted them as 0gp and inflated every profit line below the table. That is harmless
only when the walk has already expanded the row into the child rows carrying the real
outlay — an `Oak seedling (w)` that resolves to its acorn — and wrong when it has not,
which is exactly the case the untradeable rule creates.

Rows now record whether they were substituted by a child recipe. An unowned row with no
price and no substitute makes the total, and every profit line, report unknown rather than
a number that is too good. The aggregation already behaved this way (`costKnown`), so this
brings the item page into line with the list.

## Status

- [x] Root cause identified and quantified against the full dataset
- [x] `wiki_url` validated as authoritative (0 counterexamples in 28,744 items)
- [x] `src/lib/helpers/wiki-page-title.ts` + unit tests
- [x] Schema fields `wiki_page_title` / `wiki_version`
- [x] `grab-osrsbox-items.ts` stamps derived fields
- [x] `backfill-missing-items.ts` stamps derived fields
- [x] `normalize-wiki-names.ts` repair script
- [x] `update-db.ts` wires in the `wiki-names` step
- [x] `populate-ingredients.ts` scrapes the derived title
- [x] Untradeable ingredients no longer priced from `cost`
- [x] Currency exempted from that rule
- [x] Scraped methods narrowed to the item's own infobox version
- [x] Specs cleared from variants their page documents no recipe for
- [x] `populate-ingredients.ts --dry-run`
- [x] Recipe tables split on `Total cost` instead of guessing the product by name
- [x] Cost table reports an unknown total instead of counting it as free
- [x] Wiki-title migration run against `osrsbox` and `osrsbox-dev`
- [ ] **Re-scrape and promote to `osrsbox-prod`** — see below

## Running it

The repair pass is idempotent and supports a dry run:

```bash
bun run normalize-wiki-names -- --dry-run   # report only
bun run normalize-wiki-names                # write
```

It is also step `wiki-names` of `bun run update-db`, so a normal refresh picks it up
automatically. `--skip-wiki-names` opts out.

After it has run, re-scrape the items it unlocked so they get their creation trees:

```bash
bun run --env-file .env scripts/populate-ingredients.ts --skip-existing --versioned-only
```

`--versioned-only` restricts the pass to items carrying a `wiki_version`. Those are
exactly the ones whose lookups used to fail; everything else was already reachable under
its own name, so re-scraping it just re-reads pages that were already read successfully
and found to have no creation method. With `--skip-existing` this is ~7,600 items rather
than ~22,000 — roughly 3 hours instead of 8 at the observed ~45 requests/minute.

A full refresh is still `bun run populate-item-ingredient-trees`.

The re-scrape overwrites `creationSpecs` wholesale, so preview it first — `--dry-run`
scrapes and maps exactly as usual but reports the before/after spec count per item without
touching a document:

```bash
bun run --env-file .env scripts/populate-ingredients.ts --dry-run --versioned-only
```

Note that the variant and product fixes above change what a re-scrape produces for items
that already have specs, so `--skip-existing` no longer covers the whole job: the 1,838
versioned items holding a sibling variant's recipe need a refresh, not a skip.

## Store prices and the sell-to-shop dropoff

Shops pay less for each one you sell them. The wiki documents the rule on
[Shop](https://oldschool.runescape.wiki/w/Shop): the price falls by a fixed percentage of
the item's **base value** per sale, and "regardless of how overstocked they are, all shops
will buy the player's items for a minimum of 10% of the item's value".

The numbers behind it are template parameters, not rendered text:

```
{{StoreTableHead|sellmultiplier=1000|buymultiplier=600|delta=20}}
{{StoreLine|name=Steel axe|stock=3|restock=400}}
```

Those are per-mille of the item's value — 600 is 60%, 20 is 2% per sale — and `delta` is
the same number the item page shows as its "Change Per" column.

`populate-store-prices` reads them from **shop** pages rather than item pages. There are
508 shops against 28,763 items, so the whole scrape is a few hundred requests and finishes
in about two minutes, where going item-first would have been tens of thousands. Prices are
computed from our own `cost` and the shop's multipliers rather than the wiki's rendered
figures, so they stay consistent with the rest of the dataset.

Measured over the full run: 458 shops carry a stock table (the other 50 are shop _type_
overview pages like "Axe shops"), 6,042 stock lines read, **1,109 items priced**. 468 lines
name something that is not an item document — clothing variants, `Graceful outfit`,
`Agility` — and are reported rather than guessed at.

Stored on the item as `storePrices`, one entry per shop:

| field               | meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `firstPrice`        | gp for the first sale, at the shop's default stock        |
| `dropPerSale`       | gp lost per further sale                                  |
| `floorPrice`        | gp once overstocked to the 10% minimum                    |
| `salesToFloor`      | sales to reach the floor; null when the price never drops |
| `buyPrice`          | gp the shop charges to buy one                            |
| `stock`, `currency` | default stock, and what the shop trades in when not coins |

`src/lib/helpers/store-price.ts` has the maths — `storeSalePrices(value, terms, count)`
returns the series, `summarizeStoreSale` flattens it to the four numbers above.

Checked against the wiki's own worked example and its rendered tables: a 200gp steel axe at
Bob's Brilliant Axes (600/20) gives 120, 116, 112 with a floor of 20, and Varrock Swordshop
prices Bronze/Iron/Steel swords at 26/91/325 to buy and 15/54/195 to sell — matching the
wiki row for row.

Shops that refuse to buy (`hidebuy`) store nothing, and a shop trading in tokens rather
than coins keeps its `currency` so its numbers are not mistaken for gp.

### The whole rebuild in one command

`bun run promote-db` runs the sequence end to end — back up, re-scrape, repoint ingredient
links, refresh store prices, report cycles, recompute tree skills, then copy to prod and
refresh its GE prices. It
rebuilds on **`osrsbox-dev`** and never writes the master DB, so `osrsbox` stays a rollback
for the whole operation; sync it from dev afterwards, once prod looks right.

```bash
bun run promote-db                       # plan: reports every phase, writes nothing
bun run promote-db -- --apply            # rebuild osrsbox-dev, stop before prod
bun run promote-db -- --apply --promote  # ...and push dev through to prod
```

Nothing is written without `--apply` and prod is never touched without `--promote`. Cycle
removal only reports unless `--with-cycles` is passed, because it deletes whole
`creationSpecs` entries to break a loop. Every phase streams under a heartbeat — a line at
least every `--heartbeat` seconds — and the whole run is appended to a timestamped log in
`scripts/`, so it can be followed from another shell with `tail -f`.

The backup phase writes an EJSON dump of every `creationSpecs` array before anything else
runs. `bun run restore-creation-specs -- --db=<db> --file=<dump> --apply` puts it back;
without `--apply` it reports what it would write and checks that every reference revives as
a real ObjectId.

## Applied

Run against the `osrsbox` master DB on 2026-08-21. Live results matched the offline
prediction exactly:

|                             | Predicted          | Actual     |
| --------------------------- | ------------------ | ---------- |
| Documents written           | 28,744 + backfills | **28,763** |
| Resolve to a different page | 9,209              | **9,209**  |
| Carrying a version anchor   | 8,377              | **8,377**  |

The 19-document difference is hand-backfilled items, and all 19 landed in the
no-behaviour-change bucket. A second dry run reported 0 pending writes, confirming
idempotency. Post-migration integrity across all 28,763 documents: 0 null titles, 0
empty titles, 0 titles retaining `#`, `_` or percent-escapes.

`osrsbox-dev` and `osrsbox-prod` are untouched pending the re-scrape.

## Reading the numbers

Two different counts get quoted about this migration, and confusing them makes the
change look far bigger than it is.

| Count                                 | Value      | Meaning                                                                                                                 |
| ------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Documents written                     | **28,744** | Every item. `wiki_page_title` / `wiki_version` are new fields, so every document gains them on the first run.           |
| Titles that differ from `wiki_name`   | **9,209**  | Items that will now resolve to a _different_ wiki page.                                                                 |
| ...of which carry a `#version` anchor | **8,377**  | The switch-infobox items — the actual defect.                                                                           |
| ...of which have no `wiki_url` at all | **832**    | `wiki_name` is null; the derivation falls back to `name`, which is what the old code already used. No behaviour change. |
| Items untouched entirely              | **0**      | Every item derives _something_.                                                                                         |

So the write count is the whole collection by construction, and it is not a measure of
impact. Only 9,209 items change behaviour, and only 8,377 of those are the bug. The
migration adds two fields and never modifies `name`, `wiki_name` or `wiki_url`, so
anything reading those is unaffected.

`normalize-wiki-names.ts` prints both figures side by side so the write count cannot be
mistaken for the blast radius.

## Blast radius

`wiki_page_title` and `wiki_version` are read by `scripts/populate-ingredients.ts` — the
title via `wikiTitleCandidates()`, the version via `selectMethodsForVersion()` — and the
title once more as a link fallback on the item detail page. Everything still reading
`wiki_name` — the upload dialog, `find-ingredient-cycles.ts`, the items API — sees
byte-identical data.

## Verification performed

- Unit tests: `bun test` — 16 pass with no database; 19 pass with one.
- Whole-dataset replay of the derivation over `items-complete.json` (28,744 items):
  9,209 titles changed, 19,535 left byte-identical, **0 mangled** (every derived title
  is a prefix of the `wiki_name` it came from).
- 6,215 derived titles legitimately end in `(...)` — e.g. `Longbow (u)`,
  `Holy grail (item)`. A regex that stripped trailing parentheses from `wiki_name`
  would have corrupted all of them. Deriving from `wiki_url` leaves them intact.
- **Full live-wiki validation** of every distinct page title involved, via the
  MediaWiki API:

    | Titles                                  | Resolve                    |
    | --------------------------------------- | -------------------------- |
    | Derived (`wiki_page_title`)             | **1,329 / 1,330 — 99.92%** |
    | Old (`wiki_name`, what the scrape used) | **148 / 4,350 — 3.40%**    |

    The single failure is `Kebbit (unobtainable item)`, backing 12 untradeable items
    whose wiki page has been deleted upstream. Its `wiki_name` 404s too, so this is stale
    OSRSBox data rather than a regression.

- Aggregation behaviour covered by `src/lib/services/game-item-creation-cost.test.ts`,
  which runs against a real MongoDB:

    ```bash
    docker run -d --rm -p 27018:27017 mongo:7
    bun test
    ```

    The suite skips itself when no such instance is reachable.

## The same bug in the UI

`src/routes/items/[id=integer]/+page.svelte` built its "view on wiki" link by slugifying
`wiki_name`, so that link 404d for the same 8,377 items. It now uses the stored
`wiki_url`, which is authoritative and already carries the version anchor, so those
items land on their own section of the page. `wiki_page_title` is the fallback when no
URL is stored, and `getGameItemById` projects it so the fallback has a value.

This needs no migration — `wiki_url` was already stored and already correct.
