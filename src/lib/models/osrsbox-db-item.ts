import type { Types } from 'mongoose';

/**
 * Represents the amount of experience in a given skill awarded for creating an item.
 * @property skillName - The name of the skill in which experience is awarded.
 * @property experienceAmount - The amount of experience awarded.
 */
export type GameItemCreationExperienceGranted = {
    skillName: string;
    experienceAmount: number;
};

/**
 * Represents a skill level requirement for creating an item.
 * @property skillName - The name of the required skill.
 * @property skillLevel - The level of the required skill.
 */
export type SkillLevelDesignation = {
    skillName: string;
    skillLevel: number;
};

/**
 * Represents an item required as an ingredient for creating another item.
 * @property consumedDuringCreation - Indicates whether this ingredient is consumed/loss upon use.
 * @property amount - The amount of this ingredient that is required.
 * @property item - The full item object representing this item.
 */
export type GameItemCreationIngredient = {
    consumedDuringCreation: boolean;
    amount: number;
    item: IOsrsboxItem | IOsrsboxItemWithMeta | Types.ObjectId;
};

/**
 * Represents the character requirements for creating a given item.
 * @property experienceGranted - The amount of experience granted and in which skills.
 * @property requiredSkills - The names and levels of the skills required to create the item.
 * @property ingredients - The list of items required to create this item.
 */
export type GameItemCreationSpecs = {
    experienceGranted: GameItemCreationExperienceGranted[];
    requiredSkills: SkillLevelDesignation[];
    ingredients: GameItemCreationIngredient[];
    treeMinSkills?: Record<string, number> | null;
};

/**
 * Raw OSRS item record sourced from the OSRSBox database dump.
 * All properties are required; fields marked nullable may legitimately contain null when data is missing.
 * @property id - Unique OSRS item ID number. Required; not nullable.
 * @property name - The name of the item. Required; not nullable.
 * @property last_updated - The last time (UTC) the item was updated in ISO8601 format. Required; not nullable.
 * @property incomplete - Indicates if the item has incomplete wiki data. Required; not nullable.
 * @property members - Whether the item is members-only. Required; not nullable.
 * @property tradeable - Whether the item is tradeable between players and on the GE. Required; not nullable.
 * @property tradeable_on_ge - Whether the item is tradeable only on the GE. Required; not nullable.
 * @property stackable - Whether the item is stackable in inventory. Required; not nullable.
 * @property stacked - Stack count when stacked. Required; nullable.
 * @property noted - Whether the item is noted. Required; not nullable.
 * @property noteable - Whether the item is noteable. Required; not nullable.
 * @property linked_id_item - Linked ID of the actual item when noted/placeholder. Required; nullable.
 * @property linked_id_noted - Linked ID of the item in noted form. Required; nullable.
 * @property linked_id_placeholder - Linked ID of the item in placeholder form. Required; nullable.
 * @property placeholder - Whether the item is a placeholder. Required; not nullable.
 * @property equipable - Whether the item is equipable (based on right-click menu). Required; not nullable.
 * @property equipable_by_player - Whether the item is equipable in-game by a player. Required; not nullable.
 * @property equipable_weapon - Whether the item is an equipable weapon. Required; not nullable.
 * @property cost - Store price of the item. Required; not nullable.
 * @property lowalch - Low alchemy value (cost * 0.4). Required; nullable.
 * @property highalch - High alchemy value (cost * 0.6). Required; nullable.
 * @property weight - Weight in kilograms. Required; nullable.
 * @property buy_limit - Grand Exchange buy limit. Required; nullable.
 * @property quest_item - Whether the item is associated with a quest. Required; not nullable.
 * @property release_date - Date released in ISO8601 format. Required; nullable.
 * @property duplicate - Whether the item is a duplicate entry. Required; not nullable.
 * @property examine - Examine text for the item. Required; nullable.
 * @property icon - Item icon encoded as base64. Required; not nullable.
 * @property wiki_name - OSRS Wiki display name. Required; nullable.
 * @property wiki_url - OSRS Wiki URL (may include anchor link). Required; nullable.
 * @property wiki_page_title - Real, fetchable wiki page title derived from `wiki_url`. Nullable.
 * @property wiki_version - Infobox version label the item corresponds to, e.g. "Watered". Nullable.
 * @property storePrices - What shops pay for this item and how that falls as more are sold.
 * @property equipment - Equipment bonuses of equipable armour/weapons. Required; nullable.
 * @property weapon - Weapon bonuses including attack speed, type and stance. Required; nullable.
 */
/**
 * What one shop pays for an item, and how that falls as you sell it more of them.
 *
 * Shops price from the item's base `cost`, not its Grand Exchange price. `firstPrice` is
 * what the shop pays for one at its default stock; each further sale drops the price by
 * `dropPerSale` until it reaches `floorPrice`, which the wiki fixes at 10% of the item's
 * value for every shop. Selling a 200gp steel axe to Bob's Brilliant Axes yields 120, then
 * 116, then 112, bottoming out at 20.
 *
 * @property shop - Wiki page title of the shop.
 * @property firstPrice - gp for the first sale, at the shop's default stock.
 * @property floorPrice - gp once the shop is overstocked to its 10% minimum.
 * @property dropPerSale - gp lost per further sale, before the floor.
 * @property salesToFloor - Sales needed to reach the floor; null when the price never drops.
 * @property buyPrice - gp the shop charges to buy one, when it stocks any.
 * @property stock - The shop's default stock of this item.
 * @property currency - What the shop trades in when it is not coins.
 */
export type GameItemStorePrice = {
    shop: string;
    firstPrice: number;
    floorPrice: number;
    dropPerSale: number;
    salesToFloor: number | null;
    buyPrice: number | null;
    stock: number | null;
    currency: string | null;
};

export interface IOsrsboxItem {
    id: number;
    name: string;
    last_updated: string;
    incomplete: boolean;
    members: boolean;
    tradeable: boolean;
    tradeable_on_ge: boolean;
    stackable: boolean;
    stacked: number | null;
    noted: boolean;
    noteable: boolean;
    linked_id_item: number | null;
    linked_id_noted: number | null;
    linked_id_placeholder: number | null;
    placeholder: boolean;
    equipable: boolean;
    equipable_by_player: boolean;
    equipable_weapon: boolean;
    cost: number;
    lowalch: number | null;
    highalch: number | null;
    weight: number | null;
    buy_limit: number | null;
    quest_item: boolean;
    release_date: string | null;
    duplicate: boolean;
    examine: string | null;
    icon: string;
    wiki_name: string | null;
    wiki_url: string | null;
    wiki_page_title?: string | null;
    wiki_version?: string | null;
    storePrices?: GameItemStorePrice[];
    equipment: Record<string, unknown> | null;
    weapon: Record<string, unknown> | null;
    creationSpecs?: GameItemCreationSpecs[];
}

/**
 * Frontend-friendly shape for Osrsbox items that may include app-specific metadata.
 * Requires only the basic identifiers while allowing the rest of the fields to be optionally present.
 */
export type IOsrsboxItemWithMeta = Pick<IOsrsboxItem, 'id' | 'name' | 'icon' | 'examine'> &
    Partial<IOsrsboxItem> & {
        creationSpecs?: GameItemCreationSpecs[];
        highPrice?: number | null;
        highTime?: number | null;
        lowPrice?: number | null;
        lowTime?: number | null;
        buyLimit?: number | null;
        wikiName?: string | null;
    };

export type RawOsrsboxItem = IOsrsboxItem;
