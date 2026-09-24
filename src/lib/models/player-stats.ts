import { v4 as uuidv4 } from 'uuid';
import { SkillNames } from '$lib/constants/enums/skill-names';
import { defaultSkillLevels } from '$lib/constants/default-skill-levels';
import { DEFAULT_ACCOUNT_TYPE, normalizeAccountType, type AccountType } from '$lib/models/account-type';
import type { UUID } from 'crypto';

/**
 * The shape of the stat data kept on a player character.
 * @property id           - The randomly-generated ID of the character for referencing in localStorage.
 * @property name         - The name of the character.
 * @property accountType  - Which game mode the character plays, which decides how prices are shown.
 * @property skillLevels  - Record relating skill levels to their respective level numbers.
 */
export interface ICharacterProfile {
    id: UUID;
    name: string;
    accountType: AccountType;
    skillLevels: Record<SkillNames, number>;
}

export class CharacterProfile implements ICharacterProfile {
    id: ICharacterProfile['id'];
    name: ICharacterProfile['name'];
    accountType: ICharacterProfile['accountType'];
    skillLevels: ICharacterProfile['skillLevels'];

    constructor(
        name: ICharacterProfile['name'],
        skillLevels: ICharacterProfile['skillLevels'] = defaultSkillLevels,
        id?: ICharacterProfile['id'],
        accountType: ICharacterProfile['accountType'] = DEFAULT_ACCOUNT_TYPE,
    ) {
        this.id = id || (uuidv4() as UUID);
        this.name = name;
        // Profiles persisted before this field existed deserialize with it missing, so normalize
        // rather than trusting the argument: an absent account type must read as a main.
        this.accountType = normalizeAccountType(accountType);
        this.skillLevels = { ...defaultSkillLevels, ...skillLevels };
    }
}
