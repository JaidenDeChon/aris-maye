import { describe, expect, it } from 'bun:test';
import { itemPreferenceRank, pickPreferredItem } from './item-preference';

// Modelled on the real "Acorn" group: four duplicate ids with no GE market, the
// canonical tradeable item, and a bank placeholder.
const acornDuplicate = { id: 5111, duplicate: true, tradeable_on_ge: false };
const acornCanonical = { id: 5312, duplicate: false, tradeable_on_ge: true };
const acornPlaceholder = { id: 13759, duplicate: true, placeholder: true, tradeable_on_ge: false };

describe('pickPreferredItem', () => {
    it('prefers the canonical item over an OSRSBox duplicate', () => {
        expect(pickPreferredItem([acornDuplicate, acornCanonical])?.id).toBe(5312);
    });

    it('prefers the canonical item regardless of input order', () => {
        expect(pickPreferredItem([acornCanonical, acornDuplicate])?.id).toBe(5312);
    });

    it('picks the canonical item out of the full real-world Acorn group', () => {
        const group = [
            acornDuplicate,
            { id: 5112, duplicate: true, tradeable_on_ge: false },
            { id: 5113, duplicate: true, tradeable_on_ge: false },
            { id: 5114, duplicate: true, tradeable_on_ge: false },
            acornCanonical,
            acornPlaceholder,
        ];
        expect(pickPreferredItem(group)?.id).toBe(5312);
    });

    it('never picks a placeholder over a real item', () => {
        expect(pickPreferredItem([acornPlaceholder, acornDuplicate])?.id).toBe(5111);
    });

    it('never picks a noted item over the unnoted one, even when the note is tradeable', () => {
        const noted = { id: 100, noted: true, tradeable_on_ge: true };
        const unnoted = { id: 101, noted: false, tradeable_on_ge: false };
        expect(pickPreferredItem([noted, unnoted])?.id).toBe(101);
    });

    it('prefers a GE-tradeable item when nothing else separates the candidates', () => {
        const untradeable = { id: 200, tradeable_on_ge: false };
        const tradeable = { id: 201, tradeable_on_ge: true };
        expect(pickPreferredItem([untradeable, tradeable])?.id).toBe(201);
    });

    it('breaks remaining ties on the lowest id so the choice is deterministic', () => {
        const a = { id: 900, tradeable_on_ge: true };
        const b = { id: 300, tradeable_on_ge: true };
        expect(pickPreferredItem([a, b])?.id).toBe(300);
        expect(pickPreferredItem([b, a])?.id).toBe(300);
    });

    it('falls back to a duplicate when no canonical document exists', () => {
        const only = [
            { id: 1, duplicate: true },
            { id: 2, duplicate: true },
        ];
        expect(pickPreferredItem(only)?.id).toBe(1);
    });

    it('returns null for an empty list', () => {
        expect(pickPreferredItem([])).toBeNull();
    });

    it('treats missing flags as canonical rather than assuming the worst', () => {
        const bare = { id: 7 };
        const dup = { id: 6, duplicate: true };
        expect(pickPreferredItem([dup, bare])?.id).toBe(7);
    });
});

describe('itemPreferenceRank', () => {
    it('ranks a canonical tradeable item best', () => {
        expect(itemPreferenceRank(acornCanonical)).toBe(0);
    });

    it('ranks a duplicate worse than a merely untradeable canonical item', () => {
        expect(itemPreferenceRank(acornDuplicate)).toBeGreaterThan(
            itemPreferenceRank({ id: 1, duplicate: false, tradeable_on_ge: false }),
        );
    });
});
