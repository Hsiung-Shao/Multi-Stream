
import { useTranslation } from 'react-i18next';
import { Mail, MessageSquare } from 'lucide-react';

import { logEvent } from '../../utils/analytics';

interface WelcomeHeaderProps {
    onShowVersionHistory?: () => void;
}

export const WelcomeHeader = () => {
    const { t } = useTranslation(['welcome', 'about', 'common']);

    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-purple-900/40 to-blue-900/40 p-8 shadow-2xl backdrop-blur-md">
            {/* Decoration */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 blur-3xl" />

            <div className="relative z-10">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-3 drop-shadow-sm">
                    {t('welcome:title')}
                </h1>
                <p className="text-lg text-blue-100/80 mb-6 max-w-2xl font-light leading-relaxed">
                    {t('welcome:description')}
                </p>

                {/* Author Message / Quick Links */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">


                    <div className="h-4 w-px bg-white/10" />

                    <a
                        href="https://discord.gg/3Uu6dZbtKd"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors flex items-center gap-1.5"
                        onClick={() => logEvent('WelcomeHeader', 'click_social', 'discord')}
                    >
                        <MessageSquare className="size-4" />
                        Discord
                    </a>

                    <a
                        href="https://forms.gle/AjG922YrXFbyAdBa6"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors flex items-center gap-1.5"
                        onClick={() => logEvent('WelcomeHeader', 'click_social', 'feedback')}
                    >
                        <Mail className="size-4" />
                        Feedback
                    </a>
                </div>
            </div>
        </div>
    );
};
