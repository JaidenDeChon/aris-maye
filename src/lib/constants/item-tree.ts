export const MAX_ITEM_TREE_DEPTH = 12;

/**
 * Ceiling on how many ingredient nodes one item tree may materialize.
 *
 * Depth alone does not bound the tree. Recolour recipes reference each other —
 * `Black cape` is made from `Blue cape`, which is made from `Black cape` under a second
 * OSRSBox document id — and the permutations of that web run to hundreds of thousands of
 * nodes long before twelve levels are up. 51 items exceeded 100,000 nodes with only a
 * repeated-ancestor guard in place, which is both a payload no browser wants and, past
 * roughly 6MB, a response the serverless runtime refuses outright.
 *
 * Ingredients past the budget keep their raw id reference instead of being materialized.
 * The tree chart already fetches those on demand, and the cost table reports the total as
 * unknown rather than quietly leaving them out of the sum.
 */
export const MAX_ITEM_TREE_NODES = 1000;
