/**
 * What the calculator pages show. See `docs/superpowers/specs/2026-10-17-calculators-design.md`.
 */

/** One way to get XP in a skill by making something, slimmed down for a list of every method. */
export type CalculatorMethod = {
    id: number;
    name: string;
    /** The level the skill needs, or 1 when the recipe lists none. */
    level: number;
    /** XP for making one. */
    xp: number;
    /** What making one costs after selling it. Negative when it pays. */
    netCost: number;
    /** What each XP costs. Zero when making it turns a profit. */
    gpPerXp: number;
};

export type CalculatorSnapshot = {
    computedAt: number;
    /** Every method for each calculator skill, cheapest XP first. Keyed by skill slug. */
    skills: Record<string, CalculatorMethod[]>;
};
