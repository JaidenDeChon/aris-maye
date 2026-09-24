# Canonical ingredient resolution

## The problem

Ingredient references stored in `creationSpecs` pointed at OSRSBox documents that carry
no Grand Exchange price, so anything crafted from them priced as free.

A name in the OSRSBox dataset can cover many in-game item ids. `Acorn` is:

| id        | `duplicate` | `placeholder` | `tradeable_on_ge` | price     |
| --------- | ----------- | ------------- | ----------------- | --------- |
| 5111-5114 | yes         | no            | no                | —         |
| **5312**  | **no**      | **no**        | **yes**           | **139gp** |
| 13759     | yes         | yes           | no                | —         |

Only 5312 has a market. Ingredients resolved to 5111.

## Root cause

Both resolution paths in `populate-ingredients.ts` picked arbitrarily:

- `buildItemIdLookupMap` loaded every item `.sort({ _id: 1 })` and kept the **first**
  occurrence of each name (`if (!map.has(key))`). The duplicate sorts first, so it won.
- `findItemByDisplayName` used `findOne`, which returns natural order with no preference.

Neither consulted `duplicate`, `placeholder`, `noted` or `tradeable_on_ge`.

`remove-duplicate-items` is not the right layer: it dedupes by numeric `id`, and these
are genuinely distinct ids representing the same item.

## Scope

Measured against the live `osrsbox` collection:

|                                   |         |
| --------------------------------- | ------- |
| Ingredient links inspected        | 28,257  |
| Pointing at an unpriced duplicate | **735** |
| Items affected                    | 581     |
| Distinct ingredient names         | 49      |

Worst by value: Dragon bolts (60 links, real price 3,135gp), Rune kiteshield (32,251gp),
Adamant kiteshield (3,019gp), Javelin shaft (16 links).

## The fix

`src/lib/helpers/item-preference.ts` ranks candidates by penalty, worst first:

| Fault            | Penalty |
| ---------------- | ------- |
| `duplicate`      | 8       |
| `placeholder`    | 4       |
| `noted`          | 2       |
| not GE-tradeable | 1       |

The weights are powers of two so the comparison is lexicographic: no combination of
lesser faults can outweigh a greater one, and a duplicate is never chosen over a
canonical document however untradeable that canonical document happens to be. Ties break
on the lowest in-game id, so the result never depends on storage order.

Absent flags count as "not set" rather than true, so a sparse document is treated as
canonical instead of being penalised for fields it never had.

Both resolution paths use it, so newly scraped data is correct at the source.

Note the ordering of `noted` above tradeability: a bank note _is_ tradeable, so ranking
tradeability higher would make notes beat the item they stand for.

## Repairing stored data

```bash
bun run repair-ingredient-links -- --dry-run
bun run repair-ingredient-links
```

The pass moves a link only when the replacement is **strictly** more canonical, so
equal-ranked links are never reshuffled and repeated runs converge. It is also step
`ingredient-links` of `bun run update-db`, after `populate-ingredients`; `--skip-ingredient-links`
opts out.

**Run it after any `populate-ingredients` pass that used the old code**, otherwise that
scrape reintroduces the bad links.

## Verification performed

- 12 unit tests written before the implementation, modelled on the real Acorn group.
  They cover order independence, that a note never beats the unnoted item, that a
  placeholder never beats a real item, and the deterministic id tiebreak.
- Confirmed against the live dataset that **0 of 8,437** multi-document names lack a
  non-duplicate candidate, so the ranking always has something canonical to pick.
  1,126 names remain ambiguous after the flag checks and rely on the id tiebreak.

## Applied

Run against the `osrsbox` master DB on 2026-08-21, after the `--versioned-only`
re-scrape completed:

```
Ingredient links inspected ......... 43,041
Links repointed to canonical .......  1,624
Items written ......................  1,138
```

A second dry run reported 0 links to move, confirming idempotency. `Oak seedling (w)`
now prices its `Acorn` from canonical id 5312 (139gp) rather than the unpriced
duplicate 5111.

## Known issue: self-referential specs from wiki variants

The re-scrape surfaced a **separate** resolution bug that this repair does not address.
`find-ingredient-cycles` now reports 846 cycles, up from 258, and **414 of them are
self-loops** — an item listing itself as its own ingredient:

```
Apple seedling (w)  <-  Apple seedling (w) + Watering can
```

The real recipe is _unwatered_ seedling + watering can. Both variants live on one wiki
page, and lookup-key normalization strips the `(w)` suffix, so the ingredient resolves
back to the watered item itself. This is a name-collision between infobox variants,
distinct from the duplicate-document problem `pickPreferredItem` solves — the chosen
document is canonical, it is just the wrong variant.

**Do not run `find-ingredient-cycles` to paper over this.** It removes whole
`creationSpecs` entries whose ingredients close a cycle, and against the current data
that means:

|                                       |         |
| ------------------------------------- | ------- |
| Creation specs removed                | 1,065   |
| Items affected                        | 464     |
| **Items losing every spec they have** | **181** |

Those 181 include `Yellow cape` (7 specs), `Dragon dagger(p++)` (3), `Staff of water`
(3) and `Candle lantern` (4) — real recipes destroyed to break a cycle that only exists
because of the variant collision. The cycles step was deliberately skipped in the run
above.

Skipping it is safe: `compute-creation-tree-skills` guards itself, breaking recursion
via a `stack.has(key)` check and returning an empty skill range. It completed all 28,763
items and reported 3,230 cycle hits without failing.

The real fix is to resolve an ingredient to the variant the wiki actually names, using
`wiki_version` to disambiguate rather than collapsing variants to one lookup key.
