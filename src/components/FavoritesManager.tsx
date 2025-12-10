import { useState } from 'react';
import { X, Plus, Trash2, Edit2, Star, Folder } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
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
  const [batchUrls, setBatchUrls] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [batchCategory, setBatchCategory] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);

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
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="貼上串流網址"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                  />
                  <Input
                    type="text"
                    placeholder="自訂名稱 (選填)"
                    value={streamName}
                    onChange={(e) => setStreamName(e.target.value)}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                  />
                  <Select value={selectedCategory || "uncategorized"} onValueChange={(value) => setSelectedCategory(value === "uncategorized" ? "" : value)}>
                    <SelectTrigger className={`w-[140px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                      <SelectValue placeholder="未分類" />
                    </SelectTrigger>
                    <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                      <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>未分類</SelectItem>
                      <SelectItem value="gaming" className={theme === 'dark' ? 'text-white' : 'text-black'}>遊戲</SelectItem>
                      <SelectItem value="music" className={theme === 'dark' ? 'text-white' : 'text-black'}>音樂</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="size-4 mr-2" />
                    加入收藏
                  </Button>
                </div>
              </div>

              {/* Batch Import */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>批量匯入</h3>
                <div className="space-y-3">
                  <Textarea
                    placeholder={`貼上多個網址，以逗號(,)分隔\n例如：\nhttps://www.twitch.tv/streamer1, https://www.youtube.com/watch?v=xxx, https://youtu.be/xxx`}
                    value={batchUrls}
                    onChange={(e) => setBatchUrls(e.target.value)}
                    style={{ height: '150px' }}
                    className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}
                  />
                  <div className="flex gap-2">
                    <Select value={batchCategory || "uncategorized"} onValueChange={(value) => setBatchCategory(value === "uncategorized" ? "" : value)}>
                      <SelectTrigger className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                        <SelectValue placeholder="未分類" />
                      </SelectTrigger>
                      <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                        <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>未分類</SelectItem>
                        <SelectItem value="gaming" className={theme === 'dark' ? 'text-white' : 'text-black'}>遊戲</SelectItem>
                        <SelectItem value="music" className={theme === 'dark' ? 'text-white' : 'text-black'}>音樂</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button className="bg-purple-600 hover:bg-purple-700">
                      批量匯入
                    </Button>
                  </div>
                </div>
              </div>

              {/* Favorites List */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>我的收藏(0)</h3>
                <div className="flex gap-2 mb-4 flex-wrap">
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className={`w-[120px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                      <SelectItem value="all" className={theme === 'dark' ? 'text-white' : 'text-black'}>全部</SelectItem>
                      <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>未分類</SelectItem>
                      <SelectItem value="gaming" className={theme === 'dark' ? 'text-white' : 'text-black'}>遊戲</SelectItem>
                      <SelectItem value="music" className={theme === 'dark' ? 'text-white' : 'text-black'}>音樂</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}
                  >
                    全選
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}
                  >
                    取消全選
                  </Button>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    一鍵載入選中
                  </Button>
                  <Button
                    size="sm"
                    style={{ 
                      backgroundColor: isDeleteHovered ? '#b91c1c' : '#dc2626', 
                      color: 'white' 
                    }}
                    onMouseEnter={() => setIsDeleteHovered(true)}
                    onMouseLeave={() => setIsDeleteHovered(false)}
                  >
                    刪除
                  </Button>
                </div>
                <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                  暫無收藏
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
                    數據會自動保存到瀏覽器的 localStorage。您也可以手動匯出/匯入 JSON 檔案進行備份或遷移。
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className={theme === 'dark' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}
                    >
                      匯出JSON
                    </Button>
                    <Button
                      className={theme === 'dark' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}
                    >
                      匯入JSON
                    </Button>
                  </div>
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
