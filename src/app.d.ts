// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        // interface PageData {}
        interface PageState {
            /** Page number of a paginated item list, recorded so back/forward can restore it. */
            itemsPage?: number;
        }
        // interface Platform {}
    }
}

export {};
