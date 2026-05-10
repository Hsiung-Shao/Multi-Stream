import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../../contexts/AuthContext';
import { DisplayNameSection } from './DisplayNameSection';

/**
 * 「一般」section：帳號等級 + DisplayNameSection（顯示名稱編輯）。
 * 對應原本 AccountSettingsPage 內第一塊「帳號等級」+ DisplayNameSection。
 */
export function GeneralSection() {
    const { t } = useTranslation('account');
    const { profile } = useAuthContext();

    return (
        <div className="space-y-6">
            {profile && (
                <section className="rounded-xl border border-white/10 bg-card/50 p-5">
                    <h2 className="text-sm text-muted-foreground mb-1">
                        {t('overview.trustLevel', '帳號等級')}
                    </h2>
                    <p className="text-base font-medium capitalize">{profile.trust_level}</p>
                </section>
            )}
            <DisplayNameSection />
        </div>
    );
}
