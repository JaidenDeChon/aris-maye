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

## Key feature areas

- **Item browsing UI**: `src/lib/components/items/game-items-page.svelte` handles filtering, pagination, skill-based availability, fetches `/api/game-items`, and renders cards with pagination controls.
- **Data/services**: `src/lib/services/` wraps external APIs (e.g., OSRS wiki) and persistence layers for item data/pricing, including `grand-exchange-api-service.ts` for cached price and timeseries fetches.
- **State & preferences**: Svelte stores in `src/lib/stores/` persist character profiles, favorites/hidden flags, and item-page filters across sessions.
- **Helpers**: Utilities for formatting numbers, time, skill defaults, and related helpers reside alongside constants and models.

## Getting started

Install dependencies (Bun preferred). Once the app is started, allow a moment for the MongoDB connection to be established.

```bash
bun install
bun run dev
```

## Tooling

- Tailwind CSS utilities via `tailwind.config.ts`.
- Project configured for Bun-first workflows but compatible with Node package managers if needed.
