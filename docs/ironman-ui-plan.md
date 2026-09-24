# Ironman mode — UI plan and copy

Companion to `ironman-feature-recommendations.md`. Covers where the mode lives, what changes on each
screen, and the exact copy.

---

## 0. Correction: the ingestion scripts are mostly fine

Worth stating up front, because it changes the shape of the work.

`scripts/grab-osrsbox-items.ts` **already imports everything by default**:

```ts
const SKIP_UNTRADEABLE = process.env.OSRSBOX_SKIP_UNTRADEABLE === 'true';
const SKIP_NOTED = process.env.OSRSBOX_SKIP_NOTED === 'true';
// ...
// Optional filters (default is to import everything).
if ((SKIP_UNTRADEABLE && !item.tradeable) || (SKIP_NOTED && item.noted)) { … }
```

Neither env var is set anywhere in the repo, so both default to `false`.
`scripts/populate-ingredients.ts` builds its `baseFilter` purely from CLI flags and has no tradeable
filter either. So untradeable items are almost certainly **already in the database, with creation
specs**. The exclusion is entirely at the query layer in `game-item-mongo-service.server.ts`.

That means the "make the database include Ironman items" work is smaller than it looked, and the real
work is what the app does with items that have no GE price.

### What does still need changing on the data side

1. **Non-GE items have no price fields at all.** `game-item-price-service.ts` correctly skips
   `!item.tradeable_on_ge`, so those items have no `highPrice`/`lowPrice` — which is exactly why
   `getValidPriceQuery()` filters them out. Removing that filter without giving them a value basis
   just surfaces a list of dashes. **They need `cost`, `highalch` and (once scraped) shop prices as
   their value basis.** This is the dependency, not the import.
2. **Add a `valueBasis` precomputed field** in the same batch pass that writes `bestShopBuy`, so every
   item has a defined non-GE value and the browse page can sort on it:
   `bestShopBuy.unitPrice ?? (highalch − natureRuneCost) ?? null`.
3. **Confirm coverage before flipping the filter.** Add a one-off count to
   `scripts/update-db.ts`'s summary: how many items have `creationSpecs` but no GE price. That number
   is the size of the unlock and tells us whether it's worth it before any UI ships.
4. **`backfill-missing-items.ts` is not a route for untradeables** — its skeleton builder pulls from
   the GE mapping endpoint, which only contains GE-tradeable items, so its hardcoded
   `tradeable: true, tradeable_on_ge: true` is correct for that source. Leave it alone.

### One reassurance about scope

The browse filter already requires creation specs:

```ts
const base = { 'creationSpecs.0': { $exists: true } }; // Only items that have creation specs
```

So dropping `tradeable_on_ge` from **browse** adds untradeable _craftable_ items — a bounded, useful
set, not a flood. **Search** has no such requirement, so dropping it there opens search to every item
in the DB. That's desirable (an Ironman wants to look anything up) but it's the path where the
no-price state below actually matters.

---

## 1. Where the mode lives

**Recommendation: account type is a property of the character profile, not a view preference.**

The app already has multiple character profiles and a character switcher. Ironman status belongs to
the account, so if someone keeps a main and an iron, switching characters should switch the pricing
automatically. Burying it as a fourth switch in the items-page toolbar — next to "Filter by my skill
levels" and "Show profit" — would imply it's a per-page display option, and it would silently
disagree with itself across the item page, favorites and search.

```ts
// src/lib/models/player-stats.ts
export type AccountType = 'main' | 'ironman' | 'hardcore' | 'ultimate' | 'group';

export interface ICharacterProfile {
    id: UUID;
    name: string;
    accountType: AccountType; // new; defaults to 'main' for existing profiles
    skillLevels: Record<SkillNames, number>;
}
```

Branch all pricing on one derived boolean rather than on the enum, so the four Ironman variants can't
drift apart:

```ts
const canUseGrandExchange = $derived(accountType === 'main');
```

Store the full enum anyway — Ultimate needs it later (no bank changes the supplies feature) and Group
needs it eventually (trading within a group is allowed). Neither changes pricing today.

**When no character is selected**, fall back to `'main'`. A visitor with no profile gets today's
behaviour unchanged.

**Escape hatch:** if we want people to preview Ironman prices without making a profile, add the
toggle to the items-page toolbar as an _override_ that defaults to whatever the active character
says. I'd skip this in v1 — it reintroduces exactly the disagreement the character-level setting
avoids.

