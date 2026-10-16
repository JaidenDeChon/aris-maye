import { getPrimaryCreationSpec } from '$lib/helpers/creation-specs';
import { skillLabel } from '$lib/helpers/homepage';
import type { IOsrsboxItemWithMeta } from '$lib/models/osrsbox-db-item';

export function hasRecipe(item: Pick<IOsrsboxItemWithMeta, 'creationSpecs'>): boolean {
    return (item.creationSpecs?.length ?? 0) > 0;
}

function formatXp(amount: number): string {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** The skill, level and XP of an item's main recipe, as shown in its title, description and share image. */
export function recipeFacts(item: IOsrsboxItemWithMeta) {
    const spec = getPrimaryCreationSpec(item);
    const requirement = spec?.requiredSkills?.find(
        (req) => req.skillName && typeof req.skillLevel === 'number' && Number.isFinite(req.skillLevel),
    );
    const xp = spec?.experienceGranted?.find(
        (grant) => grant.skillName && typeof grant.experienceAmount === 'number' && grant.experienceAmount > 0,
    );
    return {
        skill: requirement ? skillLabel(requirement.skillName) : null,
        level: requirement?.skillLevel ?? null,
        xp: xp ? `${formatXp(xp.experienceAmount)} ${skillLabel(xp.skillName)} XP` : null,
    };
}
