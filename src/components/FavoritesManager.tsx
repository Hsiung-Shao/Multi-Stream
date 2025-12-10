import { useState } from 'react';
import { X, Plus, Trash2, Edit2, Star, Folder } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface FavoritesManagerProps {
  theme: 'light' | 'dark';
  onClose: () => void;
}

export function FavoritesManager({ theme, onClose }: FavoritesManagerProps) {
  const [streamUrl, setStreamUrl] = useState('');
  const [streamName, setStreamName] = useState('');
  const [categoryName, setCategoryName] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`max-w-4xl w-full ${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg shadow-2xl max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Star className="size-6 text-white" />
            </div>
            <div>
              <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>收藏管理</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                管理您的收藏串流和分類
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
        <ScrollArea className="flex-1">
          <Tabs defaultValue="favorites" className="p-6">
            <TabsList className={`grid w-full grid-cols-3 mb-6 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <TabsTrigger value="favorites">收藏串流</TabsTrigger>
              <TabsTrigger value="categories">分類管理</TabsTrigger>
              <TabsTrigger value="settings">設定</TabsTrigger>
            </TabsList>

            <TabsContent value="favorites" className="space-y-4">
              {/* Add Favorite */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>新增收藏</h3>
                <div className="space-y-3">
                  <Input
                    type="text"
                    placeholder="串流網址（Twitch 或 YouTube）"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}
                  />
                  <Input
                    type="text"
                    placeholder="自訂名稱（選填）"
                    value={streamName}
                    onChange={(e) => setStreamName(e.target.value)}
                    className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}
                  />
                  <Select defaultValue="none">
                    <SelectTrigger className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未分類</SelectItem>
                      <SelectItem value="gaming">遊戲</SelectItem>
                      <SelectItem value="music">音樂</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700">
                    <Plus className="size-4 mr-2" />
                    加入收藏
                  </Button>
                </div>
              </div>

              {/* Favorites List */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>我的收藏</h3>
                <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  暫無收藏串流
                </div>
              </div>
            </TabsContent>

            <TabsContent value="categories" className="space-y-4">
              {/* Add Category */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>新增分類</h3>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="分類名稱"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                  />
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="size-4 mr-2" />
                    新增
                  </Button>
                </div>
              </div>

              {/* Categories List */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>分類列表</h3>
                <div className="space-y-2">
                  <CategoryItem theme={theme} name="遊戲" count={0} />
                  <CategoryItem theme={theme} name="音樂" count={0} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>數據備份</h3>
                <div className="space-y-3">
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    啟用數據備份功能，自動將收藏和分類保存到本地文件
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}
                    >
                      選擇文件位置
                    </Button>
                    <Button
                      variant="outline"
                      className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}
                    >
                      創建新文件
                    </Button>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>開台狀態更新</h3>
                <div className="space-y-3">
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    自動檢測收藏頻道的開台狀態（預設每 5 分鐘更新一次）
                  </p>
                  <Select defaultValue="5">
                    <SelectTrigger className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">每 1 分鐘</SelectItem>
                      <SelectItem value="5">每 5 分鐘</SelectItem>
                      <SelectItem value="10">每 10 分鐘</SelectItem>
                      <SelectItem value="30">每 30 分鐘</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </div>
    </div>
  );
}

function CategoryItem({ theme, name, count }: { theme: 'light' | 'dark'; name: string; count: number }) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-900 hover:bg-gray-800' : 'bg-white hover:bg-gray-50'} transition-colors`}>
      <div className="flex items-center gap-3">
        <Folder className={`size-5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
        <div>
          <p className={theme === 'dark' ? 'text-white' : 'text-black'}>{name}</p>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{count} 個串流</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className={theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'}
        >
          <Edit2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={theme === 'dark' ? 'text-gray-400 hover:text-red-400' : 'text-gray-600 hover:text-red-600'}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
