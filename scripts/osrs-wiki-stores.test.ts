import { describe, expect, it } from 'bun:test';
import { parseStorePage } from './osrs-wiki-stores';

// Trimmed from oldschool.runescape.wiki/w/Varrock_Swordshop.
const swordshop = `{{Infobox Shop
|name = Varrock Swordshop
|members = No
}}
==Stock==
{{StoreTableHead|sellmultiplier=1000|buymultiplier=600|delta=20}}
{{StoreLine|name=Bronze sword|stock=5|restock=100}}
{{StoreLine|name=Iron sword|stock=4|restock=200}}
{{StoreTableBottom}}`;

describe('parseStorePage', () => {
    it('reads the multipliers and the stock list', () => {
        const shop = parseStorePage('Varrock Swordshop', swordshop);

        expect(shop).not.toBeNull();
        expect(shop!.sellMultiplier).toBe(1000);
        expect(shop!.buyMultiplier).toBe(600);
        expect(shop!.delta).toBe(20);
        expect(shop!.currency).toBeNull();
        expect(shop!.buysFromPlayers).toBe(true);
        expect(shop!.items).toEqual([
            { name: 'Bronze sword', stock: 5, restock: 100, sellOverride: null, buyOverride: null },
            { name: 'Iron sword', stock: 4, restock: 200, sellOverride: null, buyOverride: null },
        ]);
    });

    it('returns null for a page with no stock table', () => {
        // Category:Shops also holds shop *type* overview pages such as "Axe shops".
        expect(parseStorePage('Axe shops', '== Axe shops ==\nA list of shops that sell [[axe]]s.')).toBeNull();
    });

    it('returns null when the table head has no lines', () => {
        expect(parseStorePage('Empty', '{{StoreTableHead|sellmultiplier=1000}}\n{{StoreTableBottom}}')).toBeNull();
    });

    it('picks up per-item price overrides', () => {
        const shop = parseStorePage(
            'Odd shop',
            '{{StoreTableHead|buymultiplier=400|delta=30}}\n{{StoreLine|name=Feather|stock=100|restock=10|sell=3|buy=1}}',
        );

        expect(shop!.items[0]).toEqual({
            name: 'Feather',
            stock: 100,
            restock: 10,
            sellOverride: 3,
            buyOverride: 1,
        });
    });

    it('records a shop that trades in something other than coins', () => {
        const shop = parseStorePage(
            'Token shop',
            '{{StoreTableHead|buymultiplier=400|delta=0|currency=Nightmare Zone points}}\n{{StoreLine|name=Imbue|stock=1}}',
        );

        expect(shop!.currency).toBe('Nightmare Zone points');
    });

    it('marks a shop that will not buy from players', () => {
        const shop = parseStorePage(
            'Sell-only',
            '{{StoreTableHead|sellmultiplier=1000|buymultiplier=0|delta=0|hidebuy=yes}}\n{{StoreLine|name=Rune|stock=1}}',
        );

        expect(shop!.buysFromPlayers).toBe(false);
    });

    it('keeps a line whose optional parameters are missing', () => {
        const shop = parseStorePage('Sparse', '{{StoreTableHead|buymultiplier=400}}\n{{StoreLine|name=Pot}}');

        expect(shop!.delta).toBeNull();
        expect(shop!.items[0]).toEqual({
            name: 'Pot',
            stock: null,
            restock: null,
            sellOverride: null,
            buyOverride: null,
        });
    });
});
