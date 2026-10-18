/** The highest level a skill can show. Virtual levels above 99 aren't supported. */
export const MAX_LEVEL = 99;

/** The most XP a skill can hold. */
export const MAX_XP = 200_000_000;

/** XP at the start of each level, from the game's formula. Index 0 is level 1. */
const XP_AT_LEVEL: readonly number[] = (() => {
    const table = [0];
    let points = 0;
    for (let level = 1; level < MAX_LEVEL; level++) {
        points += Math.floor(level + 300 * 2 ** (level / 7));
        table.push(Math.floor(points / 4));
    }
    return table;
})();

/** The XP a level starts at. Levels outside 1–99 are clamped. */
export function xpForLevel(level: number): number {
    const clamped = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
    return XP_AT_LEVEL[clamped - 1];
}

/** The level an XP amount gives, up to 99. */
export function levelForXp(xp: number): number {
    let level = 1;
    while (level < MAX_LEVEL && XP_AT_LEVEL[level] <= xp) level++;
    return level;
}