---

## 2. Screen by screen

### 2.1 Character dialog + My character page

The entry point, and the only place the mode is set.

`src/lib/components/dialogs/character-stats-dialog.svelte` and `src/routes/my-character/+page.svelte`
gain an account-type selector above the skills grid.

> **Account type**
>
> - **Main** — Prices come from the Grand Exchange.
> - **Ironman** — No economy prices. Prices are shown using alchemy and base shop values (e.g. before the shop value of an item drops from selling multiple).
> - **Hardcore Ironman** — No economy prices. Prices are shown using alchemy and base shop values (e.g. before the shop value of an item drops from selling multiple).
> - **Ultimate Ironman** — No economy prices. Prices are shown using alchemy and base shop values (e.g. before the shop value of an item drops from selling multiple). No bank.
> - **Group Ironman** — No economy prices. Prices are shown using alchemy and base shop values (e.g. before the shop value of an item drops from selling multiple). Trading is limited to your group.

Existing profiles have no `accountType`; default them to `main` on read so nobody's saved characters
change behaviour on deploy.

### 2.2 Character switcher / site header

`src/lib/components/global/character-switcher.svelte`

The mode must be visible at all times — the worst outcome is someone reading shop-based numbers while
believing they're GE numbers. Add a small badge beside the character name:

- Badge text: `Ironman` (or `HCIM` / `UIM` / `GIM`)
- Tooltip: `Ironman — prices don't use the Grand Exchange`

Ironman helm icons would fit the existing `/static/other-images/` convention if we'd rather go visual.

### 2.3 Items page

`src/lib/components/items/game-items-page.svelte`

**A dismissible banner** above the toolbar the first few times, so the number change is explained
rather than discovered:

> **You're in Ironman mode.** The GP values shown in Ironman mode are derived from alchemy and base
> shop values (e.g. before the shop value of an item drops from selling multiple).

**Switch relabels** (only under Ironman; unchanged for mains):

| Today                                               | Under Ironman                                               |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `Show profit` <span>(enables profit sorting)</span> | `Show Ironman profit` <span>(enables profit sorting)</span> |
| `Only show what I have supplies for`                | unchanged                                                   |
| `Filter by my skill levels`                         | unchanged                                                   |

**Sort options.**

| Value            | Main label                 | Ironman label              |
| ---------------- | -------------------------- | -------------------------- |
| `desc`           | `Sort by value`            | `Sort by sell value`       |
| `roi-desc`       | `Sort by ROI (percentage)` | `Sort by ROI (percentage)` |
| `roi-value-desc` | `Sort by ROI (value)`      | `Sort by ROI (value)`      |
| `shop-desc`      | —                          | `Sort by shop value`       |
| `xp-cost-asc`    | —                          | `Sort by cheapest XP`      |

These are the sort orders as PR #16 left them: `profit-desc` was retired in favour of
`roi-value-desc`, and `legacySortValues` in `game-items-page.svelte` plus `LEGACY_SORT_ORDERS` in the
service still resolve the old value out of persisted preferences and bookmarked URLs. New Ironman
sorts must be added to `GameItemSortOrder`, `parseSortOrder()` and `sortOptions` together.

**ROI works under Ironman, but only once the denominator changes.** `creationRoi` is
`creationProfit / creationCost`, and the service returns `null` whenever cost is zero. Feed it
gp-spent as the denominator and an Ironman working from gathered materials divides by zero on most
rows. Both profit-mode sorts feel it: `roi-desc` sorts on `creationRoi` directly and `filterMissingRoi`
drops the null rows outright, and `roi-value-desc` uses `creationRoi` as its tiebreaker. The fix is to
change what the denominator measures — see §2.3.1 — not to hide either sort.

#### 2.3.1 What ROI divides by under Ironman

Gp-spent is the wrong denominator for an Ironman, and it's the only reason ROI broke. Materials you
gathered are not free — they had a sale value you gave up by crafting with them. So under Ironman the
cost basis becomes **what the consumed inputs are worth**, using each ingredient's own Ironman value:

```
ironmanInputValue(item) = Σ valueBasis(ingredient) × qty      // over consumed ingredients only
ironmanProfit           = ironmanExitValue − ironmanInputValue
ironmanRoi              = ironmanProfit / ironmanInputValue
```

`valueBasis` is the field already proposed in §0 — `bestShopBuy.unitPrice ?? (highalch − natureRuneCost)`
— so the same number values an item as an output and prices it as an input. Nothing new to scrape.

