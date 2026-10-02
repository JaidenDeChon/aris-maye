# Homepage plan

New content for the space between `SiteHero` and `SiteFaq` on `src/routes/+page.svelte`. Every
module is backed by real numbers from the `items` collection and links into a filtered `/items`
view, so the homepage works as a front door to the browse page.

## Decisions

| Question            | Decision                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Personalization     | Global by default. With an active character profile, modules filter to that profile and say so.             |
| "Signed in"         | An active character profile in localStorage. There are no accounts, so personal parts render on the client. |
| Volume and movement | Stored by the hourly `update-item-prices` job. The homepage only ever reads Mongo.                          |
| Layout              | Desktop: a stat strip, then editorial bands. Mobile: the same bands collapsed into one tabbed card.         |
| GE tax              | Fixed everywhere, in the shared profit pipeline.                                                            |
| Delivery            | Three staged PRs (below).                                                                                   |

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
in a plain "See all" link to `/items`, which opens with the visitor's saved filters as usual.

## Metrics

All profit figures are after GE tax (see below). "Tradeable" means `tradeable_on_ge` with a price
under 24 hours old.

### 1. Stat strip

| Tile              | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| Best profit       | max `creationProfit`, with the item name               |
| Best ROI          | max `creationRoi`                                      |
| Best GP per limit | max `creationProfit × craftsPerLimit`                  |
| Most traded       | max `volume1h` (PR 2)                                  |
| Biggest mover     | max \|`priceChange24h`\| above the volume floor (PR 2) |

### 3. Make right now

The existing `roi-value-desc` and `roi-desc` sorts, plus a new **GP per limit** ranking:
`creationProfit × craftsPerLimit`.

`craftsPerLimit` is how many times you can make the item before one of its **ingredients** hits its
4-hour GE buy limit: the smallest `floor(buy_limit / amount)` across the ingredients you still have to
buy. It's the ingredients' limits that matter, not the finished item's, because selling on the GE has
no limit. Ingredients with no limit (coins) are ignored, and an item where nothing bought has a limit
is left out. Main accounts only.

The ROI ranking only counts items making at least `HOMEPAGE_MIN_ROI_PROFIT` (100 gp) each, so items
that cost 2 gp and sell for 5 don't fill the list.

### 4. Top earner per skill

For each skill in `skills-grid`, the item with the highest `creationProfit` whose
`creationSpecs.requiredSkills` includes that skill. One aggregation with `$unwind` on
`requiredSkills` and `$group` by skill name. Each tile links to `/items`.

### 5. Market pulse (PR 2)

- **Most traded:** `volume1h` (high + low volume), with the GP value traded shown as a secondary number.
- **Risers / fallers:** `priceChange24h = (latestMid − firstMid) / firstMid`, comparing the average price
  of the first and latest hours in the item's day of history that had trades. Hourly averages are
  steadier than single latest prices. Only items that pass the movers floor below count.
- **Before there's enough data:** the band still shows. With no history at all it's one "Coming soon"
  card. Once there's an hour, Most traded fills in, and risers and fallers show a "Coming soon" card with
  a progress bar ("7 of 23 hours of trade data collected") until the history spans 23 hours
  (`PRICE_CHANGE_MIN_HOURS`, one short of a day so a single missed run doesn't hide them).
- Mains only. Ironmen can't trade on the GE, so the band and its tiles are left out for them.

#### Movers floor

> **Tunable.** These numbers are starting guesses. Revisit them once PR 2 has collected a day of
> real volume data. They live as named constants (`MOVERS_MIN_GP_PER_DAY`, `MOVERS_MIN_TRADES_PER_DAY`)
> so changing them is a one-line edit.

An item counts as a mover only when both of these hold:

- **GP traded per day ≥ 10,000,000**, where GP traded is `volume24h × mid`.
- **Trades per day ≥ 10**, i.e. `volume24h`.

**Why a floor at all.** Rarely traded items swing wildly. If a niche item sells 3 times a day and
one player dumps it 60% under the usual price, it would top the fallers list. That's one impatient
seller, not a market move.

**Why GP traded instead of a fixed trade count.** A fixed count, such as 500 trades a day, favors cheap
items. Feathers pass easily, but a Twisted bow trading 10–30 times a day never would, even though a
5% move on a 1.5B item is real news. Measuring gold traded scales the bar with price:

| Item price | Trades/day needed for 10M gp     |
| ---------- | -------------------------------- |
| 5 gp       | 2,000,000                        |
| 1,000 gp   | 10,000                           |
| 1M gp      | 10                               |
| 1.5B gp    | 1 (the 10-trade minimum applies) |

The 10-trade minimum stops a single sale of an expensive item from counting.

**What to look at when tuning.**

- If the lists are full of the same few high-volume staples, the GP floor is too high, or the list
  needs a cap per category.
- If odd, illiquid items still show up with huge swings, raise the trade minimum.
- If expensive items never appear, lower the GP floor.

### 6. Alch & cheap XP

- **High alch picks:** `highalch − buyPrice − natureRunePrice`, where `buyPrice` is `highPrice`, the
  instant-buy price, since that's what it costs to get one now. Prices older than 24 hours are skipped. Shows the buy limit so the visitor can see how many they can do per 4 hours.
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

Built for every visitor and cached in both snapshots. Mains find it at the end of the page; an Ironman
profile sees it first, and on phones as the first tab.

- **Sell to shops:** items whose best coin-shop `storePrices.firstPrice` beats their alch value after a
  nature rune, ranked by the gain, one shop per item. Shows the shop, the alch value, and how many sales
  until the price bottoms out (`salesToFloor`, `floorPrice`). Shops paying in Tokkul and the like are
  left out.
- **Make from shop stock:** creations whose every direct ingredient a coin shop sells
  (`storePrices.buyPrice > 0`, stock not 0), priced at the cheapest such shop, with coins at face value.
  Profit is the result's alch value after a nature rune, less those costs. This is the workable version
  of "self-sufficient": the dataset can't tell gatherable resources from drop-only ones (see
  `ironman-feature-recommendations.md`). It also only knows shops that buy from players, since that's
  what `populate-store-prices` scrapes, so a few sell-only shops are missed.
