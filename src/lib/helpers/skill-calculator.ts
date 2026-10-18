import type { CalculatorMethod } from '$lib/models/calculators';
import { MAX_LEVEL, MAX_XP, levelForXp, xpForLevel } from './xp-table';

/** One end of a goal, as the player entered it: a level, or an exact XP amount. */
export type GoalPoint = { mode: 'level' | 'xp'; value: number };

/** Where the player is, where they want to be, and whether to hide methods they can't use yet. */
export type SkillGoal = { from: GoalPoint; to: GoalPoint; canUseOnly: boolean };

export const DEFAULT_SKILL_GOAL: SkillGoal = {
    from: { mode: 'level', value: 1 },
    to: { mode: 'level', value: MAX_LEVEL },
    canUseOnly: false,
};

/** A whole number from a query value, or null when it isn't one. */
function readNumber(raw: string | null): number | null {
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.floor(value) : null;
}

/** Keeps a point inside 1–99 for a level and 0–200M for XP. */
export function clampPoint(point: GoalPoint): GoalPoint {
    const value = Number.isFinite(point.value) ? Math.floor(point.value) : 0;
    return point.mode === 'level'
        ? { mode: 'level', value: Math.min(MAX_LEVEL, Math.max(1, value)) }
        : { mode: 'xp', value: Math.min(MAX_XP, Math.max(0, value)) };
}

function readPoint(params: URLSearchParams, name: 'from' | 'to', fallback: GoalPoint): GoalPoint {
    const xp = readNumber(params.get(`${name}Xp`));
    if (xp !== null) return clampPoint({ mode: 'xp', value: xp });
    const level = readNumber(params.get(name));
    if (level !== null) return clampPoint({ mode: 'level', value: level });
    return fallback;
}

/** The goal in a calculator URL. Junk falls back to the default and out-of-range values are clamped. */
export function parseSkillGoal(params: URLSearchParams): SkillGoal {
    return {
        from: readPoint(params, 'from', DEFAULT_SKILL_GOAL.from),
        to: readPoint(params, 'to', DEFAULT_SKILL_GOAL.to),
        canUseOnly: params.get('can') === '1',
    };
}

/** Whether a URL sets the starting point, so a saved character shouldn't replace it. */
export function hasGoalStart(params: URLSearchParams): boolean {
    return readNumber(params.get('fromXp')) !== null || readNumber(params.get('from')) !== null;
}

/** The query for a goal, leaving out anything at its default so the default page's URL stays bare. */
export function skillGoalParams(goal: SkillGoal): URLSearchParams {
    const params = new URLSearchParams();
    const write = (name: 'from' | 'to', point: GoalPoint, fallback: GoalPoint) => {
        const clamped = clampPoint(point);
        if (clamped.mode === fallback.mode && clamped.value === fallback.value) return;
        params.set(clamped.mode === 'xp' ? `${name}Xp` : name, String(clamped.value));
    };
    write('from', goal.from, DEFAULT_SKILL_GOAL.from);
    write('to', goal.to, DEFAULT_SKILL_GOAL.to);
    if (goal.canUseOnly) params.set('can', '1');
    return params;
}

/** A point's XP. */
export function pointXp(point: GoalPoint): number {
    const clamped = clampPoint(point);
    return clamped.mode === 'xp' ? clamped.value : xpForLevel(clamped.value);
}

/** The XP between the two ends of the goal, or 0 when the player is already there. */
export function xpNeeded(goal: SkillGoal): number {
    return Math.max(0, pointXp(goal.to) - pointXp(goal.from));
}

/** The level the player is at now. */
export function currentLevel(goal: SkillGoal): number {
    return levelForXp(pointXp(goal.from));
}

export type MethodTotals = {
    /** How many to make. */
    count: number;
    /** What making them all costs. Negative when it pays. */
    totalCost: number;
    /** Whether the player's current level is high enough. */
    usable: boolean;
};

/** How many of a method reach the goal, and what they cost. */
export function methodTotals(method: CalculatorMethod, goal: SkillGoal): MethodTotals {
    const needed = xpNeeded(goal);
    // The small allowance stops a float such as 0.1 XP each rounding up an extra one.
    const count = needed > 0 && method.xp > 0 ? Math.ceil(needed / method.xp - 1e-9) : 0;
    return { count, totalCost: count * method.netCost, usable: method.level <= currentLevel(goal) };
}

/** The methods to list: all of them, or only the usable ones when the player asked for that. */
export function visibleMethods(methods: CalculatorMethod[], goal: SkillGoal): CalculatorMethod[] {
    if (!goal.canUseOnly) return methods;
    const level = currentLevel(goal);
    return methods.filter((method) => method.level <= level);
}

/** The cheapest method the player can use now. The list comes ranked, so it's the first usable one. */
export function cheapestUsable(methods: CalculatorMethod[], goal: SkillGoal): CalculatorMethod | null {
    const level = currentLevel(goal);
    return methods.find((method) => method.level <= level) ?? null;
}
