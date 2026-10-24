<script lang="ts">
    import { MessageSquareText } from 'lucide-svelte';
    import { toast } from 'svelte-sonner';
    import { page } from '$app/state';
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Tooltip from '$lib/components/ui/tooltip';
    import * as ToggleGroup from '$lib/components/ui/toggle-group';
    import { Button, buttonVariants } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { FEEDBACK_LIMITS, type FeedbackKind } from '$lib/constants/feedback';

    /**
     * A "Send feedback" button for the bottom of the sidenav. It opens a short form for reporting a
     * bug or asking for a change, which `/api/feedback` emails on. The page it was sent from goes
     * along with it, so a bug report says where the bug is.
     */
    const { expanded }: { expanded: boolean } = $props();

    const buttonClass =
        'text-foreground border border-input rounded-md bg-background/70 hover:bg-muted/55 transition-colors';

    const SUMMARY_PLACEHOLDERS: Record<FeedbackKind, string> = {
        bug: 'e.g. The price chart is blank on Dragon bones',
        change: 'e.g. Let me sort items by profit per hour',
    };
    const DETAILS_PLACEHOLDERS: Record<FeedbackKind, string> = {
        bug: 'What did you do, what did you expect, and what happened instead?',
        change: 'What would you like to see, and what would it help you do?',
    };

    let open = $state(false);
    let kind = $state<FeedbackKind>('bug');
    let summary = $state('');
    let details = $state('');
    let email = $state('');
    let honeypot = $state('');
    let submitting = $state(false);
    let errorMessage = $state('');

    // Clear the form once the dialog has closed, so the next one starts blank.
    $effect(() => {
        if (open) return;
        kind = 'bug';
        summary = '';
        details = '';
        email = '';
        honeypot = '';
        errorMessage = '';
    });

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        if (submitting) return;
        errorMessage = '';
        submitting = true;

        try {
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kind,
                    summary,
                    details,
                    email,
                    page: page.url.pathname + page.url.search,
                    _honeypot: honeypot,
                }),
            });
            const data = (await response.json().catch(() => null)) as { success?: boolean; message?: string } | null;
            if (!response.ok || !data?.success) {
                throw new Error(data?.message || 'Your feedback could not be sent right now.');
            }

            toast.success(kind === 'bug' ? 'Thanks, your bug report is in.' : 'Thanks, your request is in.');
            open = false;
        } catch (error) {
            errorMessage =
                error instanceof Error && error.message
                    ? error.message
                    : 'Your feedback could not be sent right now. Please try again.';
        } finally {
            submitting = false;
        }
    }
</script>

<Dialog.Root bind:open>
    {#if expanded}
        <Dialog.Trigger
            class={buttonVariants({ class: `w-full min-h-10 max-h-10 justify-center gap-2 ${buttonClass}` })}
        >
            <MessageSquareText class="size-4" />
            <span class="text-sm">Send feedback</span>
        </Dialog.Trigger>
    {:else}
        <Tooltip.Provider>
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Dialog.Trigger {...props} class={buttonVariants({ class: `h-9 w-9 p-0 ${buttonClass}` })}>
                            <MessageSquareText class="size-4" />
                            <span class="sr-only">Send feedback</span>
                        </Dialog.Trigger>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">Send feedback</Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    {/if}

    <Dialog.Content class="max-h-[calc(100vh-2rem)] max-w-lg overflow-y-auto">
        <Dialog.Header>
            <Dialog.Title>Send feedback</Dialog.Title>
            <Dialog.Description>Found something broken, or want something changed? Let me know.</Dialog.Description>
        </Dialog.Header>

        <form class="flex flex-col gap-4" onsubmit={submit}>
            <ToggleGroup.Root
                type="single"
                value={kind}
                onValueChange={(value) => {
                    if (value) kind = value as FeedbackKind;
                }}
                class="grid grid-cols-2 rounded-md border bg-muted/30 p-0.5"
                aria-label="Feedback type"
            >
                <ToggleGroup.Item value="bug" class="h-8 text-sm">Report a bug</ToggleGroup.Item>
                <ToggleGroup.Item value="change" class="h-8 text-sm">Request a change</ToggleGroup.Item>
            </ToggleGroup.Root>

            <div class="flex flex-col gap-2">
                <Label for="feedback-summary">Summary *</Label>
                <Input
                    id="feedback-summary"
                    bind:value={summary}
                    placeholder={SUMMARY_PLACEHOLDERS[kind]}
                    maxlength={FEEDBACK_LIMITS.summary}
                    disabled={submitting}
                    required
                />
            </div>

            <div class="flex flex-col gap-2">
                <Label for="feedback-details">Details *</Label>
                <textarea
                    id="feedback-details"
                    bind:value={details}
                    placeholder={DETAILS_PLACEHOLDERS[kind]}
                    maxlength={FEEDBACK_LIMITS.details}
                    disabled={submitting}
                    required
                    class="flex min-h-32 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                ></textarea>
            </div>

            <div class="flex flex-col gap-2">
                <Label for="feedback-email">Email (optional)</Label>
                <Input
                    id="feedback-email"
                    type="email"
                    autocomplete="email"
                    bind:value={email}
                    placeholder="Only if you'd like a reply"
                    maxlength={FEEDBACK_LIMITS.email}
                    disabled={submitting}
                />
            </div>

            <!-- Hidden from people; bots that fill in every field get turned away. -->
            <label class="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                Company
                <input bind:value={honeypot} name="company" autocomplete="off" tabindex="-1" type="text" />
            </label>

            <p class="text-xs text-muted-foreground">The page you're on is sent along with your feedback.</p>

            {#if errorMessage}
                <div
                    class="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive dark:text-red-400"
                    role="alert"
                >
                    {errorMessage}
                </div>
            {/if}

            <Dialog.Footer>
                <Button type="submit" class="min-w-32" disabled={submitting}>
                    {submitting ? 'Sending...' : 'Send feedback'}
                </Button>
            </Dialog.Footer>
        </form>
    </Dialog.Content>
</Dialog.Root>
