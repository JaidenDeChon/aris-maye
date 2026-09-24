/**
 * Which game mode a character plays, and therefore which prices the app may show them.
 *
 * Ironman accounts cannot use the Grand Exchange, so every gp figure derived from GE prices is
 * wrong for them on both sides of a recipe: they cannot buy the inputs and cannot sell the output.
 * The mode lives on the character rather than on a page's preferences so that pricing follows the
 * active character instead of disagreeing with itself between the browse page and an item page.
 */
export type AccountType = 'main' | 'ironman' | 'hardcore' | 'ultimate' | 'group';

/** The default for a character that predates this field, so saved profiles keep today's behaviour. */
export const DEFAULT_ACCOUNT_TYPE: AccountType = 'main';

const ACCOUNT_TYPES: readonly AccountType[] = ['main', 'ironman', 'hardcore', 'ultimate', 'group'];

/**
 * How an account type is described where it is chosen.
 * @property value       - The stored discriminator.
 * @property label       - The account type's in-game name.
 * @property shortLabel  - Compact form for the character-switcher badge.
 * @property description - What picking it changes about the prices shown.
 */
export type AccountTypeOption = {
    value: AccountType;
    label: string;
    shortLabel: string;
    description: string;
};

const IRONMAN_PRICING_COPY =
    'No economy prices. Prices are shown using alchemy and base shop values (e.g. before the shop ' +
    'value of an item drops from selling multiple).';

export const accountTypeOptions: readonly AccountTypeOption[] = [
    {
        value: 'main',
        label: 'Main',
        shortLabel: 'Main',
        description: 'Prices come from the Grand Exchange.',
    },
    {
        value: 'ironman',
        label: 'Ironman',
        shortLabel: 'Ironman',
        description: IRONMAN_PRICING_COPY,
    },
    {
        value: 'hardcore',
        label: 'Hardcore Ironman',
        shortLabel: 'HCIM',
        description: IRONMAN_PRICING_COPY,
    },
    {
        value: 'ultimate',
        label: 'Ultimate Ironman',
        shortLabel: 'UIM',
        description: `${IRONMAN_PRICING_COPY} No bank.`,
    },
    {
        value: 'group',
        label: 'Group Ironman',
        shortLabel: 'GIM',
        description: `${IRONMAN_PRICING_COPY} Trading is limited to your group.`,
    },
];

/**
 * Coerces an unknown stored value into a usable account type.
 *
 * Profiles saved before this field existed have no value at all, so anything unrecognised becomes
 * `main` and those characters see exactly what they saw before.
 * @param value - The value read from a persisted profile.
 * @returns A valid account type.
 */
export function normalizeAccountType(value?: unknown): AccountType {
    return ACCOUNT_TYPES.includes(value as AccountType) ? (value as AccountType) : DEFAULT_ACCOUNT_TYPE;
}

/**
 * Whether an account may trade on the Grand Exchange, and so whether GE prices mean anything to it.
 *
 * Every pricing decision branches on this rather than on the account type itself, so the four
 * Ironman variants cannot drift apart. They differ in bank and trading rules, not in pricing.
 * @param accountType - The character's account type, or nothing when no character is selected.
 * @returns True for mains and for a missing character; false for every Ironman variant.
 */
export function canUseGrandExchange(accountType?: AccountType | null): boolean {
    return normalizeAccountType(accountType) === 'main';
}

/**
 * Whether an account should be shown Ironman pricing. The inverse of {@link canUseGrandExchange}.
 * @param accountType - The character's account type, or nothing when no character is selected.
 * @returns True for every Ironman variant.
 */
export function isIronmanAccount(accountType?: AccountType | null): boolean {
    return !canUseGrandExchange(accountType);
}

/**
 * Looks up how an account type is presented.
 * @param accountType - The character's account type.
 * @returns The matching option, falling back to the default account type's.
 */
export function getAccountTypeOption(accountType?: AccountType | null): AccountTypeOption {
    const normalized = normalizeAccountType(accountType);
    return accountTypeOptions.find((option) => option.value === normalized) ?? accountTypeOptions[0];
}
