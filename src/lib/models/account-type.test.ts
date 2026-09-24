import { describe, expect, it } from 'bun:test';
import {
    accountTypeOptions,
    canUseGrandExchange,
    getAccountTypeOption,
    isIronmanAccount,
    normalizeAccountType,
} from './account-type';
import { CharacterProfile } from './player-stats';

describe('normalizeAccountType', () => {
    it('keeps every recognised account type', () => {
        for (const option of accountTypeOptions) {
            expect(normalizeAccountType(option.value)).toBe(option.value);
        }
    });

    // Profiles saved before this field existed deserialize without it. They must read as mains so
    // that adding the field does not silently change what an existing character is shown.
    it('treats a profile with no account type as a main', () => {
        expect(normalizeAccountType(undefined)).toBe('main');
        expect(normalizeAccountType(null)).toBe('main');
    });

    it('rejects values that are not account types', () => {
        expect(normalizeAccountType('IRONMAN')).toBe('main');
        expect(normalizeAccountType('deadman')).toBe('main');
        expect(normalizeAccountType(3)).toBe('main');
        expect(normalizeAccountType({})).toBe('main');
    });
});

describe('canUseGrandExchange', () => {
    it('is true only for a main', () => {
        expect(canUseGrandExchange('main')).toBe(true);
    });

    // Pricing branches on this one boolean so the Ironman variants cannot drift apart: they differ
    // in bank and trading rules, not in which prices apply to them.
    it('is false for every Ironman variant', () => {
        for (const accountType of ['ironman', 'hardcore', 'ultimate', 'group'] as const) {
            expect(canUseGrandExchange(accountType)).toBe(false);
            expect(isIronmanAccount(accountType)).toBe(true);
        }
    });

    it('falls back to Grand Exchange pricing when no character is selected', () => {
        expect(canUseGrandExchange(undefined)).toBe(true);
        expect(isIronmanAccount(undefined)).toBe(false);
    });
});

describe('getAccountTypeOption', () => {
    it('describes each account type', () => {
        expect(getAccountTypeOption('hardcore').label).toBe('Hardcore Ironman');
        expect(getAccountTypeOption('hardcore').shortLabel).toBe('HCIM');
        expect(getAccountTypeOption('main').description).toBe('Prices come from the Grand Exchange.');
    });

    it('falls back to the default for an unknown value', () => {
        expect(getAccountTypeOption(undefined).value).toBe('main');
    });

    it('gives every Ironman variant the same pricing sentence', () => {
        const pricingSentence = getAccountTypeOption('ironman').description;
        expect(pricingSentence).toStartWith('No economy prices.');
        for (const accountType of ['hardcore', 'ultimate', 'group'] as const) {
            expect(getAccountTypeOption(accountType).description).toStartWith(pricingSentence);
        }
    });
});

describe('CharacterProfile', () => {
    it('defaults a new character to main', () => {
        expect(new CharacterProfile('Zezima').accountType).toBe('main');
    });

    it('keeps an account type it is given', () => {
        expect(new CharacterProfile('Zezima', undefined, undefined, 'ultimate').accountType).toBe('ultimate');
    });

    // The constructor is the rehydration path for persisted profiles, so a junk value stored by an
    // older build must not propagate into pricing decisions.
    it('normalizes an unrecognised stored account type', () => {
        expect(new CharacterProfile('Zezima', undefined, undefined, 'deadman' as never).accountType).toBe('main');
    });
});
