# Ironman feature recommendations

A scan of the app's data, services and UI against what Ironman accounts actually need, plus specs for
the four requested features and five more worth adding.

---

## 1. What the app knows today

Everything lives in one Mongo collection (`items`), modelled by
`src/lib/models/mongo-schemas/osrsbox-db-item-schema.ts`.

**From OSRSBox** — `id`, `name`, `icon`, `examine`, `members`, `tradeable`, `tradeable_on_ge`,
`stackable`, `noted`/`noteable`, `linked_id_*`, `placeholder`, `equipable*`, **`cost`**, **`lowalch`**,
**`highalch`**, `weight`, **`buy_limit`**, `quest_item`, `release_date`, `wiki_name`, `wiki_url`,
`equipment`, `weapon`.

**Added by this repo**

| Field                                             | Written by                                                                                   | Notes                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `highPrice` / `highTime` / `lowPrice` / `lowTime` | `netlify/functions/update-item-prices` → `game-item-price-service.ts`                        | Hourly, from `prices.runescape.wiki`                                                                              |
| `creationSpecs[]`                                 | `scripts/populate-ingredients.ts` (using the wiki spider in `scripts/osrs-wiki-creation.ts`) | `requiredSkills[]`, `experienceGranted[]`, `ingredients[]` (`{ item: ObjectId, amount, consumedDuringCreation }`) |
| `creationSpecs[].treeMinSkills`                   | `scripts/compute-creation-tree-skills.ts`                                                    | Precomputed batch field — the precedent for everything proposed below                                             |

**Computed per request** — `creationCost`, `creationProfit`, `creationRoi`, built in
`buildProfitPipeline()` in `game-item-mongo-service.server.ts` via a `$lookup` on ingredients and
`allowDiskUse(true)`.

**Client state** — character profiles + skill levels, a per-character bank/supplies list
(`bank-items-store.ts`), favorites, hidden, and items-page preferences (`filter`, `sortOrder`,
`perPage`, `page`, `useSupplies`, `profitMode`).

### What is missing

- **All shop data.** Nothing in the repo knows which NPC shops buy or sell an item, at what
  percentage, with what stock or restock rate. This is the single blocker for three of the four
  requested features.
- **Non-GE acquisition.** No drop tables, no gathering sources (rock/tree/fishing spot + level), no
  quest/minigame unlocks.
- **Time.** No actions-per-hour or XP-rate data, so nothing can be expressed per hour yet.

### Three findings that matter before any feature work

1. **Ironman-relevant items are invisible today.** Every listing and search path hard-filters
   `tradeable_on_ge: true` **and** requires a live GE price:

    ```ts
    // game-item-mongo-service.server.ts
    const filterQuery = mergeQueries(baseFilterQuery, skillQuery, {
        placeholder: false,
        noted: false,
        stacked: null,
        tradeable_on_ge: true,
        ...getValidPriceQuery(), // $or: [{ highPrice: { $gt: 0 } }, { lowPrice: { $gt: 0 } }]
    });
    ```

    `searchGameItems()` applies the same `baseFilter`. So untradeables and anything without a recent
    GE trade cannot be browsed or searched at all — a large slice of what an Ironman makes and uses.

2. **`cost` is the item's base value, not a store price.** The item page renders it as "Store price"
   with a general-store icon. A general store _sells_ at ~130% of base value and _buys_ at a much
   lower percentage, so the current row is misleading precisely where feature #2 wants to live.
   `lowalch`/`highalch` are 40%/60% of `cost`, which confirms `cost` is the value field — and it is
   the input every shop-price formula needs.

3. **The profit pipeline is already the expensive path.** `creationCost`/`creationProfit`/`creationRoi`
   are recomputed on every request with a per-document `$lookup`, and the sort spills to disk. Do
   **not** stack shop math on top of it at query time. Shop-derived values must be **precomputed batch
   fields** with their own indexes, the way `treeMinSkills` already is.

---

## 2. The unlock: a shop dataset

Features 2, 3 and 4 are one data problem and one formula. Get the data once and all three fall out.

### Mechanics

A shop that buys from players pays a percentage of the item's **base value** (`cost`), not its GE
price. That percentage starts at the shop's buy rate and steps down for each unit the shop is
overstocked, down to a floor. Specialty shops pay more than general stores for their specialty stock,
and most shops refuse items they don't stock at all. Stock drifts back toward default over time,
which is why the real Ironman play is "sell a batch, hop, sell again".

