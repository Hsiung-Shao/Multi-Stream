import { useUIStore } from '../store/useUIStore';
import { ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
    const theme = useUIStore(s => s.theme);
    const setPage = useUIStore(s => s.setPage);

    return (
        <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${theme === 'dark' ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-md w-full text-center space-y-8">
                {/* Graphic / Icon */}
                <div className="relative w-32 h-32 mx-auto">
                    <div className={`absolute inset-0 rounded-full opacity-20 ${theme === 'dark' ? 'bg-indigo-500' : 'bg-indigo-200'} animate-pulse`}></div>
                    <div className={`relative flex items-center justify-center w-full h-full rounded-full border-4 ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-white bg-white shadow-lg'}`}>
                        <span className="text-4xl font-bold text-indigo-500">404</span>
                    </div>
                </div>

                {/* Text Content */}
                <div className="space-y-4">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                        {theme === 'dark' ? <span className="text-white">找不到頁面</span> : <span className="text-gray-900">找不到頁面</span>}
                    </h1>
                    <p className={`text-lg ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        抱歉，您欲訪問的頁面不存在，或已被移除。
                    </p>
                </div>

                {/* Action Button */}
                <div className="pt-4">
                    <button
                        onClick={() => setPage('home')}
                        className={`
               inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-200
               ${theme === 'dark'
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/30'
                            }
             `}
                    >
                        <ArrowLeft size={20} />
                        返回首頁
                    </button>
                </div>
            </div>

            {/* Footer Decor */}
            <div className={`absolute bottom-8 text-sm ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                MultiStream Hub
            </div>
        </div>
    );
}
