import type { IOsrsboxItem } from './osrsbox-db-item';

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
    item: IGameItem;
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
 * Represents an in-game item with creation specs and GE price data attached.
 * @property creationSpecs  - The character requirements for creating this item.
 * @property highPrice      - The most recent high price at which the item was sold.
 * @property highTime       - The time at which the item sold at the most recent high price.
 * @property lowPrice       - The most recent low price at which the item was sold.
 * @property lowTime        - The time at which the item sold at the most recent low price.
 */
export type IGameItem = {
    id: IOsrsboxItem['id'];
    name: IOsrsboxItem['name'];
    icon: IOsrsboxItem['icon'];
    examine: IOsrsboxItem['examine'];
} & Partial<IOsrsboxItem> & {
        creationSpecs?: GameItemCreationSpecs;
        highPrice?: number;
        highTime?: number;
        lowPrice?: number;
        lowTime?: number;
        buyLimit?: number;
        wikiName?: string | null;
        creationCost?: number | null;
        creationProfit?: number | null;
        creationRoi?: number | null;
        ironmanExitValue?: number | null;
    };

/**
 * Pairs multiple GameItems together under a single category represented by a string.
 * @property categoryName - The name of the category of these GameItems.
 * @property items - The list of GameItems for this category.
 */
export type GameItemsByCategory = {
    categoryName: string;
    items: IGameItem[];
};

/**
 * Pairs multiple `GameItemsByCategory` objects together under a single skill.
 * @property skillName - The name of the skill to which these categories are relevant.
 * @property categories - The list of categories under this skill.
 */
export type GameItemsBySkill = {
    skillName: string;
    categories: GameItemsByCategory[];
};
