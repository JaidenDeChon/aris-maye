import { canonicalSkill } from '$lib/constants/skill-aliases';
import type { HomepageAlmostUnlocked, HomepageItem } from '$lib/models/homepage';

/**
 * A gp amount short enough for a tile: 950, 12.4k, 3.2M, 1.1B.
 * @param signed - Prefix a plus sign on positive amounts, for profits.
 */
export function formatGpShort(value: number | null | undefined, signed = false): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
    const abs = Math.abs(value);
    const units: [number, string][] = [
        [1_000_000_000, 'B'],
        [1_000_000, 'M'],
        [1_000, 'k'],
    ];
    for (const [size, suffix] of units) {
        if (abs >= size) {
            const scaled = abs / size;
            // One decimal below 100 (12.4k), none above (124k), and never a trailing ".0".
            const text = scaled < 100 ? scaled.toFixed(1).replace(/\.0$/, '') : Math.round(scaled).toString();
            return `${sign}${text}${suffix}`;
        }
    }
    return `${sign}${Math.round(abs).toLocaleString('en-US')}`;
}

/** A ratio such as 0.384 as "38%", or "1,240%" for the odd outlier. */
export function formatRoi(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const percent = value * 100;
    const rounded = Math.abs(percent) < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
    return `${rounded.toLocaleString('en-US')}%`;
}

/** gp per XP, to one decimal under 10 so cheap methods don't all read "1". */
export function formatGpPerXp(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const text = value < 10 ? (Math.round(value * 10) / 10).toString() : Math.round(value).toLocaleString('en-US');
    return `${text} gp/xp`;
}

/** A skill key such as "runecrafting" as a heading: "Runecrafting". */
export function skillLabel(skill: string): string {
    const name = canonicalSkill(skill);
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The skill's icon in `static/skill-images`. */
export function skillIcon(skill: string): string {
    return `/skill-images/${canonicalSkill(skill)}.png`;
}

export type SkillToTrain = {
    skill: string;
    /** Levels to go for the best item it unlocks. */
    levelsAway: number;
    /** The level that unlocks it. */
    targetLevel: number;
    best: HomepageItem;
    /** How many profitable items training this skill alone would unlock. */
    unlockCount: number;
};

/**
 * The one skill whose next few levels unlock the most profitable new item.
 *
 * Only items held back by a single skill count, so the answer is something the player can act
 * on by training that skill alone. Ties go to the skill that unlocks more items.
 * @param almostUnlocked - Items the player is a few levels short of, best profit first.
 */
export function pickSkillToTrain(almostUnlocked: HomepageAlmostUnlocked[]): SkillToTrain | null {
    const bySkill = new Map<string, SkillToTrain>();

    for (const entry of almostUnlocked) {
        if (entry.shortfalls.length !== 1) continue;
        const [shortfall] = entry.shortfalls;
        const profit = entry.item.creationProfit ?? 0;
        if (profit <= 0) continue;

        const existing = bySkill.get(shortfall.skill);
        if (!existing) {
            bySkill.set(shortfall.skill, {
                skill: shortfall.skill,
                levelsAway: shortfall.need - shortfall.have,
                targetLevel: shortfall.need,
                best: entry.item,
                unlockCount: 1,
            });
            continue;
        }

        existing.unlockCount += 1;
        if (profit > (existing.best.creationProfit ?? 0)) {
            existing.best = entry.item;
            existing.levelsAway = shortfall.need - shortfall.have;
            existing.targetLevel = shortfall.need;
        }
    }

    let pick: SkillToTrain | null = null;
    for (const candidate of bySkill.values()) {
        if (!pick) {
            pick = candidate;
            continue;
        }
        const profit = candidate.best.creationProfit ?? 0;
        const pickProfit = pick.best.creationProfit ?? 0;
        if (profit > pickProfit || (profit === pickProfit && candidate.unlockCount > pick.unlockCount)) {
            pick = candidate;
        }
    }
    return pick;
}

/** A price change ratio such as 0.052 as "+5.2%". */
export function formatChange(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const percent = value * 100;
    const rounded =
        Math.abs(percent) < 10 ? (Math.round(percent * 10) / 10).toFixed(1) : Math.round(percent).toString();
    return `${percent > 0 ? '+' : ''}${rounded}%`;
}
