import { describe, expect, test } from 'bun:test';
import {
    TURNSTILE_TEST_SECRET_KEY,
    parseFeedback,
    renderFeedbackEmail,
    resendConfig,
    sendFeedbackEmail,
    turnstileSecret,
    verifyTurnstileToken,
} from './feedback';

const valid = { kind: 'bug', summary: 'Chart is blank', details: 'On Dragon bones', email: '', page: '/items/536' };

describe('parseFeedback', () => {
    test('accepts a bug report and a change request, trimmed', () => {
        const bug = parseFeedback({ ...valid, summary: '  Chart is blank  ' });
        expect(bug).toEqual({ ok: true, feedback: { ...valid, kind: 'bug' } });
        expect(parseFeedback({ ...valid, kind: 'change' }).ok).toBe(true);
    });

    test('rejects an unknown kind, missing fields, bad email and the honeypot', () => {
        expect(parseFeedback({ ...valid, kind: 'praise' }).ok).toBe(false);
        expect(parseFeedback({ ...valid, details: '   ' }).ok).toBe(false);
        expect(parseFeedback({ ...valid, email: 'not-an-email' }).ok).toBe(false);
        expect(parseFeedback({ ...valid, _honeypot: 'Acme' }).ok).toBe(false);
        expect(parseFeedback(null).ok).toBe(false);
    });

    test('rejects over-long fields', () => {
        expect(parseFeedback({ ...valid, summary: 'x'.repeat(161) }).ok).toBe(false);
    });
});

test('the email escapes what the user typed', () => {
    const html = renderFeedbackEmail({ ...valid, kind: 'bug', details: '<script>x</script>\nline 2' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;<br />line 2');
});

test('resendConfig waits for both the key and the destination', () => {
    expect(resendConfig({ RESEND_API_KEY: 'k' })).toBeNull();
    expect(resendConfig({ RESEND_API_KEY: 'k', FEEDBACK_EMAIL: 'me@example.com' })).toEqual({
        apiKey: 'k',
        to: 'me@example.com',
        from: 'Aris Maye <onboarding@resend.dev>',
    });
});

test('sendFeedbackEmail posts to Resend with a reply-to when given an email', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
        sent = { url, init };
        return new Response('{"id":"1"}', { status: 200 });
    }) as unknown as typeof fetch;

    const config = { apiKey: 'k', to: 'me@example.com', from: 'f@example.com' };
    const result = await sendFeedbackEmail(config, { ...valid, kind: 'change', email: 'p@example.com' }, '', fakeFetch);

    expect(result).toEqual({ ok: true });
    expect(sent!.url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(sent!.init.body as string);
    expect(body.reply_to).toBe('p@example.com');
    expect(body.subject).toBe('[Aris Maye] Change request: Chart is blank');
});

test('turnstileSecret uses the test secret only in dev', () => {
    expect(turnstileSecret({}, true)).toBe(TURNSTILE_TEST_SECRET_KEY);
    expect(turnstileSecret({}, false)).toBe('');
    expect(turnstileSecret({ TURNSTILE_SECRET_KEY: ' s ' }, false)).toBe('s');
});

describe('verifyTurnstileToken', () => {
    test('sends the secret, token and IP to Cloudflare', async () => {
        let sent: { url: string; init: RequestInit } | null = null;
        const fakeFetch = (async (url: string, init: RequestInit) => {
            sent = { url, init };
            return new Response('{"success":true}', { status: 200 });
        }) as unknown as typeof fetch;

        expect(await verifyTurnstileToken('s', 't', '1.2.3.4', fakeFetch)).toEqual({ ok: true });
        expect(sent!.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
        const form = sent!.init.body as URLSearchParams;
        expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual(['s', 't', '1.2.3.4']);
    });

    test('fails with Cloudflare’s error codes, and when Cloudflare can’t be reached', async () => {
        const rejected = (async () =>
            new Response('{"success":false,"error-codes":["timeout-or-duplicate"]}')) as unknown as typeof fetch;
        expect(await verifyTurnstileToken('s', 't', '', rejected)).toEqual({
            ok: false,
            errorCodes: ['timeout-or-duplicate'],
        });

        const offline = (async () => {
            throw new Error('offline');
        }) as unknown as typeof fetch;
        expect(await verifyTurnstileToken('s', 't', '', offline)).toEqual({ ok: false, errorCodes: [] });
    });
});