PR #16 added exactly the seam this needs: `src/lib/helpers/ingredient-price.ts` already centralises
"what does one unit of an ingredient actually cost", and establishes the principle that `cost` counts
only where someone can really pay it. The Ironman basis belongs beside `resolveIngredientUnitPrice()`
as a sibling function sharing its `PricedItem` shape, with the aggregation mirroring it the way
`buildProfitPipeline()` already mirrors the GE version.

This makes ROI meaningful rather than merely defined. It answers the question an Ironman actually has
in front of a pile of raw materials: **is it worth more processed than raw, and by how much?** A
craft that turns 1,420 gp of materials into a 1,536 gp item is +8.2%; one that turns them into
something worth less is negative, and should be — that's real information, not a broken row.

Two consequences worth being deliberate about:

- **Gp actually fronted is still a separate number**, and still worth showing. Keep it as
  `ironmanGpSpent` — the subset of input value that has to be handed to a shopkeeper. It drives the
  item card's cost line and the break-even block in §2.6, both of which genuinely mean "gp out of
  pocket". Do not conflate the two fields.
- **A residual set still has no ROI.** If every consumed ingredient has a null `valueBasis` — nothing
  buys it and it can't be alched — input value is zero and ROI stays null. That set is small, where
  gp-spent-as-denominator made it most of the list. Keep the existing behaviour for it: null sorts
  out of the ROI list, with the card showing `—`. Worth revisiting only if the coverage count from
  §0 shows it's larger than expected.

`ironmanProfit` and `ironmanRoi` are precomputed batch fields alongside `bestShopBuy` and indexed for
sorting, per finding 3 in the recommendations doc — the request-time pipeline never recomputes them.

Main mode is untouched: it keeps GE prices on both sides and gp-spent as its denominator.

### 2.4 Item card

`src/lib/components/global/item-card.svelte`

The big number currently renders `highPrice ?? lowPrice`. Under Ironman it renders the exit value,
and it needs to say where that value came from — a bare number with no source is the thing that makes
people distrust the whole page.

```
  Adamant platebody
  A sturdy platebody.

  1,536gp                          ← exit value
  High alch                        ← source line, replaces the "2 hours ago" timestamp
  Ironman profit: +116 gp (8.2%)   ← over the value of the materials consumed
  Materials: 1,420gp · 340gp from shops
```

Source line copy, by which basis won:

