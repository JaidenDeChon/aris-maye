import { SkillNames } from '$lib/constants/enums/skill-names';
import { CharacterProfile } from '$lib/models/player-stats';
import { browser } from '$app/environment';

/**
 * Safe environment detection for both browser and SSR/Netlify.
 * @returns 'production' or 'development' based on the current runtime.
 */
function getRuntimeMode(): 'production' | 'development' {
    // Prefer Vite's value when available (browser & SSR)
    const viaImportMeta = (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.MODE) as
        | string
        | undefined;
    if (viaImportMeta === 'production' || viaImportMeta === 'development') return viaImportMeta;

    // Fallback for Node/Netlify SSR without touching `process` directly in the browser
    const nodeEnv = (globalThis as typeof globalThis)?.process?.env?.NODE_ENV as string | undefined;
    if (nodeEnv === 'production') return 'production';
    return 'development';
}

const envName = getRuntimeMode();

export async function fetchCharacterDetailsFromWOM(characterName: string): Promise<CharacterProfile> {
    if (!browser) {
        // Prevent SSR from trying to import/evaluate the WOM client in the server bundle
        throw new Error('fetchCharacterDetailsFromWOM can only run in the browser.');
    }

    const endpoint = `https://api.wiseoldman.net/v2/players/${encodeURIComponent(characterName)}`;

    const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Client':
                `This API call came from a ${envName} instance of aris-maye (https://aris-maye.netlify.app). ` +
                'Please contact Jaiden with any issues at `jaiden.dechon@proton.me` -- Thank you for your API!',
        },
    });

    if (!res.ok) {
        throw new Error(`Wise Old Man request failed with ${res.status} ${res.statusText}`);
    }

    const result = await res.json();
    console.log(result);

    if (!result.id) throw new Error('Could not find character on Wise Old Man.');

    return new CharacterProfile(characterName, {
        [SkillNames.AGILITY]: result.latestSnapshot?.data.skills.agility.level ?? 0,
        [SkillNames.ATTACK]: result.latestSnapshot?.data.skills.attack.level ?? 0,
        [SkillNames.CONSTRUCTION]: result.latestSnapshot?.data.skills.construction.level ?? 0,
        [SkillNames.COOKING]: result.latestSnapshot?.data.skills.cooking.level ?? 0,
        [SkillNames.CRAFTING]: result.latestSnapshot?.data.skills.crafting.level ?? 0,
        [SkillNames.DEFENCE]: result.latestSnapshot?.data.skills.defence.level ?? 0,
        [SkillNames.FARMING]: result.latestSnapshot?.data.skills.farming.level ?? 0,
        [SkillNames.FIREMAKING]: result.latestSnapshot?.data.skills.firemaking.level ?? 0,
        [SkillNames.FISHING]: result.latestSnapshot?.data.skills.fishing.level ?? 0,
        [SkillNames.FLETCHING]: result.latestSnapshot?.data.skills.fletching.level ?? 0,
        [SkillNames.HERBLORE]: result.latestSnapshot?.data.skills.herblore.level ?? 0,
        [SkillNames.HITPOINTS]: result.latestSnapshot?.data.skills.hitpoints.level ?? 0,
        [SkillNames.HUNTER]: result.latestSnapshot?.data.skills.hunter.level ?? 0,
        [SkillNames.MAGIC]: result.latestSnapshot?.data.skills.magic.level ?? 0,
        [SkillNames.MINING]: result.latestSnapshot?.data.skills.mining.level ?? 0,
        [SkillNames.PRAYER]: result.latestSnapshot?.data.skills.prayer.level ?? 0,
        [SkillNames.RANGED]: result.latestSnapshot?.data.skills.ranged.level ?? 0,
        [SkillNames.RUNECRAFTING]: result.latestSnapshot?.data.skills.runecrafting.level ?? 0,
        [SkillNames.SLAYER]: result.latestSnapshot?.data.skills.slayer.level ?? 0,
        [SkillNames.SMITHING]: result.latestSnapshot?.data.skills.smithing.level ?? 0,
        [SkillNames.STRENGTH]: result.latestSnapshot?.data.skills.strength.level ?? 0,
        [SkillNames.THIEVING]: result.latestSnapshot?.data.skills.thieving.level ?? 0,
        [SkillNames.WOODCUTTING]: result.latestSnapshot?.data.skills.woodcutting.level ?? 0,
    });
}
