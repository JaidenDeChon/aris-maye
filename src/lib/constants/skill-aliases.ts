/**
 * Skill names the wiki uses that differ from the app's own.
 *
 * The wiki's skill tags say "Runecraft", while the app's skill list, icons and character levels all
 * say "runecrafting". Without this, Runecraft recipes have no icon and never match a player's level.
 */
const SKILL_ALIASES: Record<string, string> = {
    runecraft: 'runecrafting',
};

/** A skill name as the app spells it: lowercase, with wiki spellings translated. */
export function canonicalSkill(name: string | null | undefined): string {
    const key = (name ?? '').trim().toLowerCase();
    return SKILL_ALIASES[key] ?? key;
}

/** Every spelling a skill can appear under in recipe data, the app's own first. */
export function skillSpellings(skill: string): string[] {
    const canonical = canonicalSkill(skill);
    return [
        canonical,
        ...Object.entries(SKILL_ALIASES)
            .filter(([, target]) => target === canonical)
            .map(([alias]) => alias),
    ];
}
