# Aris Maye

SvelteKit application for Old School RuneScape skilling and Grand Exchange browsing. Developed primarily with [Bun](https://bun.sh/) as the runtime.

## Project overview

- Full-stack SvelteKit application
- Uses tailwind + [shadcn-svelte](https://www.shadcn-svelte.com) component library
- Powered by:
    - Price data derived from [OSRS Wiki GE Prices](https://prices.runescape.wiki/osrs)
    - Item data derived from
        - [OSRSDeboxed-DB](https://github.com/0xNeffarion/osrsreboxed-db)
        - [OSRS Wiki](https://oldschool.runescape.wiki)
    - 3D models, textures and animations for the Transmog Dressing Room from the live game cache, via the [OpenRS2 Archive](https://archive.openrs2.org)

## Key feature areas

- **Item browsing UI**: `src/lib/components/items/game-items-page.svelte` handles filtering, pagination, skill-based availability, fetches `/api/game-items`, and renders cards with pagination controls.
- **Data/services**: `src/lib/services/` wraps external APIs (e.g., OSRS wiki) and persistence layers for item data/pricing, including `grand-exchange-api-service.ts` for cached price and timeseries fetches.
- **State & preferences**: Svelte stores in `src/lib/stores/` persist character profiles, favorites/hidden flags, and item-page filters across sessions.
- **Transmog Dressing Room**: `/transmog-dressing-room` lets you try on any wearable item in 3D. The data in `static/transmog/` is generated, not committed: the build downloads the newest game cache from OpenRS2 and decodes it (`scripts/transmog/`), keeping the last good copy in `node_modules/.cache/transmog` in case OpenRS2 is down. The renderer in `src/lib/osrs-model/` draws it the way the game does.
- **Helpers**: Utilities for formatting numbers, time, skill defaults, and related helpers reside alongside constants and models.

## Getting started

Install dependencies (Bun preferred). Once the app is started, allow a moment for the MongoDB connection to be established.

```bash
bun install
bun run dev
```

The first `dev` or `build` downloads the game cache (about 190MB) to build the transmog data, which takes a minute. Set `TRANSMOG_DATA=skip` to leave it out, or run `bun run extract-transmog` to refresh it on its own.

## Tooling

- Tailwind CSS utilities via `tailwind.config.ts`.
- Project configured for Bun-first workflows but compatible with Node package managers if needed.
