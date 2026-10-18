import { findXpGuideSkill } from '$lib/constants/guides';

/** The skills with a cheapest-XP guide page, in any casing. */
export function match(param: string): boolean {
    return findXpGuideSkill(param) !== undefined;
}
