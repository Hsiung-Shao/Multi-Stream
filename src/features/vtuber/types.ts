/**
 * VTuber Feature Type Definitions
 */

export interface VTuberRecord {
  id: string;
  name: string;
  img_url: string | null;
  activity: 'active' | 'graduate';
  nationality: VTuberNationality;
  group_id: string | null;
  group_name?: string; // joined from vtuber_groups
  youtube_channel_id: string | null;
  youtube_subscriber_count: number | null;
  twitch_channel_id: string | null;
  twitch_follower_count: number | null;
  popular_video_type: string | null;
  popular_video_id: string | null;
  debut_date: string | null;
  channel_id_verified: boolean;
  contributed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VTuberGroup {
  id: string;
  name: string;
  nationality: VTuberNationality | null;
  member_count: number;
}

export interface VTuberLivestream {
  id: string;
  vtuber_id: string;
  vtuber?: VTuberRecord; // joined
  title: string | null;
  video_url: string;
  thumbnail_url: string | null;
  platform: 'youtube' | 'twitch';
  start_time: string | null;
  viewer_count: number | null;
}

export interface VTuberContribution {
  id: string;
  action: 'add' | 'edit' | 'delete';
  target_vtuber_id: string | null;
  payload: VTuberContributionPayload;
  status: 'pending' | 'approved' | 'rejected';
  submitted_by: string | null;
  submitter_contact: string | null;
  source_urls: string[];
  source_note: string | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  auto_check?: ContributionAutoCheck;
}

/** System auto-verification results attached to a contribution */
export interface ContributionAutoCheck {
  youtube_valid?: boolean;
  youtube_channel_name?: string;
  youtube_subscriber_count?: number;
  youtube_first_video_date?: string;
  twitch_valid?: boolean;
  twitch_display_name?: string;
  twitch_follower_count?: number;
  debut_date_confidence?: 'high' | 'medium' | 'low';
  checked_at: string;
}

export type VTuberNationality = 'TW' | 'HK' | 'MY' | 'JP' | 'KR' | 'OTHER';

export type VTuberSortBy = 'name' | 'youtube_subscribers' | 'twitch_followers' | 'debut_date' | 'created_at';

export interface VTuberFilter {
  nationality?: VTuberNationality;
  groupId?: string;
  activity?: 'active' | 'graduate';
  search?: string;
  sortBy?: VTuberSortBy;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface VTuberContributionPayload {
  name: string;
  nationality: VTuberNationality;
  youtube_channel_id?: string;
  twitch_channel_id?: string;
  group_name?: string;
  debut_date?: string;
  reason?: string; // required for delete action
}

export interface VTuberContributionFilter {
  status?: 'pending' | 'approved' | 'rejected';
  page?: number;
  pageSize?: number;
}

export interface SubmitContributionInput {
  action: VTuberContribution['action'];
  targetVTuberId?: string;
  payload: VTuberContributionPayload;
  submittedBy: string;
  submitterContact?: string;
  sourceUrls: string[];
  sourceNote?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventType = 'vtuber_event' | 'livestream' | 'community';
export type EventStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface VTuberEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  vtuber_id: string | null;
  organizer_id: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  url: string | null;
  image_url: string | null;
  status: EventStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined data
  vtuber?: VTuberRecord;
  organizer?: { display_name: string; avatar_url?: string | null };
}

export interface CreateEventInput {
  title: string;
  description?: string;
  event_type: EventType;
  vtuber_id?: string;
  start_time: string;
  end_time?: string;
  location?: string;
  url?: string;
  image_url?: string;
}

export interface EventFilter {
  event_type?: EventType;
  status?: EventStatus;
  vtuber_id?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
