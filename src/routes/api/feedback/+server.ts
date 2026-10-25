import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';
import {
    parseFeedback,
    resendConfig,
    sendFeedbackEmail,
    turnstileSecret,
    verifyTurnstileToken,
} from '$lib/server/feedback';

/** Takes a bug report or change request from the sidenav's feedback dialog and emails it on. */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
    const body = await request.json().catch(() => null);
    const parsed = parseFeedback(body);
    if (!parsed.ok) return json({ success: false, message: parsed.message }, { status: 400 });

    const config = resendConfig(env);
    const secret = turnstileSecret(env, dev);
    if (!config || !secret) {
        return json({ success: false, message: 'Feedback isn’t set up on the server yet.' }, { status: 503 });
    }

    // The Turnstile check in the dialog, so a script can't post here directly.
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) return json({ success: false, message: 'The verification check is missing.' }, { status: 400 });
    const verified = await verifyTurnstileToken(secret, token, getClientAddress());
    if (!verified.ok) {
        return json(
            {
                success: false,
                message: 'The verification check failed. Please try again.',
                details: verified.errorCodes,
            },
            { status: 400 },
        );
    }

    const result = await sendFeedbackEmail(config, parsed.feedback, request.headers.get('user-agent') ?? '');
    if (!result.ok) return json({ success: false, message: result.message }, { status: 502 });

    return json({ success: true });
};
