import { shouldShowDevControls } from '$lib/helpers/should-show-dev-controls';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url, untrack }) => {
    return {
        showDevControls: shouldShowDevControls(),
        // Read untracked. Touching `url` normally marks this load as depending on it, which makes
        // SvelteKit re-run it — over the network, since it is a server load — before *every*
        // client-side navigation is allowed to commit. The origin is the same for every page of a
        // deployment, so there is nothing to re-read and no reason to make each link click wait on
        // a round trip.
        baseUrl: untrack(() => url.origin),
    };
};
