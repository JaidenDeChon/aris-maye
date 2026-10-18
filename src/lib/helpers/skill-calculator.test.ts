import { describe, expect, it } from 'bun:test';
import type { CalculatorMethod } from '$lib/models/calculators';
import {
    DEFAULT_SKILL_GOAL,
    cheapestUsable,
    currentLevel,
    hasGoalStart,
    methodTotals,
    parseSkillGoal,
    skillGoalParams,
    visibleMethods,
    xpNeeded,
    type SkillGoal,
} from './skill-calculator';

const parse = (query: string) => parseSkillGoal(new URLSearchParams(query));

function method(id: number, level: number, xp: number, netCost: number): CalculatorMethod {
    return { id, name: `Item ${id}`, level, xp, netCost, gpPerXp: Math.max(0, netCost) / xp };
}

const goal = (from: number, to: number, canUseOnly = false): SkillGoal => ({
    from: { mode: 'level', value: from },
    to: { mode: 'level', value: to },
    canUseOnly,
});

describe('parseSkillGoal', () => {
    it('defaults to level 1 to 99', () => expect(parse('')).toEqual(DEFAULT_SKILL_GOAL));

    it('reads levels', () => {
        expect(parse('from=50&to=70')).toEqual(goal(50, 70));
    });

    it('prefers XP over a level', () => {
        expect(parse('from=50&fromXp=123456&toXp=2000000')).toEqual({
            from: { mode: 'xp', value: 123_456 },
            to: { mode: 'xp', value: 2_000_000 },
            canUseOnly: false,
        });
    });

    it('clamps out-of-range values', () => {
        expect(parse('from=0&to=150')).toEqual(goal(1, 99));
        expect(parse('fromXp=-5&toXp=999999999')).toMatchObject({
            from: { mode: 'xp', value: 0 },
            to: { mode: 'xp', value: 200_000_000 },
        });
    });

    it('ignores junk', () => {
        expect(parse('from=abc&to=&fromXp=NaN')).toEqual(DEFAULT_SKILL_GOAL);
    });

    it('reads the can-use filter', () => {
        expect(parse('can=1').canUseOnly).toBe(true);
        expect(parse('can=yes').canUseOnly).toBe(false);
    });
});

describe('hasGoalStart', () => {
    it('is true only when the URL sets a usable start', () => {
        expect(hasGoalStart(new URLSearchParams('from=40'))).toBe(true);
        expect(hasGoalStart(new URLSearchParams('fromXp=0'))).toBe(true);
        expect(hasGoalStart(new URLSearchParams('to=80&from=abc'))).toBe(false);
    });
});

describe('skillGoalParams', () => {
    it('leaves the default goal bare', () => expect(skillGoalParams(DEFAULT_SKILL_GOAL).toString()).toBe(''));

    it('writes levels and XP the way they were entered', () => {
        expect(skillGoalParams(goal(50, 70, true)).toString()).toBe('from=50&to=70&can=1');
        expect(skillGoalParams({ ...goal(1, 99), from: { mode: 'xp', value: 101_333 } }).toString()).toBe(
            'fromXp=101333',
        );
    });

    it('round-trips through parseSkillGoal', () => {
        const original: SkillGoal = {
            from: { mode: 'xp', value: 5_000 },
            to: { mode: 'level', value: 60 },
            canUseOnly: true,
        };
        expect(parseSkillGoal(skillGoalParams(original))).toEqual(original);
    });
});

describe('xpNeeded', () => {
    it('is the gap between the levels', () => expect(xpNeeded(goal(50, 70))).toBe(636_294));
    it('is 1 to 99 by default', () => expect(xpNeeded(DEFAULT_SKILL_GOAL)).toBe(13_034_431));
    it('is 0 when the target is behind', () => expect(xpNeeded(goal(80, 70))).toBe(0));
    it('mixes XP and levels', () => {
        expect(xpNeeded({ ...goal(1, 50), from: { mode: 'xp', value: 1_333 } })).toBe(100_000);
    });
});

describe('methodTotals', () => {
    it('rounds the count up and multiplies the cost', () => {
        // 636,294 XP at 100 each needs 6,363.
        expect(methodTotals(method(1, 40, 100, 30), goal(50, 70))).toEqual({
            count: 6_363,
            totalCost: 190_890,
            usable: true,
        });
    });

    it('handles fractional XP', () => {
        expect(methodTotals(method(1, 1, 12.5, 1), { ...goal(1, 2), to: { mode: 'xp', value: 100 } }).count).toBe(8);
        expect(methodTotals(method(1, 1, 0.1, 1), { ...goal(1, 2), to: { mode: 'xp', value: 10 } }).count).toBe(100);
    });

    it('gives a negative total for a method that pays', () => {
        expect(methodTotals(method(1, 1, 50, -20), { ...goal(1, 2), to: { mode: 'xp', value: 1_000 } })).toEqual({
            count: 20,
            totalCost: -400,
            usable: true,
        });
    });

    it('marks methods above the current level as unusable', () => {
        expect(methodTotals(method(1, 51, 10, 1), goal(50, 70)).usable).toBe(false);
        expect(methodTotals(method(1, 50, 10, 1), goal(50, 70)).usable).toBe(true);
    });

    it('makes nothing when the goal is reached', () => {
        expect(methodTotals(method(1, 1, 10, 5), goal(70, 70))).toEqual({ count: 0, totalCost: 0, usable: true });
    });
});

describe('visibleMethods and cheapestUsable', () => {
    const methods = [method(1, 80, 100, 0), method(2, 30, 50, 10), method(3, 1, 10, 20)];

    it('lists everything unless asked to hide what needs a higher level', () => {
        expect(visibleMethods(methods, goal(40, 99))).toHaveLength(3);
        expect(visibleMethods(methods, goal(40, 99, true)).map((m) => m.id)).toEqual([2, 3]);
    });

    it('picks the first usable method', () => {
        expect(cheapestUsable(methods, goal(40, 99))?.id).toBe(2);
        expect(cheapestUsable(methods, goal(85, 99))?.id).toBe(1);
        expect(cheapestUsable([method(1, 50, 10, 1)], goal(1, 99))).toBeNull();
    });

    it('reads the current level from XP', () => expect(currentLevel(goal(1, 99))).toBe(1));
});
