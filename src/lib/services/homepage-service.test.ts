import { describe, expect, it } from 'bun:test';
import { findShortfalls } from './homepage-service.server';

describe('findShortfalls', () => {
    it("lists only the skills the player hasn't reached", () => {
        const spec = {
            requiredSkills: [
                { skillName: 'Smithing', skillLevel: 70 },
                { skillName: 'Mining', skillLevel: 40 },
            ],
        };
        expect(findShortfalls(spec, { smithing: 67, mining: 50 })).toEqual([{ skill: 'smithing', need: 70, have: 67 }]);
    });

    it("prefers the whole tree's minimums over the recipe's own", () => {
        const spec = {
            requiredSkills: [{ skillName: 'Fletching', skillLevel: 10 }],
            treeMinSkills: { fletching: 10, woodcutting: 60 },
        };
        expect(findShortfalls(spec, { fletching: 50, woodcutting: 55 })).toEqual([
            { skill: 'woodcutting', need: 60, have: 55 },
        ]);
    });

    it('treats a skill the player has no level for as 0', () => {
        expect(findShortfalls({ requiredSkills: [{ skillName: 'Herblore', skillLevel: 3 }] }, {})).toEqual([
            { skill: 'herblore', need: 3, have: 0 },
        ]);
    });
});
