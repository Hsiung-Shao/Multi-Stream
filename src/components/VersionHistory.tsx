import { X, Calendar, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { useI18n } from '../i18n/index';
import { ScrollArea } from './ui/scroll-area';

interface VersionHistoryProps {
  theme: 'light' | 'dark';
  onClose: () => void;
}

export function VersionHistory({ theme, onClose }: VersionHistoryProps) {
  const { t } = useI18n();

  const versions = [
    {
      version: 'v2.2.0',
      date: t('versionHistory.v2.2.0.date'),
      changes: [
        t('versionHistory.v2.2.0.change1'),
        t('versionHistory.v2.2.0.change2'),
        t('versionHistory.v2.2.0.change3'),
        t('versionHistory.v2.2.0.change4'),
      ],
    },
    {
      version: 'v2.1.0',
      date: t('versionHistory.v2.1.0.date'),
      changes: [
        t('versionHistory.v2.1.0.change1'),
        t('versionHistory.v2.1.0.change2'),
      ],
    },
    {
      version: 'v2.0.2',
      date: t('versionHistory.v2.0.2.date'),
      changes: [
        t('versionHistory.v2.0.2.change1'),
        t('versionHistory.v2.0.2.change2'),
        t('versionHistory.v2.0.2.change3'),
      ],
    },
    {
      version: 'v2.0.1',
      date: t('versionHistory.v2.0.1.date'),
      changes: [
        t('versionHistory.v2.0.1.change1'),
        t('versionHistory.v2.0.1.change2'),
        t('versionHistory.v2.0.1.change3'),
        t('versionHistory.v2.0.1.change4'),
      ],
    },
    {
      version: 'v2.0.0',
      date: t('versionHistory.v2.0.0.date'),
      changes: [
        t('versionHistory.v2.0.0.change1'),
        t('versionHistory.v2.0.0.change2'),
        t('versionHistory.v2.0.0.change3'),
        t('versionHistory.v2.0.0.change4'),
      ],
    },
    {
      version: 'v1.7.1',
      date: t('versionHistory.v1.7.1.date'),
      changes: [
        t('versionHistory.v1.7.1.change1'),
        t('versionHistory.v1.7.1.change2'),
      ],
    },
    {
      version: 'v1.7.0',
      date: t('versionHistory.v1.7.0.date'),
      changes: [
        t('versionHistory.v1.7.0.change1'),
        t('versionHistory.v1.7.0.change2'),
        t('versionHistory.v1.7.0.change3'),
        t('versionHistory.v1.7.0.change4'),
        t('versionHistory.v1.7.0.change5'),
        t('versionHistory.v1.7.0.change6'),
        t('versionHistory.v1.7.0.change7'),
        t('versionHistory.v1.7.0.change8'),
        t('versionHistory.v1.7.0.change9'),
      ],
    },
    {
      version: 'v1.6.2',
      date: t('versionHistory.v1.6.2.date'),
      changes: [
        t('versionHistory.v1.6.2.change1'),
        t('versionHistory.v1.6.2.change2'),
        t('versionHistory.v1.6.2.change3'),
      ],
    },
    {
      version: 'v1.6.1',
      date: t('versionHistory.v1.6.1.date'),
      changes: [
        t('versionHistory.v1.6.1.change1'),
        t('versionHistory.v1.6.1.change2'),
        t('versionHistory.v1.6.1.change3'),
        t('versionHistory.v1.6.1.change4'),
      ],
    },
    {
      version: 'v1.6.0',
      date: t('versionHistory.v1.6.0.date'),
      changes: [
        t('versionHistory.v1.6.0.change1'),
        t('versionHistory.v1.6.0.change2'),
        t('versionHistory.v1.6.0.change3'),
        t('versionHistory.v1.6.0.change4'),
        t('versionHistory.v1.6.0.change5'),
      ],
    },
    {
      version: 'v1.5.0',
      date: t('versionHistory.v1.5.0.date'),
      changes: [
        t('versionHistory.v1.5.0.change1'),
        t('versionHistory.v1.5.0.change2'),
        t('versionHistory.v1.5.0.change3'),
        t('versionHistory.v1.5.0.change4'),
        t('versionHistory.v1.5.0.change5'),
      ],
    },
    {
      version: 'v1.4.1',
      date: t('versionHistory.v1.4.1.date'),
      changes: [
        t('versionHistory.v1.4.1.change1'),
        t('versionHistory.v1.4.1.change2'),
      ],
    },
    {
      version: 'v1.3.0',
      date: t('versionHistory.v1.3.0.date'),
      changes: [
        t('versionHistory.v1.3.0.change1'),
        t('versionHistory.v1.3.0.change2'),
        t('versionHistory.v1.3.0.change3'),
        t('versionHistory.v1.3.0.change4'),
        t('versionHistory.v1.3.0.change5'),
      ],
    },
    {
      version: 'v1.2.0',
      date: t('versionHistory.v1.2.0.date'),
      changes: [
        t('versionHistory.v1.2.0.change1'),
        t('versionHistory.v1.2.0.change2'),
        t('versionHistory.v1.2.0.change3'),
        t('versionHistory.v1.2.0.change4'),
        t('versionHistory.v1.2.0.change5'),
        t('versionHistory.v1.2.0.change6'),
        t('versionHistory.v1.2.0.change7'),
        t('versionHistory.v1.2.0.change8'),
      ],
    },
    {
      version: 'v1.1.0',
      date: t('versionHistory.v1.1.0.date'),
      changes: [
        t('versionHistory.v1.1.0.change1'),
        t('versionHistory.v1.1.0.change2'),
        t('versionHistory.v1.1.0.change3'),
        t('versionHistory.v1.1.0.change4'),
      ],
    },
    {
      version: 'v1.0.0',
      date: t('versionHistory.v1.0.0.date'),
      changes: [
        t('versionHistory.v1.0.0.change1'),
        t('versionHistory.v1.0.0.change2'),
        t('versionHistory.v1.0.0.change3'),
        t('versionHistory.v1.0.0.change4'),
        t('versionHistory.v1.0.0.change5'),
        t('versionHistory.v1.0.0.change6'),
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`max-w-3xl w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'} flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="size-6 text-white" />
            </div>
            <div>
              <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('versionHistory.title')}</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {t('versionHistory.subtitle')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="h-[70vh] w-full px-6">
          <div className="py-6 space-y-6">
            {versions.map((version, index) => (
              <div
                key={version.version}
                className={`relative pl-6 pb-6 ${index !== versions.length - 1
                  ? `border-l-2 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`
                  : ''
                  }`}
              >
                {/* Timeline dot */}
                <div className={`absolute left-0 top-0 -translate-x-[9px] size-4 rounded-full ${index === 0
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500'
                  : theme === 'dark'
                    ? 'bg-gray-700'
                    : 'bg-gray-300'
                  } ring-4 ${theme === 'dark' ? 'ring-gray-900' : 'ring-white'}`} />

                {/* Version info */}
                <div className="flex items-center gap-3 mb-3">
                  <span className={`px-3 py-1 rounded-full ${index === 0
                    ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white'
                    : theme === 'dark'
                      ? 'bg-gray-800 text-gray-300'
                      : 'bg-gray-100 text-gray-700'
                    }`}>
                    {version.version}
                  </span>
                  <div className={`flex items-center gap-1 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    <Calendar className="size-4" />
                    {version.date}
                  </div>
                  {index === 0 && (
                    <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
                      {t('versionHistory.latest')}
                    </span>
                  )}
                </div>

                {/* Changes */}
                <ul className="space-y-2">
                  {version.changes.map((change, changeIndex) => (
                    <li
                      key={changeIndex}
                      className={`flex items-start gap-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      <span className={theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}>•</span>
                      {change}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
