/**
 * 公告系統前端共用 type(對齊 functions/api/announcements/active.js 回應 schema)
 */

export type AnnouncementType = 'announcement' | 'poll' | 'survey';
export type AnnouncementSegment = 'all' | 'authenticated';

export interface PollOption {
    id: string;
    label: string;
    /** survey single/multi 專用:「其他」選項,選中時填答者可自由輸入文字(每題最多一個) */
    is_other?: boolean;
}

export interface PollPayload {
    options: PollOption[];
    multi_select?: boolean;
}

export type SurveyQuestionType = 'single' | 'multi' | 'text';

export interface SurveyQuestion {
    id: string;
    label: string;
    type: SurveyQuestionType;
    options?: PollOption[]; // single / multi 時必填;text 不需要
}

export interface SurveyPayload {
    questions: SurveyQuestion[];
}

export interface Announcement {
    id: string;
    type: AnnouncementType;
    title: string;
    body: string | null;
    payload: PollPayload | SurveyPayload | Record<string, unknown> | null;
    target_segment: AnnouncementSegment;
    priority: number;
    starts_at: string;
    ends_at: string | null;
}

// /api/announcements/[id]/results 回應型別
export interface PollResultOption {
    id: string;
    label: string | null;
    count: number;
}

export interface PollResults {
    success: true;
    announcement_id: string;
    type: 'poll';
    total: number;
    options: PollResultOption[];
    truncated?: boolean;
}

export interface SurveyResultQuestionChoice {
    id: string;
    label: string | null;
    type: 'single' | 'multi';
    options: PollResultOption[];
}

export interface SurveyResultQuestionText {
    id: string;
    label: string | null;
    type: 'text';
    count: number;
}

export type SurveyResultQuestion = SurveyResultQuestionChoice | SurveyResultQuestionText;

export interface SurveyResults {
    success: true;
    announcement_id: string;
    type: 'survey';
    total: number;
    questions: SurveyResultQuestion[];
    truncated?: boolean;
}

// poll 提交 body
export interface PollChoiceItem {
    option_id: string;
}

// survey 提交 body
export interface SurveyChoiceItem {
    question_id: string;
    option_ids?: string[];
    text?: string;
    /** 勾選 is_other 選項時的自由填寫內容(option_ids 需包含該 is_other 選項) */
    other_text?: string;
}
