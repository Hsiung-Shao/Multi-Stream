import { X, Tv, Search, Layout, MessageCircle, Volume2, RefreshCw, Star, Radio, Database, Settings, Smartphone, Zap } from 'lucide-react';
import { Button as MuiButton } from '@mui/material';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Box } from '@mui/material';
import { useI18n } from '../i18n/index';

interface TutorialProps {
  theme: 'light' | 'dark';
  onClose: () => void;
}

export function Tutorial({ theme, onClose }: TutorialProps) {
  const { t } = useI18n();
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`max-w-5xl w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('tutorial.title')}</h2>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {t('tutorial.subtitle')}
            </p>
          </div>
          <MuiButton
            variant="text"
            size="small"
            onClick={onClose}
            color="secondary"
            sx={{
              color: theme === 'dark' ? '#9ca3af' : '#4b5563',
              '&:hover': {
                color: theme === 'dark' ? '#ffffff' : '#000000',
                backgroundColor: 'transparent',
              },
            }}
          >
            <X className="size-5" />
          </MuiButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="basic" className="flex flex-col h-full">
            <div className="px-6 pt-6 flex-shrink-0">
              <TabsList className={`grid w-full grid-cols-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <TabsTrigger value="basic">{t('tutorial.basic')}</TabsTrigger>
                <TabsTrigger value="advanced">{t('tutorial.advanced')}</TabsTrigger>
                <TabsTrigger value="tips">{t('tutorial.tips')}</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="basic" className="flex-1 min-h-0 mt-0">
              <Box
                className="p-6"
                sx={{
                  height: '100%',
                  maxHeight: '800px',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  '&::-webkit-scrollbar': {
                    width: '8px',
                  },
                  '&::-webkit-scrollbar-track': {
                    background: theme === 'dark' ? '#374151' : '#f3f4f6',
                    borderRadius: '4px',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: theme === 'dark' ? '#6b7280' : '#9ca3af',
                    borderRadius: '4px',
                    '&:hover': {
                      background: theme === 'dark' ? '#9ca3af' : '#6b7280',
                    },
                  },
                }}
              >
                <div className="space-y-6 pr-4">
                  <Section
                    theme={theme}
                    icon={<Tv className="size-5" />}
                    title={t('tutorial.addStream.title')}
                    content={
                  <>
                    <ol className="list-decimal list-inside space-y-2 mb-3">
                      <li>{t('tutorial.addStream.step1')}</li>
                      <li>{t('tutorial.addStream.step2')}</li>
                      <li>{t('tutorial.addStream.step3')}</li>
                    </ol>
                    <Tip theme={theme} text={t('tutorial.addStream.tip1')} />
                    <ul className={`list-disc list-inside ml-4 space-y-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      <li>{t('tutorial.addStream.tip2')}</li>
                      <li>{t('tutorial.addStream.tip3')}</li>
                    </ul>
                    <Tip theme={theme} text={t('tutorial.addStream.tip4')} />
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<Search className="size-5" />}
                    title={t('tutorial.search.title')}
                    content={
                  <>
                    <ol className="list-decimal list-inside space-y-2 mb-3">
                      <li>{t('tutorial.search.step1')}</li>
                      <li>{t('tutorial.search.step2')}</li>
                      <li>{t('tutorial.search.step3')}</li>
                    </ol>
                    <Tip theme={theme} text={t('tutorial.search.tip')} />
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<Layout className="size-5" />}
                    title={t('tutorial.layout.title')}
                    content={
                  <>
                    <div className="space-y-4">
                      <div>
                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                          {t('tutorial.layout.basic.title')}
                        </h4>
                        <ol className="list-decimal list-inside space-y-2">
                          <li>{t('tutorial.layout.basic.step1')}</li>
                          <li>{t('tutorial.layout.basic.step2')}</li>
                          <li>{t('tutorial.layout.basic.step3')}</li>
                        </ol>
                      </div>
                      <div>
                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                          {t('tutorial.layout.sideChat.title')}
                        </h4>
                        <ol className="list-decimal list-inside space-y-2">
                          <li>{t('tutorial.layout.sideChat.step1')}</li>
                          <li>{t('tutorial.layout.sideChat.step2')}</li>
                          <li>{t('tutorial.layout.sideChat.step3')}</li>
                          <li>{t('tutorial.layout.sideChat.step4')}</li>
                        </ol>
                        <Tip theme={theme} text={t('tutorial.layout.sideChat.tip')} />
                      </div>
                    </div>
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<MessageCircle className="size-5" />}
                    title={t('tutorial.chat.title')}
                    content={
                  <>
                    <div className="space-y-4">
                      <div>
                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                          {t('tutorial.chat.basic.title')}
                        </h4>
                        <ul className="list-disc list-inside space-y-2">
                          <li>{t('tutorial.chat.basic.step1')}</li>
                          <li>{t('tutorial.chat.basic.step2')}</li>
                          <li>{t('tutorial.chat.basic.step3')}</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className={`mb-2 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                          {t('tutorial.chat.sideLayout.title')}
                        </h4>
                        <ul className="list-disc list-inside space-y-2">
                          <li>{t('tutorial.chat.sideLayout.step1')}</li>
                          <li>{t('tutorial.chat.sideLayout.step2')}</li>
                          <li>{t('tutorial.chat.sideLayout.step3')}</li>
                          <li>{t('tutorial.chat.sideLayout.step4')}</li>
                          <li>{t('tutorial.chat.sideLayout.step5')}</li>
                        </ul>
                      </div>
                    </div>
                    <Warning theme={theme} text={t('tutorial.chat.warning')} />
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<Volume2 className="size-5" />}
                    title={t('tutorial.volume.title')}
                    content={
                  <>
                    <ul className="list-disc list-inside space-y-2">
                      <li>{t('tutorial.volume.step1')}</li>
                      <li>{t('tutorial.volume.step2')}</li>
                      <li>{t('tutorial.volume.step3')}</li>
                      <li>{t('tutorial.volume.step4')}</li>
                      <li>{t('tutorial.volume.step5')}</li>
                    </ul>
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<RefreshCw className="size-5" />}
                    title={t('tutorial.reload.title')}
                    content={
                  <>
                    <ol className="list-decimal list-inside space-y-2">
                      <li>{t('tutorial.reload.step1')}</li>
                      <li>{t('tutorial.reload.step2')}</li>
                    </ol>
                  </>
                }
                  />
                </div>
              </Box>
            </TabsContent>

            <TabsContent value="advanced" className="flex-1 min-h-0 mt-0">
              <Box
                className="p-6"
                sx={{
                  height: '100%',
                  maxHeight: '800px',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  '&::-webkit-scrollbar': {
                    width: '8px',
                  },
                  '&::-webkit-scrollbar-track': {
                    background: theme === 'dark' ? '#374151' : '#f3f4f6',
                    borderRadius: '4px',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: theme === 'dark' ? '#6b7280' : '#9ca3af',
                    borderRadius: '4px',
                    '&:hover': {
                      background: theme === 'dark' ? '#9ca3af' : '#6b7280',
                    },
                  },
                }}
              >
                <div className="space-y-6 pr-4">
                  <Section
                    theme={theme}
                    icon={<Star className="size-5" />}
                    title={t('tutorial.favorite.title')}
                    content={
                  <>
                    <ol className="list-decimal list-inside space-y-2 mb-3">
                      <li>{t('tutorial.favorite.step1')}</li>
                      <li>{t('tutorial.favorite.step2')}
                        <ul className="list-disc list-inside ml-6 mt-1">
                          <li>{t('tutorial.favorite.step2Item1')}</li>
                          <li>{t('tutorial.favorite.step2Item2')}</li>
                          <li>{t('tutorial.favorite.step2Item3')}</li>
                        </ul>
                      </li>
                      <li>{t('tutorial.favorite.step3')}</li>
                      <li>{t('tutorial.favorite.step4')}
                        <ul className="list-disc list-inside ml-6 mt-1">
                          <li>{t('tutorial.favorite.step4Item1')}</li>
                          <li>{t('tutorial.favorite.step4Item2')}</li>
                        </ul>
                      </li>
                    </ol>
                    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'} mb-3`}>
                      <p className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                        {t('tutorial.favorite.batchImport.title')}
                      </p>
                      <ol className={`list-decimal list-inside ml-4 space-y-1 text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                        <li>{t('tutorial.favorite.batchImport.step1')}</li>
                        <li>{t('tutorial.favorite.batchImport.step2')}</li>
                        <li>{t('tutorial.favorite.batchImport.step3')}</li>
                        <li>{t('tutorial.favorite.batchImport.step4')}</li>
                      </ol>
                    </div>
                    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                      <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                        {t('tutorial.favorite.step5')}
                      </p>
                      <ul className={`list-disc list-inside ml-4 mt-2 text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                        <li>{t('tutorial.favorite.step5Item1')}</li>
                        <li>{t('tutorial.favorite.step5Item2')}</li>
                        <li>{t('tutorial.favorite.step5Item3')}</li>
                      </ul>
                    </div>
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<Radio className="size-5" />}
                    title={t('tutorial.liveStatus.title')}
                    content={
                  <>
                    <ul className="list-disc list-inside space-y-2">
                      <li>{t('tutorial.liveStatus.step1')}</li>
                      <li>{t('tutorial.liveStatus.step2')}</li>
                      <li>{t('tutorial.liveStatus.step3')}</li>
                      <li>{t('tutorial.liveStatus.step4')}</li>
                      <li>{t('tutorial.liveStatus.step5')}</li>
                    </ul>
                    <Tip theme={theme} text={t('tutorial.liveStatus.tip')} />
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<Tv className="size-5" />}
                    title={t('tutorial.youtubeLiveStatus.title')}
                    content={
                  <>
                    <ol className="list-decimal list-inside space-y-2 mb-3">
                      <li>{t('tutorial.youtubeLiveStatus.step1')}</li>
                      <li>{t('tutorial.youtubeLiveStatus.step2')}</li>
                      <li>{t('tutorial.youtubeLiveStatus.step3')}</li>
                      <li>{t('tutorial.youtubeLiveStatus.step4')}</li>
                      <li>{t('tutorial.youtubeLiveStatus.step5')}</li>
                    </ol>
                    <Tip theme={theme} text={t('tutorial.youtubeLiveStatus.tip')} />
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<Database className="size-5" />}
                    title={t('tutorial.backup.title')}
                    content={
                  <>
                    <ul className="list-disc list-inside space-y-2 mb-3">
                      <li>{t('tutorial.backup.step1')}</li>
                      <li>{t('tutorial.backup.step2')}</li>
                    </ul>
                    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-green-900/20 border border-green-500/30' : 'bg-green-50 border border-green-200'} mb-3`}>
                      <p className={`text-sm ${theme === 'dark' ? 'text-green-300' : 'text-green-700'}`}>
                        {t('tutorial.backup.step3')}
                      </p>
                    </div>
                    <ul className="list-disc list-inside space-y-2">
                      <li>{t('tutorial.backup.step4')}</li>
                      <li>{t('tutorial.backup.step5')}</li>
                    </ul>
                    <Tip theme={theme} text={t('tutorial.backup.tip')} />
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<Settings className="size-5" />}
                    title={t('tutorial.controlPanel.title')}
                    content={
                  <>
                    <ul className="list-disc list-inside space-y-2">
                      <li>{t('tutorial.controlPanel.step1')}</li>
                      <li>{t('tutorial.controlPanel.step2')}</li>
                      <li>{t('tutorial.controlPanel.step3')}</li>
                    </ul>
                  </>
                }
                  />

                  <Section
                    theme={theme}
                    icon={<Smartphone className="size-5" />}
                    title={t('tutorial.mobile.title')}
                    content={
                  <>
                    <ul className="list-disc list-inside space-y-2">
                      <li>{t('tutorial.mobile.step1')}</li>
                      <li>{t('tutorial.mobile.step2')}</li>
                      <li>{t('tutorial.mobile.step3')}</li>
                    </ul>
                  </>
                }
                  />
                </div>
              </Box>
            </TabsContent>

            <TabsContent value="tips" className="flex-1 min-h-0 mt-0">
              <Box
                className="p-6"
                sx={{
                  height: '100%',
                  maxHeight: '800px',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  '&::-webkit-scrollbar': {
                    width: '8px',
                  },
                  '&::-webkit-scrollbar-track': {
                    background: theme === 'dark' ? '#374151' : '#f3f4f6',
                    borderRadius: '4px',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: theme === 'dark' ? '#6b7280' : '#9ca3af',
                    borderRadius: '4px',
                    '&:hover': {
                      background: theme === 'dark' ? '#9ca3af' : '#6b7280',
                    },
                  },
                }}
              >
                <div className="space-y-6 pr-4">
                  <Section
                    theme={theme}
                    icon={<Zap className="size-5" />}
                    title={t('tutorial.tips.title')}
                    content={
                  <>
                    <div className="grid gap-4">
                      <TipCard
                        theme={theme}
                        title={t('tutorial.tips.card1.title')}
                        description={t('tutorial.tips.card1.description')}
                      />
                      <TipCard
                        theme={theme}
                        title={t('tutorial.tips.card2.title')}
                        description={t('tutorial.tips.card2.description')}
                      />
                      <TipCard
                        theme={theme}
                        title={t('tutorial.tips.card3.title')}
                        description={t('tutorial.tips.card3.description')}
                      />
                      <TipCard
                        theme={theme}
                        title={t('tutorial.tips.card4.title')}
                        description={t('tutorial.tips.card4.description')}
                      />
                      <TipCard
                        theme={theme}
                        title={t('tutorial.tips.card5.title')}
                        description={t('tutorial.tips.card5.description')}
                      />
                      <TipCard
                        theme={theme}
                        title={t('tutorial.tips.card6.title')}
                        description={t('tutorial.tips.card6.description')}
                      />
                    </div>
                  </>
                }
                  />
                </div>
              </Box>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Section({
  theme,
  icon,
  title,
  content,
}: {
  theme: 'light' | 'dark';
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}) {
  return (
    <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`size-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white`}>
          {icon}
        </div>
        <h3 className={theme === 'dark' ? 'text-white' : 'text-black'}>{title}</h3>
      </div>
      <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} space-y-3`}>
        {content}
      </div>
    </div>
  );
}

function Tip({ theme, text }: { theme: 'light' | 'dark'; text: string }) {
  return (
    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
      <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
        💡 {text}
      </p>
    </div>
  );
}

function Warning({ theme, text }: { theme: 'light' | 'dark'; text: string }) {
  return (
    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-yellow-900/20 border border-yellow-500/30' : 'bg-yellow-50 border border-yellow-200'}`}>
      <p className={`text-sm ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-700'}`}>
        ⚠️ {text}
      </p>
    </div>
  );
}

function TipCard({ theme, title, description }: { theme: 'light' | 'dark'; title: string; description: string }) {
  return (
    <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gradient-to-r from-purple-900/20 to-blue-900/20 border-purple-500/30' : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200'}`}>
      <h4 className={`mb-1 ${theme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`}>{title}</h4>
      <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
    </div>
  );
}