- **Craft to alch:** the Ironman profit pipeline's top creations (alch value on both sides).
- **Cheapest Ironman XP:** Cheapest XP, valued in alch value lost per XP.

**Nothing an Ironman sees depends on the GE.** In Ironman mode an ingredient costs the cheaper of its
cheapest coin-shop price and its alch value, and a finished item is worth the higher of the best coin
shop's first-sale price and its alch value. Each alch charges a nature rune at the cheapest coin-shop
price (`getIronmanNatureRunePrice`, falling back to `NATURE_RUNE_FALLBACK_PRICE`). An item only appears
when it can be alched or a shop trades it, and `/items` sorts Ironman results without the GE price. This
covers the Ironman snapshot, For you, Almost unlocked, Best XP, "Train X next", this corner, and `/items`.

**Ironman mode toggle.** `activeIsIronman()` in the character store is the one switch every price reads.
It follows the active character's account type unless the top-bar toggle overrides it for that
character; selecting another character goes back to that character's own type.

An Ironman profile skips the last two here, because the page's main sections already show them valued
the Ironman way.

## GE tax

The tax is 2% of the sale price, rounded down and capped at 5,000,000 gp per item. Anything sold
for under 50 gp pays nothing, and the wiki lists a few exempt items (Old school bonds and some
starter tools). Add a `geTax(price, itemId)` helper and an exemption list in
`src/lib/constants/`. Then subtract the tax from the output price in `buildProfitPipeline` for GE
accounts only. Ironman mode has no GE sales, so it's unaffected. Update `game-item-profit-pipeline.test.ts`
and the item page's profit breakdown so they show the tax as its own row.

## Data changes (PR 2)

The hourly job also fetches `/api/v1/osrs/1h` (one bulk request for the last full hour) and writes to
each GE item, through `helpers/volume-history.ts`:

```ts
volumeHistory: {
    t: number;
    v: number;
    mid: number | null;
}
[]; // the last 24 hours, oldest first
volume1h: number; // traded in the latest hour, buys and sells together
volume24h: number; // sum of volumeHistory.v
priceChange24h: number | null; // null until the history spans PRICE_CHANGE_MIN_HOURS
```

A second run in the same hour replaces that hour instead of counting it twice. An item missing from the
hour's data traded nothing and gets a zero entry. If the `/1h` fetch fails, the run logs it and updates
prices alone. The numbers live in `src/lib/constants/market.ts`, which has no imports so the job's bundler
can read it.

There's an index on `{ tradeable_on_ge: 1, volume1h: -1 }`. The volume fields could also power new sorts
on `/items` later.

## Performance

The profit pipeline is the expensive part and already spills to disk, so it runs once per snapshot
and `$facet` cuts the result into every global list. The snapshot is stored in the
`homepage-snapshots` collection (one document for mains, one for Ironmen), and the page reads that
single document.

- **Refresh:** after updating prices, the hourly job calls `POST /api/homepage/refresh` with an
  `x-refresh-token` header. The job can't import the homepage service directly because its bundler
  can't resolve `$lib` imports. The endpoint only exists when `HOMEPAGE_REFRESH_TOKEN` is set on the
  site, and the job skips the call when it isn't.
- **Fallback:** a snapshot older than 65 minutes (`HOMEPAGE_SNAPSHOT_MAX_AGE_MS`) is still served
  straight away. The browser sees its age and asks `/api/homepage?fresh=1`, which rebuilds it within
  that request and swaps the new one in. A missing snapshot is built on the request that finds it.
  The server never rebuilds in the background, because Netlify freezes a function once it has
  answered and the rebuild would never finish. Only one request rebuilds at a time: it claims the
  rebuild in Mongo (`rebuildingAt`, released after 2 minutes if it dies), and the others get the
  stale snapshot. So the page works without the token, and deploy previews (which the hourly job
  never refreshes) stay current.
- **Personal sections** query live from the browser and show skeletons while they load.

## Delivery

1. **PR 1:** GE tax fix, the layout and mobile tabs, Stat strip (the 3 profit tiles), Make right
   now, Top earner per skill, Alch & cheap XP, For you, and the homepage snapshot.
2. **PR 2:** volume in the hourly job, the Market pulse band, and the two volume tiles.
3. **PR 3:** the Ironman corner, and moving it up the page for Ironman profiles.

## Open questions

- Tune the [movers floor](#movers-floor) once real volume data is in.
- This session has no Mongo credentials, so thresholds and copy need a pass against real data once
  PR 1 runs on a deploy preview.
