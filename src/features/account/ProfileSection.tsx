import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { useAuthContext } from '../../contexts/AuthContext';
import { AcctSection } from './AcctSection';

/**
 * 個人資料卡：avatar + 名稱 + email + 帳號等級 badge。
 *
 * 純讀取 profile / user，不含任何 mutation。對齊設計稿 ProfileSection。
 */
export function ProfileSection() {
    const { t } = useTranslation('account');
    const { profile, user } = useAuthContext();

    if (!profile) return null;

    const displayName = profile.display_name || t('profile.noName', '尚未設定名稱');
    const email = user?.email ?? '';
    const initial = (profile.display_name || 'U').trim().charAt(0).toUpperCase();
    const joinedAt = profile.created_at
        ? new Date(profile.created_at).toLocaleDateString()
        : null;

    return (
        <AcctSection
            title={t('profile.title', '個人資料')}
            description={t(
                'profile.description',
                '連結登入帳號後我們會自動讀取以下資料；可以隨時編輯顯示名稱。',
            )}
        >
            <div className="flex items-center gap-4">
                <Avatar className="size-16 shrink-0">
                    {profile.avatar_url && (
                        <AvatarImage src={profile.avatar_url} alt={displayName} />
                    )}
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-purple-400 text-lg font-bold text-white">
                        {initial}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold">{displayName}</div>
                    {email && (
                        <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
                            {email}
                        </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-700 capitalize dark:text-purple-400">
                            {profile.trust_level}
                        </span>
                        {joinedAt && (
                            <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                                {t('profile.joinedAt', '加入於 {{date}}', { date: joinedAt })}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </AcctSection>
    );
}
