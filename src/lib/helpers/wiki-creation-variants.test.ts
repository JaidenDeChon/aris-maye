import { describe, expect, it } from 'bun:test';
import { selectMethodsForVersion } from './wiki-creation-variants';

/** Shorthand for the only field the selector reads. */
const m = (methodName?: string) => ({ methodName });

describe('selectMethodsForVersion', () => {
    it('keeps only the panel labelled with the item version', () => {
        // oldschool.runescape.wiki/w/Steel_javelin#Poison
        const methods = [m('Unpoisoned'), m('Poison'), m('Poison+'), m('Poison++')];

        expect(selectMethodsForVersion(methods, 'Poison', ['Unpoisoned', 'Poison', 'Poison+', 'Poison++'])).toEqual([
            m('Poison'),
        ]);
    });

    it('does not let "Poison" swallow "Poison+"', () => {
        const methods = [m('Poison'), m('Poison+'), m('Poison++')];

        expect(selectMethodsForVersion(methods, 'Poison+', ['Poison', 'Poison+', 'Poison++'])).toEqual([m('Poison+')]);
    });

    it('drops sibling-labelled panels when the item version has no panel of its own', () => {
        // Steel bolts labels its fletching panels by feather, but its poisoning panels
        // by version. Unpoisoned bolts must keep the feathers and lose the poisons.
        const methods = [m('Feather'), m('Yellow feather'), m('Poison'), m('Poison+'), m('Poison++')];

        const kept = selectMethodsForVersion(methods, 'Unpoisoned', ['Unpoisoned', 'Poison', 'Poison+', 'Poison++']);

        expect(kept).toEqual([m('Feather'), m('Yellow feather')]);
    });

    it('matches an underscored anchor against a spaced panel label', () => {
        const methods = [m('Unpoisoned'), m('Karambwan poison')];

        expect(selectMethodsForVersion(methods, 'Karambwan_poison', ['Unpoisoned', 'Karambwan_poison'])).toEqual([
            m('Karambwan poison'),
        ]);
    });

    it('ignores case and a non-breaking space in either label', () => {
        const methods = [m('4 dose'), m('3 dose')];

        expect(selectMethodsForVersion(methods, '4 DOSE', ['4 dose', '3 dose'])).toEqual([m('4 dose')]);
    });

    it('keeps every method when the page labels by something other than version', () => {
        // Candle lantern's panels are named for the candle, not for the lit/unlit version.
        const methods = [m('White candle'), m('Black candle')];
        const versions = ['Unlit (white candle)', 'Lit (white candle)'];

        expect(selectMethodsForVersion(methods, 'Lit (white candle)', versions)).toEqual(methods);
    });

    it('keeps every method when the section has no labels at all', () => {
        // Oak seedling's Creation section is plain subsections: Planting, then Watering.
        const methods = [m(), m()];

        expect(selectMethodsForVersion(methods, 'Watered', ['Unwatered', 'Watered'])).toEqual(methods);
    });

    it('returns nothing when every panel belongs to a sibling', () => {
        // Abyssal dagger documents only the three poisoning recipes: the plain dagger is a
        // drop, not a craft. Handing it the cheapest of them costed a 2.2M item at 399gp.
        const methods = [m('Poison'), m('Poison+'), m('Poison++')];

        expect(selectMethodsForVersion(methods, 'Unpoisoned', ['Unpoisoned', 'Poison', 'Poison+', 'Poison++'])).toEqual(
            [],
        );
    });

    it('empties a lone panel that belongs to a sibling', () => {
        const methods = [m('Poison')];

        expect(selectMethodsForVersion(methods, 'Unpoisoned', ['Unpoisoned', 'Poison'])).toEqual([]);
    });

    it('leaves unversioned items untouched', () => {
        const methods = [m('Smithing'), m('Imbuing')];

        expect(selectMethodsForVersion(methods, null, ['Smithing'])).toEqual(methods);
    });

    it('keeps a lone unlabelled method', () => {
        const methods = [m()];

        expect(selectMethodsForVersion(methods, 'Unpoisoned', ['Unpoisoned', 'Poison'])).toEqual(methods);
    });

    it('keeps everything when no sibling versions are known', () => {
        // Without siblings there is nothing to attribute a panel to, so nothing is dropped.
        const methods = [m('Poison'), m('Poison+')];

        expect(selectMethodsForVersion(methods, 'Unpoisoned', [])).toEqual(methods);
    });

    it('preserves wiki order among the kept methods', () => {
        const methods = [m('Feather'), m('Poison'), m('Yellow feather'), m('Poison+')];

        expect(selectMethodsForVersion(methods, 'Unpoisoned', ['Unpoisoned', 'Poison', 'Poison+'])).toEqual([
            m('Feather'),
            m('Yellow feather'),
        ]);
    });
});
