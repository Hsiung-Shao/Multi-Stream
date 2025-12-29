export interface FeedbackFormData {
    // Part 1: Basic Survey
    source: string;
    usageTime: string[]; // Checkbox (Morning, Afternoon, Evening, LateNight)
    usageDuration: string; // Select
    rating: number; // 1-5

    // Part 2: Core Feedback
    feedbackType: 'bug' | 'feature' | 'ui' | 'other';
    content: string;

    // Part 3: Promotion
    npsScore: number; // 0-10

    // System Info (Auto captured)
    userAgent?: string;
    screenResolution?: string;
    windowSize?: string;
    theme?: string;
    version?: string;
}

export type UsageTimeOption = 'morning' | 'afternoon' | 'evening' | 'lateNight';
export type UsageDurationOption = 'firstTime' | 'oneWeek' | 'oneMonth' | 'halfYear' | 'yearPlus';
export type SourceOption = 'discord' | 'google' | 'friends' | 'bahamut' | 'instagram' | 'threads' | 'other';
export type FeedbackTypeOption = 'bug' | 'feature' | 'ui' | 'other';
