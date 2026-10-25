/**
 * Feedback from the sidenav's "Send feedback" dialog, sent as an email through Resend, the same
 * provider as the contact form on jaiden.dev.
 *
 * Kept apart from the route so the checks and the email can be tested without a request.
 */

import { FEEDBACK_KINDS, FEEDBACK_LIMITS, type FeedbackKind } from '$lib/constants/feedback';

export interface FeedbackSubmission {
    kind: FeedbackKind;
    summary: string;
    details: string;
    email: string;
    page: string;
}

export type FeedbackParseResult = { ok: true; feedback: FeedbackSubmission } | { ok: false; message: string };

const KIND_LABELS: Record<FeedbackKind, string> = {
    bug: 'Bug report',
    change: 'Change request',
};

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Checks a submitted body. `_honeypot` is a hidden field only bots fill in. */
export function parseFeedback(body: unknown): FeedbackParseResult {
    const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

    if (text(raw._honeypot)) return { ok: false, message: 'Spam submission rejected.' };

    const kind = text(raw.kind);
    if (!FEEDBACK_KINDS.includes(kind as FeedbackKind)) {
        return { ok: false, message: 'Choose whether this is a bug or a change request.' };
    }

    const feedback: FeedbackSubmission = {
        kind: kind as FeedbackKind,
        summary: text(raw.summary),
        details: text(raw.details),
        email: text(raw.email),
        page: text(raw.page),
    };

    if (!feedback.summary || !feedback.details) {
        return { ok: false, message: 'A summary and details are required.' };
    }
    for (const field of Object.keys(FEEDBACK_LIMITS) as (keyof typeof FEEDBACK_LIMITS)[]) {
        if (feedback[field].length > FEEDBACK_LIMITS[field]) {
            return { ok: false, message: `The ${field} is too long.` };
        }
    }
    if (feedback.email && !isValidEmail(feedback.email)) {
        return { ok: false, message: 'Please give a valid email address, or leave it blank.' };
    }

    return { ok: true, feedback };
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderRow(label: string, value: string): string {
    return `
        <tr>
            <td style="padding: 10px 0; font-weight: 600; vertical-align: top; width: 140px; color: #0f172a;">${escapeHtml(label)}</td>
            <td style="padding: 10px 0; color: #334155;">${value}</td>
        </tr>
    `;
}

export function feedbackSubject(feedback: FeedbackSubmission): string {
    return `[Aris Maye] ${KIND_LABELS[feedback.kind]}: ${feedback.summary}`;
}

export function renderFeedbackEmail(feedback: FeedbackSubmission, userAgent = ''): string {
    const email = feedback.email
        ? `<a href="mailto:${escapeHtml(feedback.email)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(feedback.email)}</a>`
        : 'Not provided';

    return `
        <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a;">
            <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
                <p style="margin: 0 0 8px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b;">Aris Maye</p>
                <h1 style="margin: 0 0 12px; font-size: 24px; line-height: 1.2;">${KIND_LABELS[feedback.kind]}</h1>
                <p style="margin: 0 0 28px; color: #475569;">${escapeHtml(feedback.summary)}</p>

                <table style="width: 100%; border-collapse: collapse; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                    ${renderRow('Type', KIND_LABELS[feedback.kind])}
                    ${renderRow('Page', escapeHtml(feedback.page || 'Not provided'))}
                    ${renderRow('Reply to', email)}
                    ${renderRow('Browser', escapeHtml(userAgent || 'Unknown'))}
                </table>

                <div style="margin-top: 28px;">
                    <h2 style="margin: 0 0 12px; font-size: 16px;">Details</h2>
                    <div style="padding: 16px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; line-height: 1.7;">
                        ${escapeHtml(feedback.details).replaceAll('\n', '<br />')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

export interface ResendConfig {
    apiKey: string;
    to: string;
    from: string;
}

/**
 * The Resend settings from the environment, or null until they're set up:
 * `RESEND_API_KEY`, `FEEDBACK_EMAIL` (where feedback goes) and optionally `FEEDBACK_FROM_EMAIL`
 * (a sender on a domain verified in Resend; Resend's shared test sender until then).
 */
export function resendConfig(env: Record<string, string | undefined>): ResendConfig | null {
    const apiKey = text(env.RESEND_API_KEY);
    const to = text(env.FEEDBACK_EMAIL);
    if (!apiKey || !to) return null;
    return { apiKey, to, from: text(env.FEEDBACK_FROM_EMAIL) || 'Aris Maye <onboarding@resend.dev>' };
}

/** Sends through Resend's REST API, which is all the `resend` package does for one email. */
export async function sendFeedbackEmail(
    config: ResendConfig,
    feedback: FeedbackSubmission,
    userAgent = '',
    fetchFn: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; message: string }> {
    const response = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            to: config.to,
            from: config.from,
            subject: feedbackSubject(feedback),
            html: renderFeedbackEmail(feedback, userAgent),
            ...(feedback.email ? { reply_to: feedback.email } : {}),
        }),
    });

    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: data?.message || 'Unable to send your feedback right now.' };
}

/** Cloudflare's test secret that passes every token, so the dialog works in dev without real keys. */
export const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

/**
 * The Turnstile secret from `TURNSTILE_SECRET_KEY`, or Cloudflare's always-pass test secret in dev.
 * Empty in production until it's set, which keeps the endpoint off rather than unprotected.
 */
export function turnstileSecret(env: Record<string, string | undefined>, isDev: boolean): string {
    return text(env.TURNSTILE_SECRET_KEY) || (isDev ? TURNSTILE_TEST_SECRET_KEY : '');
}

/** Checks the dialog's Turnstile token with Cloudflare. Each token passes once. */
export async function verifyTurnstileToken(
    secret: string,
    token: string,
    remoteIp = '',
    fetchFn: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; errorCodes: string[] }> {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp) form.set('remoteip', remoteIp);

    const response = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { success?: boolean; 'error-codes'?: string[] } | null;

    if (data?.success) return { ok: true };
    return { ok: false, errorCodes: Array.isArray(data?.['error-codes']) ? data['error-codes'] : [] };
}
