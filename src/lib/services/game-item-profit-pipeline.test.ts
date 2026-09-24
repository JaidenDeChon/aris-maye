import { describe, expect, it } from 'bun:test';
import { buildProfitPipeline } from './game-item-mongo-service.server';

/** Every literal in the built pipeline, so a seam can be checked wherever it sits in the tree. */
function stageText(ironman: boolean): string {
    return JSON.stringify(buildProfitPipeline(null, false, false, false, ironman, 100));
}

describe('buildProfitPipeline pricing seams', () => {
    // The regression this guards: Ironman mode once changed only what the cards displayed, leaving
    // both sides of the recipe priced from the Grand Exchange. Browse results came back in exactly
    // the same order in both modes, because the sort keys were computed from untouched GE prices.
    it('prices the output from the Grand Exchange for a main', () => {
        expect(stageText(false)).toContain('$highPrice');
    });

    it('prices the output from alchemy for an Ironman', () => {
        const ironman = stageText(true);
        expect(ironman).toContain('$highalch');
        expect(ironman).toContain('$$matched.highalch');
    });

    it('does not read a Grand Exchange price anywhere in Ironman mode', () => {
        const ironman = stageText(true);
        expect(ironman).not.toContain('$highPrice');
        expect(ironman).not.toContain('$lowPrice');
        expect(ironman).not.toContain('$$matched.highPrice');
        expect(ironman).not.toContain('$$matched.lowPrice');
    });

    // The ingredient side reads `highalch` off the joined document, so the lookup has to project it.
    // Without this the ingredient value is always null and every creation cost nulls with it.
    it('projects highalch on the ingredient lookup', () => {
        expect(stageText(true)).toContain('"highalch":1');
    });

    it('subtracts the nature rune price it is given', () => {
        expect(JSON.stringify(buildProfitPipeline(null, false, false, false, true, 250))).toContain('250');
    });

    // Coins are money in either mode, and roughly a third of recipes charge a coin fee.
    it('keeps the currency exception under Ironman', () => {
        expect(stageText(true)).toContain('Coins');
    });

    it('still surfaces the realizable value for the card under Ironman only', () => {
        expect(stageText(true)).toContain('ironmanExitValue');
        expect(stageText(false)).not.toContain('ironmanExitValue');
    });
});
