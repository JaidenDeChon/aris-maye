import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';
import { parseFeedback, resendConfig, sendFeedbackEmail } from '$lib/server/feedback';

/** Takes a bug report or change request from the sidenav's feedback dialog and emails it on. */
export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json().catch(() => null);
    const parsed = parseFeedback(body);
    if (!parsed.ok) return json({ success: false, message: parsed.message }, { status: 400 });

    const config = resendConfig(env);
    if (!config) {
        return json({ success: false, message: 'Feedback isn’t set up on the server yet.' }, { status: 503 });
    }

    const result = await sendFeedbackEmail(config, parsed.feedback, request.headers.get('user-agent') ?? '');
    if (!result.ok) return json({ success: false, message: result.message }, { status: 502 });

    return json({ success: true });
};