- `High alch`
- `Bob's Brilliant Axes` (the shop name, when a shop pays more)
- `No sell value` (nothing buys it and it can't be alched)

Cost line copy. It carries both numbers from §2.3.1 — what the materials are worth, and how much of
that you actually have to pay for:

- `Materials: 1,420gp · 340gp from shops` — when some inputs are shop-bought
- `Materials: 1,420gp · all gathered` — when nothing has to be bought
- `Materials: —` — when no consumed ingredient has a value basis

The percentage beside the profit line is `ironmanRoi`, so the card and the ROI sort always agree.

The `timeSince` line is GE-specific and should be dropped under Ironman; shop and alch values don't
go stale hourly.

### 2.5 Item detail page

`src/routes/items/[id=integer]/+page.svelte`. Four changes, top to bottom.

**Grand Exchange card.**

- Item is untradeable → don't render the card at all.
- Item is tradeable but the account is an Ironman → deprioritise it rather than annotate it. Order
  the card below the Shops card and collapse it behind a plain `Show Grand Exchange prices`
  disclosure, with no explanatory sub-line. It's still real information and people do want to know
  what a thing is "worth" — it just isn't the number they act on.

**New Shops card** (feature #2), a peer of the two existing pricing cards:

> ### Shops
>
> | Shop                              | Location  | Buys at | Sells at | Stock |
> | --------------------------------- | --------- | ------- | -------- | ----- |
> | Bob's Brilliant Axes `Best price` | Lumbridge | 25 gp   | 16 gp    | 5     |
> | General store                     | Anywhere  | 5 gp    | 21 gp    | 0     |
>
> Empty state: `No shop buys this item.`
> Members shops carry a `Members` badge.

**Game Prices card.** Rename the `Store price` row to `Value`. It's the item's base value, not a
store price, and once the Shops card exists next to it the old label is actively contradicted.

**Value insights card.**

| Row                | Main | Ironman                        |
| ------------------ | ---- | ------------------------------ |
| `GE spread`        | keep | hide — it's a merchant metric  |
| `High alch profit` | keep | replace with `High alch value` |
| `Low alch profit`  | keep | replace with `Low alch value`  |
| `gp per XP`        | —    | new row                        |

**Buy limit row** (in the Grand Exchange card) is a GE concept. Under Ironman it's replaced by
`Shop stock` / `Restocks every 60s` in the Shops card.

### 2.6 The selling block — answering your question directly

**Yes — new UI on the item page**, and it belongs _inside_ the Shops card rather than as its own
section, because it's meaningless without knowing which shop you're selling to. It appears under the
table, keyed to the best-paying shop, with a shop picker if more than one buys the item.

It needs two copy variants, because the number that matters depends on whether gp was fronted:

**When creation cost is zero (gathered materials — the common case):**

> **Selling to Bob's Brilliant Axes**
> The price drops as you sell. You'll get **25 gp** for the first one, down to **8 gp** by the 10th.
> Selling all 10 gets you **164 gp**. After that it stays at 8 gp.
> Stock refills every 60 seconds.

**When creation cost is above zero:**

> **Selling to Bob's Brilliant Axes**
> Each one costs you **340 gp** to make. The shop pays less for every one you sell, and drops below
> what you paid after **4**. Selling those 4 gets you **1,420 gp** — a profit of **60 gp**.
> Stock refills every 60 seconds.

Both are driven by the same `shopSources` data already fetched for the table, so no extra request. The
cost basis is already available — `creationCost` is computed for the item, and if "Only show what I
have supplies for" is on it's already net of the character's bank.

---

## 3. The no-price state (the main correctness risk)

Once untradeables are browsable, a whole class of items reaches components that have always assumed a
price exists. Today `item-card.svelte` renders `—` and `+page.svelte` renders `—` via `formatPrice`,
which is _safe_ but not _informative_ — a page of dashes reads as broken data.

Every price surface needs a defined, explained empty state:

| Situation                                       | Big number | Sub-line            |
| ----------------------------------------------- | ---------- | ------------------- |
| Untradeable, no shop buys it, not alchable      | `—`        | `Nothing buys this` |
| Untradeable, alchable                           | alch value | `High alch`         |
| Untradeable, shop buys it                       | shop price | shop name           |
| Tradeable but no recent GE trade (main account) | `—`        | `No recent trades`  |

That last row exists today and is silently filtered out. Once the filter drops it becomes visible, so
it needs copy whether or not we ship Ironman mode.

**This is the single highest-risk part of the change** and the reason I'd ship §0's coverage count
first: it tells us how many items land in each row before we write the states.

---

## 4. Suggested UI build order

| #   | Work                                                                    | Ships value alone?                                          |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `accountType` on the profile + character-dialog selector + header badge | Yes — mode is visible and settable before anything reads it |
| 2   | No-price states everywhere (§3)                                         | Yes — fixes a latent gap today                              |
| 3   | Drop `tradeable_on_ge` from browse + search behind the mode             | Yes — the untradeable unlock                                |
| 4   | Alch fix + `Value` relabel + hide GE spread                             | Yes — no new data needed                                    |
| 5   | Shops card                                                              | Needs shop scrape                                           |
| 6   | Selling block (§2.6)                                                    | Needs 5                                                     |
| 7   | Item-card exit value + source line, sort relabels, new sorts            | Needs 5                                                     |
| 8   | `ironmanInputValue` / `ironmanRoi` batch fields + ROI sort (§2.3.1)     | Needs 5                                                     |
| 9   | Cheapest-XP sort + gp-per-XP row                                        | Needs 7                                                     |

Steps 1–4 need no scraping and no new fields, and each is independently shippable. Step 3 is the one
you asked about, and it's a filter change gated on the mode rather than a data migration.

---

## 5. Open copy decisions

- **"Sell value" vs "cash value" vs "what you'd get."** I've used `sell value` throughout — shortest
  thing that's true for both shop and alch exits. Easy to swap, it's one label.
- **Nature rune cost** needs a home. It's an input to every alch number, and Ironmen craft their own
  so there's no market price that's really theirs. Suggest a field on the character profile,
  defaulting to the live GE price of a nature rune, with copy:
  `Nature rune cost — used for alchemy values. Set this to what a nature rune is worth to you.`
- **Ironman variants in copy.** Everything above says "Ironman" for all four types. Only Ultimate
  needs different wording eventually (no bank, so "supplies" means inventory), and that can wait.
