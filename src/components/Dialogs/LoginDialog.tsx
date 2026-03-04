import { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Twitch, Loader2 } from 'lucide-react';
import type { Provider } from '@supabase/supabase-js';

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDERS: { id: Provider; label: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'twitch',
    label: 'Twitch',
    icon: <Twitch className="w-5 h-5" />,
    color: 'bg-[#9146FF] hover:bg-[#7c3ae0] text-white',
  },
  {
    id: 'google',
    label: 'Google',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
    color: 'bg-white hover:bg-gray-100 text-gray-800 border border-gray-300',
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
    color: 'bg-[#5865F2] hover:bg-[#4752C4] text-white',
  },
];

export function LoginDialog({ open, onClose }: LoginDialogProps) {
  const { login, isLoading } = useAuthContext();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  const handleLogin = async (provider: Provider) => {
    setLoginError(null);
    setLoadingProvider(provider);
    try {
      await login(provider);
      // OAuth redirect will happen, dialog closes naturally
    } catch {
      setLoginError('登入失敗，請稍後再試');
      setLoadingProvider(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { onClose(); setLoginError(null); setLoadingProvider(null); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>登入</DialogTitle>
          <DialogDescription>
            透過社群帳號登入以使用完整功能
          </DialogDescription>
        </DialogHeader>

        {loginError && (
          <p className="text-sm text-red-500 text-center bg-red-500/10 rounded-md px-3 py-2">
            {loginError}
          </p>
        )}

        <div className="flex flex-col gap-3 mt-2">
          {PROVIDERS.map(({ id, label, icon, color }) => {
            const isProviderLoading = loadingProvider === id;
            return (
              <button
                key={id}
                onClick={() => handleLogin(id)}
                disabled={isLoading || loadingProvider !== null}
                className={`flex items-center justify-center gap-3 w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${color}`}
              >
                {isProviderLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
                {isProviderLoading ? '登入中...' : `使用 ${label} 登入`}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-2">
          登入即表示你同意我們的使用條款與隱私政策
        </p>
      </DialogContent>
    </Dialog>
  );
}