For base value `V`, buy rate `b₀`, change per unit `δ`, floor fraction `f`:

```
price of the k-th unit sold   p(k) = floor(V × max(f, b₀ − δ·(k−1)))
units until the price bottoms  n_floor = ceil((b₀ − f) / δ)
revenue for a batch of n       R(n) = Σ p(k)
```

**Do not hardcode `b₀`, `δ` or `f`.** They vary per shop; scrape them per (shop, item) pair. The wiki
publishes them, and the fact that the wiki ships a `Calculator:Shop calculator` confirms both the
demand and that the numbers are exposed. What no existing tool does is combine this with a sortable
item list and creation costs — which is exactly the gap this app sits in.

### Proposed shape

New `shops` collection:

```ts
{
  name: 'Bob\'s Brilliant Axes',
  location: 'Lumbridge',
  members: false,
  isGeneralStore: false,
  buyPercentage: number,      // b₀
  changePercentage: number,   // δ
  sellPercentage: number,
  floorPercentage: number,    // f
  restockSeconds: number | null,
  stock: [{ itemId: number, defaultQuantity: number }],
}
```

Denormalized onto each item so the browse page can sort and index without a join:

```ts
shopSources: [{ shopName, location, members, defaultStock,
                buyPercentage, changePercentage, unitPriceAtDefaultStock }],
bestShopBuy: { shopName, unitPrice, unitsToFloor } | null,  // indexed
```

New script `scripts/populate-shops.ts`, wired into `scripts/update-db.ts` as a step after
`populate-ingredients`. Scrape by `wiki_page_title` (the real page title PR #16 derives from
`wiki_url`), never `wiki_name` — OSRSBox synthesises that field for switch-infobox items, and
requesting it 404s. `scripts/WIKI-NAME-NORMALIZATION.md` has the detail; the creation scraper already
made this mistake once and it cost ~29% of the catalogue. It reuses the existing `wikiApi()` + cheerio section-parsing helpers in
`scripts/osrs-wiki-creation.ts` — the same pattern as `getCreationSectionIndex` / `parseRequirementsTable`,
pointed at store-location tables instead of creation tables. Ship this first; it is the dependency for
three of the four asks.

> Verification note: I could not reach `oldschool.runescape.wiki` from this session (the network egress
> proxy blocks it), so the exact table markup and the per-shop percentages need confirming on the first
> local spider run. The mechanics above are well established; the specific numbers are the part to read
> off the wiki rather than trust from memory.

---

## 3. The four requested features

### 3.1 Ironman mode — zero-trade profit

**Pain.** Every number in the app is a GE number on both sides. For an Ironman both sides are wrong:
they cannot buy the inputs, and they cannot sell the output. The current "sort by profit" ranking is
not merely optimistic for an Ironman, it is ranking the wrong items — the top results are usually
items whose margin exists _because_ the inputs are cheap to buy, which is the one thing an Ironman
cannot do.

**The math change.**

|              | Current                         | Ironman mode                                                   |
| ------------ | ------------------------------- | -------------------------------------------------------------- |
| Input cost   | `Σ ingredient GE price × qty`   | `Σ ingredient valueBasis × qty` (what the materials are worth) |
| Gp fronted   | — (same as input cost)          | `Σ shop price × qty` for shop-buyable inputs only              |
| Output value | `highPrice ?? lowPrice ?? cost` | `max(best shop buy price, highalch − nature rune cost, 0)`     |

Ironman mode needs **two** input numbers, not one. Gp fronted is what a shopkeeper takes, and it is
zero for a fully gathered recipe — that's the number for "how much am I risking". Input cost is what
the consumed materials are worth, which is never zero for a real recipe, and it's what profit and ROI
divide by: gathered materials aren't free, they had a sale value you gave up by crafting with them.
Using gp-fronted as the ROI denominator is what makes ROI collapse to `null` on most Ironman rows.
See §2.3.1 of the UI plan for the full definition.

**Where it lands.**

- Add `ironmanMode: boolean` to `ItemsPagePreferences` (`src/lib/stores/items-page-preferences.ts`)
  and a toggle in the switch group in `game-items-page.svelte`, alongside the existing
  `profitMode` / `useSupplies` switches.
