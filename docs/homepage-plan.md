# Homepage plan

New content for the space between `SiteHero` and `SiteFaq` on `src/routes/+page.svelte`. Every
module is backed by real numbers from the `items` collection and links into a filtered `/items`
view, so the homepage works as a front door to the browse page.

## Decisions

| Question            | Decision                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Personalization     | Global by default. With an active character profile, modules filter to that profile and say so.     |
| "Signed in"         | An active character profile in localStorage. There are no accounts, so personal parts render on the client. |
| Volume and movement | Stored by the hourly `update-item-prices` job. The homepage only ever reads Mongo.                   |
| Layout              | Desktop: a stat strip, then editorial bands. Mobile: the same bands collapsed into one tabbed card.  |
| GE tax              | Fixed everywhere, in the shared profit pipeline.                                                     |
| Delivery            | Three staged PRs (below).                                                                            |

## Page structure

```
Hero (existing)
├─ 1. Stat strip         4–5 headline tiles (StatTile)
├─ 2. For you            only with an active profile
├─ 3. Make right now     Profit / ROI / GP per limit toggle
├─ 4. Top earner per skill
├─ 5. Market pulse       most traded, risers, fallers
├─ 6. Alch & cheap XP
├─ 7. Ironman corner     moves up to slot 3 for Ironman profiles
FAQ (existing)
```

Under the `md` breakpoint, sections 3–7 become one card built on `ui/tabs`, with a short label per
tab. The stat strip scrolls sideways and For you stays on top. Each band shows 4–6 items and ends
in a "See all" link to `/items` with the matching sort or filter.

## Metrics

All profit figures are after GE tax (see below). "Tradeable" means `tradeable_on_ge` with a price
under 24 hours old.

### 1. Stat strip

| Tile              | Value                                          |
| ----------------- | ---------------------------------------------- |
| Best profit       | max `creationProfit`, with the item name       |
| Best ROI          | max `creationRoi`                              |
| Best GP per limit | max `creationProfit × buyLimit`                |
| Most traded       | max `volume1h` (PR 2)                          |
| Biggest mover     | max \|`priceChange24h`\| above the volume floor (PR 2) |

### 3. Make right now

The existing `roi-value-desc` and `roi-desc` sorts, plus a new **GP per limit** sort:
`creationProfit × min(buyLimit, volume24h / 6)`. Capping by volume stops an item with a big buy
limit that barely trades from claiming the top spot. Until PR 2 lands it falls back to the buy limit
alone.

### 4. Top earner per skill

For each skill in `skills-grid`, the item with the highest `creationProfit` whose
`creationSpecs.requiredSkills` includes that skill. One aggregation with `$unwind` on
`requiredSkills` and `$group` by skill name. Each tile links to `/items?skill=<skill>&sort=roi-value-desc`.

### 5. Market pulse (PR 2)

- **Most traded:** `volume1h` (high + low volume), with the GP value traded shown as a secondary number.
- **Risers / fallers:** `priceChange24h = (mid − mid24hAgo) / mid24hAgo`, where `mid` is the mean of
  `highPrice` and `lowPrice`. Only items with `volume24h ≥ 500` and a `mid` of at least 100 gp count.

### 6. Alch & cheap XP

- **High alch picks:** `highalch − buyPrice − natureRunePrice`, where `buyPrice` is `lowPrice` falling
  back to `highPrice`. Shows the buy limit so the visitor can see how many they can do per 4 hours.
- **Cheapest XP:** for each skill, the creation with the lowest `max(0, −creationProfit) / xp`, using
  the matching `experienceGranted` row. Shown as "x gp/xp". A profitable creation counts as 0 gp/xp
  and is tagged "pays you".

### 2. For you (client side)

These modules read `character-store` and `bank-items-store` and call the existing
`/api/game-items` with the player's levels, plus one new endpoint for "Almost unlocked".

- **Your best earners:** the top 5 by profit at the player's current levels.
- **Almost unlocked:** the best-profit items where every requirement is within 5 levels of the
  player's stats and at least one requirement is not yet met. Shows "Smithing 3 levels away".
- **Make from your bank:** the existing `useSupplies` pipeline. Hidden when the bank is empty.
- **Best skill to train:** for each skill, the extra top-10 profit unlocked by raising only that skill by 5
  levels. Shows the skill with the biggest gain.

### 7. Ironman corner (PR 3)

These use the pipeline's Ironman mode (`ironmanExitValue`) and `storePrices`.

- **Best shop sales:** items whose best `storePrices.firstPrice` beats `highalch`, with
  `salesToFloor` shown as "sell N before the price bottoms out".
- **Craft-to-alch profit:** `creationProfit` in Ironman mode, i.e. product alch value minus the
  value of the ingredients.
- **Cheapest Ironman XP:** the same as Cheapest XP, but valued in alch value lost per XP.
- **Shop-supplied crafts:** creations where every leaf ingredient can be bought from an NPC shop
  (`storePrices.buyPrice` with `stock > 0`) or crafted from such inputs. Ranked by exit value minus
  the shop cost. This is the closest workable version of "self-sufficient": the dataset can't yet
  tell gatherable resources from drop-only ones (see `ironman-feature-recommendations.md`), so
  gathered inputs aren't counted until source data exists.

## GE tax

The tax is 2% of the sale price, rounded down and capped at 5,000,000 gp per item. Anything sold
for under 50 gp pays nothing, and the wiki lists a few exempt items (Old school bonds and some
starter tools). Add a `geTax(price, itemId)` helper and an exemption list in
`src/lib/constants/`. Then subtract the tax from the output price in `buildProfitPipeline` for GE
accounts only. Ironman mode has no GE sales, so it's unaffected. Update `game-item-profit-pipeline.test.ts`
and the item page's profit breakdown so they show the tax as its own row.

## Data changes (PR 2)

The hourly job also fetches `/api/v1/osrs/1h` (one bulk request) and writes to each item:

```ts
volume1h: number;                                  // highPriceVolume + lowPriceVolume
volumeHistory: { t: number; v: number; mid: number | null }[]; // $push with $slice: -24
volume24h: number;                                 // sum of volumeHistory.v
priceChange24h: number | null;                     // from volumeHistory[0].mid
```

Add an index on `{ tradeable_on_ge: 1, volume1h: -1 }`. The Market pulse band stays hidden until the
history covers 24 hours. The volume fields could also power new sorts on `/items` later.

## Performance

The homepage runs about 6 aggregations, several of them over the profit pipeline, which already spills to
disk. To keep page loads fast, the hourly job also computes a single `homepage-snapshot` document
(the global stat strip and band contents) and the page reads that one document. Only the
personalized modules query live, and they render on the client after first paint with skeletons.
The snapshot ships in PR 1. If it's missing or more than 2 hours old, the page falls back to
querying live.

## Delivery

1. **PR 1:** GE tax fix, the layout and mobile tabs, Stat strip (the 3 profit tiles), Make right
   now, Top earner per skill, Alch & cheap XP, For you, and the homepage snapshot.
2. **PR 2:** volume in the hourly job, the Market pulse band, and the two volume tiles.
3. **PR 3:** the Ironman corner, and moving it up the page for Ironman profiles.

## Open questions

- Is the 500-trades-per-day floor for movers right, or should it scale with price?
- Should "See all" links open `/items` with the visitor's saved filters, or a clean view?
- This session has no Mongo credentials, so thresholds and copy need a pass against real data once
  PR 1 runs on a deploy preview.
