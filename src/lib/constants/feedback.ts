/** Shared by the feedback dialog and `/api/feedback`, which can't import from `$lib/server`. */
export const FEEDBACK_KINDS = ['bug', 'change'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_LIMITS = {
    summary: 160,
    details: 4000,
    email: 160,
    page: 500,
} as const;