- Thread `ironman=1` through `/api/game-items` exactly as `profitMode` is threaded today.
- Server-side, branch `buildProfitPipeline()` to read the precomputed `ironmanInputValue` /
  `ironmanGpSpent` / `ironmanExitValue` / `ironmanProfit` / `ironmanRoi` fields rather than GE prices,
  and mirror the Ironman unit price beside `resolveIngredientUnitPrice()` in
  `src/lib/helpers/ingredient-price.ts` (added by PR #16) rather than inlining it in the pipeline.
- Relabel in `item-card.svelte`: "Profit" → "Ironman profit", "Investment required" → "Materials".

**Scope note.** This should be a genuine mode, not just a formula swap — under Ironman mode the base
filter must also stop excluding untradeables (finding #1 above), and items whose inputs are neither
shop-buyable nor gatherable should be filtered out rather than shown with a fake profit.

### 3.2 Item page: non-trade shop section

**Pain.** "An axe sells for 5gp at a general store but 25gp at Bob's Axes" is exactly the information
an Ironman needs and currently has to leave the app to get.

**Spec.** A third card in the pricing grid on `src/routes/items/[id=integer]/+page.svelte`, beside
"Grand Exchange" and "Game Prices" — those two sections already exist and this slots in as a peer:

| Shop                 | Location  | Buys at | Sells at | Stock |
| -------------------- | --------- | ------- | -------- | ----- |
| Bob's Brilliant Axes | Lumbridge | 25 gp   | 16 gp    | 5     |
| General store        | (any)     | 5 gp    | 21 gp    | 0     |

Sort best-buying first, badge the best row, and show members/F2P per shop. While in this file, fix
the "Store price" row to read **"Value"** — it is the base value, and the actual store prices are now
in the new card.

Under Ironman mode, also swap the "Buy limit" row (a GE concept, meaningless here) for
**"Shop stock / restock"**.

### 3.3 Items page: sort by merchant buy price, specialists included

**Pain.** No existing tool combines shop-aware pricing with a sortable, filterable list. This is the
app's clearest differentiator.

**Spec.** Add `Sort by shop value` to `sortOptions` in `game-items-page.svelte`, sorting on the
precomputed `bestShopBuy.unitPrice` — which is specialist-aware by construction, since the best shop
is whichever shop pays most, general or specialty.

**Implementation constraint.** Sort on the denormalized `bestShopBuy.unitPrice` field with its own
index. Computing it inside the request aggregation would mean a second `$lookup` layered on the one
already spilling to disk. Add to the schema:

```ts
osrsboxItemSchema.index({ tradeable_on_ge: 1, placeholder: 1, noted: 1, 'bestShopBuy.unitPrice': -1 });
```

Show the shop name on the card so "25gp — Bob's Brilliant Axes" is visible without opening the item.

### 3.4 Item page: how many can I sell before it stops being worth it

**Pain.** Real, and currently a wiki round-trip. Worth flagging one thing about how it's framed, then
building it either way:

> The break-even framing assumes a cost basis. For most Ironmen making the item from gathered
> materials, the cost basis is **0 gp** — so the marginal-profit break-even is infinite and the
> question silently becomes a different one: _how many until the price bottoms out?_

So surface **two** numbers and let the cost basis decide which one leads:

- **Units until the price floors** — `n_floor = ceil((b₀ − f)/δ)`. Always meaningful. This is the
  number a gathered-materials Ironman actually wants.
- **Units until unit price < creation cost** — the largest `n` where `p(n) ≥ creationCost`. Shown only
  when creation cost > 0, i.e. when they actually fronted gp.

Plus, because these are all one trip in practice: **total gp for the full batch** — `R(n)` — and the
restock time, so the answer reads "sell 10 here for 1,840 gp, then hop" rather than a bare number.

Render as a small block under the shop table, driven by the same `shopSources` data — no extra
fetches. The cost basis is already available: `creationCost` is computed for the item, and if
`useSupplies` is on for a character it is already net of what's in their bank.

---

## 4. Five more worth adding

Ranked by value-to-effort.

### 4.1 Stop hiding untradeables (highest leverage, no new data)

Finding #1 above. Under Ironman mode, relax the base filter in `getFilterQuery()` /
`getValidPriceQuery()` and in `searchGameItems()`'s `baseFilter` so untradeables and items without a
live GE price are browsable and searchable. Right now an Ironman cannot even look up a large share of
what they make. This is a filter change, not a feature build, and it makes every other Ironman feature
apply to the right item set.

### 4.2 Fix alch profit for Ironmen (no new data)

The item page computes:

```ts
// src/routes/items/[id=integer]/+page.svelte
const highAlchProfit = $derived(() => {
    const alch = gameItem?.highalch;
    const price = normalizePrice(gameItem?.highPrice);
    if (alch === null || alch === undefined || price === null) return null;
    return alch - price;
});
```

That is a merchant's alch-flip metric: profit from buying at GE price and alching. An Ironman never
bought it at GE price. Under Ironman mode the correct number is `highalch − nature rune cost`, shown
as **High alch value** rather than as a profit figure. Small change, and it removes a number that is actively wrong for this
audience.

### 4.3 Cheapest-XP sorting (small, uses data already present)

The honest Ironman metric is rarely profit — most Ironman crafting is net-negative gp on purpose. What
they optimise is **gp lost per XP gained**. `experienceGranted` is already on every creation spec, so:

```
gpPerXp = (ironmanInputValue − ironmanExitValue) / totalXp
```

Add "Least gp per XP" to `sortOptions` and a gp/XP line to the item card. This sits alongside ROI
rather than replacing it — ROI answers "is processing these materials worth it", gp-per-XP answers
"what does this level cost me". Works immediately with a 0-cost-gathered assumption and gets sharper
once shop data lands.

### 4.4 Bank → XP planner (most novel; no new data)

`useSupplies` already answers "what can I make with what's in my bank". The unanswered half is **"and
what would that get me"**. Given the bank contents, the character's levels, and `experienceGranted`,
compute total XP obtainable per skill from current supplies, plus the net gp delta of doing it.

An Ironman opening the app after a gathering session wants exactly one answer: _what do I do with this
bank_. Nothing else offers it, and every input already exists in the app — supplies store, character
levels, `treeMinSkills`, `experienceGranted`. This is the strongest new feature on the list that needs
no scraping at all.

### 4.5 "Where do I get this?" tags on ingredient rows

The recurring Ironman blocker isn't the recipe, it's sourcing the inputs. Tag each row in
`game-item-creation-cost-table.svelte` — which already renders exactly these rows — with
**Shop** / **Gather** / **Drop** / **GE-only**. Shop tags come free with §2's data; gather tags can be
inferred from the ingredient's own `creationSpecs` skills; drop tags need a further wiki scrape, so
ship the first two and leave drops for later.

---

## 5. Suggested sequencing

| Order | Work                                                         | Depends on | New data    |
| ----- | ------------------------------------------------------------ | ---------- | ----------- |
| 1     | Untradeable/no-price filter fix (§4.1)                       | —          | none        |
| 2     | Alch-profit fix (§4.2)                                       | —          | none        |
| 3     | Bank → XP planner (§4.4)                                     | —          | none        |
| 4     | `scripts/populate-shops.ts` + schema + `update-db` step (§2) | —          | **shops**   |
| 5     | Item-page shop section (§3.2)                                | 4          | —           |
| 6     | Break-even / units-to-floor block (§3.4)                     | 4, 5       | —           |
| 7     | Precompute `bestShopBuy` + sort by shop value (§3.3)         | 4          | —           |
| 8     | Ironman mode toggle + zero-trade profit (§3.1)               | 4, 7       | —           |
| 9     | Cheapest-XP sort (§4.3)                                      | 8          | —           |
| 10    | Ingredient acquisition tags (§4.5)                           | 4          | drops later |

Items 1–3 ship without touching the spider and are worth doing regardless. Item 4 is the gate for
everything else; the next spider run is the natural moment to add it.

## 6. Open questions

- **Which shop, by default?** Best-paying shop overall, nearest shop, or F2P-restricted? Suggest
  best-paying with a members/F2P badge, and revisit if it proves confusing.
- **Nature rune cost basis for alch profit.** Ironmen usually craft their own. A fixed configurable
  value in settings is probably better than pretending there's a market price.
- **Group Ironman.** Trading within a group is allowed, so GIM sits between the two modes. Worth a
  third option eventually, not worth designing for now.
- **Per-hour rates.** Every "best method" question really wants gp/hr and xp/hr. That needs
  actions-per-hour data the repo doesn't have and the wiki doesn't expose cleanly. Flagging it as the
  natural next data frontier after shops, not as something to attempt in this round.
