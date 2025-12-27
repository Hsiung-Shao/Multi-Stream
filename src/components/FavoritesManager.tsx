import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Edit2, Star, Folder, Play, Check, Loader2 } from 'lucide-react';
import { Button as MuiButton } from '@mui/material';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox, Box } from '@mui/material';
import { useI18n } from '../i18n/index';
import { TagMultiSelect } from './ui/TagMultiSelect';
import { TagList } from './ui/TagList';
import { TagChip } from './ui/TagChip';
import { TagPopoverSelector } from './ui/TagPopoverSelector';
import { TagFilterLayout } from './ui/TagFilterLayout';
import { tagsService } from '../features/favorites/TagsService';
import { favoritesService } from '../features/favorites/FavoritesService';
import { FavoriteStream as FavoriteItem, FavoriteCategory as Category, Tag } from '../features/favorites/types';

interface FavoritesManagerProps {
  theme: 'light' | 'dark';
  onClose: () => void;
}

// Interfaces imported from features/favorites/types

// 聲明全局類型 - moved to src/types/global.d.ts

// 防抖備份函數（2秒）
let backupTimeout: NodeJS.Timeout | null = null;
function debouncedBackup() {
  if (backupTimeout) {
    clearTimeout(backupTimeout);
  }
  backupTimeout = setTimeout(() => {
    if (window.indexedDBBackup?.isEnabled()) {
      window.indexedDBBackup.backup().catch(() => {
        // 備份錯誤，靜默處理
      });
    }
  }, 2000); // 2秒後備份
}

// 解析URL並獲取頻道資訊
async function parseUrlAndGetChannelInfo(url: string): Promise<{ url: string; name: string; channelId?: string } | null> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  // Twitch URL: https://www.twitch.tv/username
  if (trimmedUrl.includes('twitch.tv')) {
    const match = trimmedUrl.match(/twitch\.tv\/([^\/\?]+)/);
    if (match) {
      const username = match[1];
      // Twitch 使用 username 作為 channelId
      return {
        url: `https://www.twitch.tv/${username}`,
        name: username,
        channelId: username
      };
    }
  }

  // YouTube URL - 僅支援 https://www.youtube.com/watch?v=xxx 格式
  if (trimmedUrl.includes('youtube.com/watch')) {
    let videoId: string | undefined;

    // 僅支援從 youtube.com/watch?v=xxx 提取 videoId
    if (trimmedUrl.includes('youtube.com/watch')) {
      videoId = new URL(trimmedUrl).searchParams.get('v') || undefined;
    }

    // 使用 YouTube API 通過 videoId 逆推 channelId
    if (window.youtubeApiUtils && videoId) {
      try {
        // 從 videoId 獲取 channelId（唯一支援的方式）
        const realChannelId = await window.youtubeApiUtils.getChannelIdFromVideoId!(videoId);
        if (realChannelId) {
          // 獲取頻道名稱
          try {
            const channelTitle = await window.youtubeApiUtils.getChannelTitleFromChannelId!(realChannelId);
            return {
              url: `https://www.youtube.com/channel/${realChannelId}/live`,
              name: channelTitle,
              channelId: realChannelId
            };
          } catch {
            return {
              url: `https://www.youtube.com/channel/${realChannelId}/live`,
              name: videoId,
              channelId: realChannelId
            };
          }
        }
      } catch (error) {
        // YouTube API 錯誤，繼續處理
      }
    }

    // 如果無法獲取 channelId，返回 null
    return null;
  }

  return null;
}

export function FavoritesManager({ theme, onClose }: FavoritesManagerProps) {
  const { t } = useI18n();
  const [streamUrl, setStreamUrl] = useState('');
  const [streamName, setStreamName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [batchCategory, setBatchCategory] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isDeleteHovered, setIsDeleteHovered] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedFavorites, setSelectedFavorites] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('favorites');
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // For adding new favorite
  const [editTags, setEditTags] = useState<string[]>([]); // For editing existing
  const [filterTags, setFilterTags] = useState<string[]>([]); // For filtering
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6'); // Default blue
  const [editingTagId, setEditingTagId] = useState<string | null>(null);

  // 載入收藏和分類列表
  const loadData = useCallback(() => {
    // 確保收藏系統已初始化（可能需要等待）
    if (!window.favoriteStreams || !window.favoriteCategories) {
      // 等待收藏系統初始化（最多等待 2 秒）
      let waitCount = 0;
      const checkAndLoad = () => {
        if (window.favoriteStreams && window.favoriteCategories) {
          try {
            const favoritesList = window.favoriteStreams.getList();
            const categoriesList = window.favoriteCategories.getList();
            const tagsList = tagsService.getAllTags();
            setFavorites(favoritesList);
            setCategories(categoriesList);
            setTags(tagsList);
          } catch (error) {
            // 載入數據時發生錯誤，繼續處理
          }
        } else if (waitCount < 20) {
          waitCount++;
          setTimeout(checkAndLoad, 100);
        }
      };
      checkAndLoad();
    } else {
      try {
        const favoritesList = window.favoriteStreams.getList();
        const categoriesList = window.favoriteCategories.getList();
        const tagsList = tagsService.getAllTags();
        setFavorites(favoritesList);
        setCategories(categoriesList);
        setTags(tagsList);
      } catch (error) {
        // 載入數據時發生錯誤，繼續處理
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 顯示訊息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 添加單個收藏
  const handleAddFavorite = async () => {
    if (!streamUrl.trim()) {
      showMessage('error', t('favorites.pasteUrl'));
      return;
    }

    if (!window.favoriteStreams) {
      showMessage('error', t('favorites.systemNotInitialized') || '收藏系統未初始化');
      return;
    }

    try {
      // Import new typing directly if needed, but here we invoke the window wrapper which usually calls the service under the hood. 
      // However, window wrapper might not support tags yet? 
      // The task implementation plan said "Update FavoritesService to support tags field". I did that.
      // But window.favoriteStreams.add signature in declare global is:
      // add: (url: string, name?: string, categoryId?: string | null, providedChannelId?: string | null) 
      // It doesn't include tags!
      // So I should call favoritesService.addFavorite directly!

      const categoryId = selectedCategory === '' || selectedCategory === 'uncategorized' ? null : selectedCategory;
      const result = await favoritesService.addFavorite(
        streamUrl,
        streamName || undefined,
        categoryId,
        undefined, // providedChannelId
        undefined, // providedVideoId
        selectedTags
      );

      if (result.success) {
        showMessage('success', result.message || t('favorites.add'));
        setStreamUrl('');
        setStreamName('');
        setSelectedCategory('');
        setSelectedTags([]);
        loadData();
        debouncedBackup();
      } else {
        showMessage('error', result.message || t('favorites.addFailed') || '加入失敗');
      }
    } catch (error) {
      showMessage('error', `錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 批量匯入
  const handleBatchImport = async () => {
    if (!batchUrls.trim()) {
      showMessage('error', t('favorites.pasteUrl'));
      return;
    }

    if (!window.favoriteStreams) {
      showMessage('error', t('favorites.systemNotInitialized') || '收藏系統未初始化');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: 0 });

    try {
      // 解析URL列表（支援逗號、換行、空格分隔）
      const urlList = batchUrls
        .split(/[,\n\r]+/)
        .map(url => url.trim())
        .filter(url => url.length > 0);

      if (urlList.length === 0) {
        showMessage('error', t('favorites.noValidUrls') || '未找到有效的網址');
        setIsImporting(false);
        return;
      }

      setImportProgress({ current: 0, total: urlList.length });

      const categoryId = batchCategory === '' || batchCategory === 'uncategorized' ? null : batchCategory;
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      // 逐個處理URL
      for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];
        setImportProgress({ current: i + 1, total: urlList.length });

        try {
          // 直接使用 favoriteStreams.add，它會使用與單個新增相同的解析邏輯（settings.js）
          const result = await window.favoriteStreams.add(
            url,
            undefined, // 讓系統自動獲取頻道名稱
            categoryId
          );

          if (result.success) {
            successCount++;
          } else {
            failCount++;
            errors.push(`${url}: ${result.message}`);
          }
        } catch (error) {
          failCount++;
          errors.push(`${url}: ${error instanceof Error ? error.message : '未知錯誤'}`);
        }
      }

      setIsImporting(false);
      setBatchUrls('');

      if (successCount > 0) {
        // 確保自動修復新匯入項目的平台標籤
        tagsService.initializeDefaults();
        loadData();
        debouncedBackup();
        const successMsg = failCount > 0
          ? t('favorites.batchImportSuccessWithFail')?.replace('{success}', successCount.toString()).replace('{fail}', failCount.toString()) || `成功匯入 ${successCount} 個收藏，失敗 ${failCount} 個`
          : t('favorites.batchImportSuccess')?.replace('{success}', successCount.toString()) || `成功匯入 ${successCount} 個收藏`;
        showMessage('success', successMsg);
        // 匯入成功後切換到"我的收藏"標籤頁
        setActiveTab('favorites');
      } else {
        showMessage('error', t('favorites.batchImportFailed') || `匯入失敗: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
      }
    } catch (error) {
      setIsImporting(false);
      showMessage('error', t('favorites.batchImportError') || `匯入錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 批量刪除
  const handleBatchDelete = () => {
    if (selectedFavorites.size === 0) {
      showMessage('error', '請選擇要刪除的收藏');
      return;
    }

    if (!window.favoriteStreams) {
      showMessage('error', t('favorites.systemNotInitialized') || '收藏系統未初始化');
      return;
    }

    if (!confirm(`確定要刪除選中的 ${selectedFavorites.size} 個收藏嗎？`)) {
      return;
    }

    let deletedCount = 0;
    selectedFavorites.forEach(id => {
      const result = window.favoriteStreams!.remove!(id);
      if (result.success) {
        deletedCount++;
      }
    });

    setSelectedFavorites(new Set());
    loadData();

    // 刪除操作立即備份
    if (window.indexedDBBackup?.isEnabled()) {
      if (backupTimeout) {
        clearTimeout(backupTimeout);
      }
      window.indexedDBBackup.backup().catch(() => { });
    }

    showMessage('success', `${t('favorites.delete')} ${deletedCount} ${t('favorites.myFavorites')}`);
  };

  // 全選/取消全選
  const handleSelectAll = () => {
    const filtered = getFilteredFavorites();
    setSelectedFavorites(new Set(filtered.map(f => f.id)));
  };

  const handleDeselectAll = () => {
    setSelectedFavorites(new Set());
  };

  // 載入選中的收藏
  const handleLoadSelected = async () => {
    if (selectedFavorites.size === 0) {
      showMessage('error', t('favorites.loadSelected')); // TODO: 更好的錯誤訊息
      return;
    }

    if (!window.favoriteStreams) {
      showMessage('error', t('favorites.systemNotInitialized') || '收藏系統未初始化');
      return;
    }

    try {
      const selectedItems = favorites.filter(f => selectedFavorites.has(f.id));
      const result = await window.favoriteStreams.loadMultiple(selectedItems);
      if (result.success) {
        showMessage('success', result.message || t('favorites.loadSelected'));
      } else {
        showMessage('error', result.message || '載入失敗'); // TODO: 翻譯
      }
    } catch (error) {
      showMessage('error', `${t('common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 載入分類中的所有收藏
  const handleLoadCategory = async (categoryId: string) => {
    if (!window.favoriteStreams) {
      showMessage('error', t('favorites.systemNotInitialized') || '收藏系統未初始化');
      return;
    }

    try {
      // 獲取該分類下的所有收藏
      const categoryFavorites = favorites.filter(f => f.categoryId === categoryId);

      if (categoryFavorites.length === 0) {
        showMessage('error', t('favorites.noFavorites')); // TODO: 更好的錯誤訊息
        return;
      }

      const result = await window.favoriteStreams.loadMultiple(categoryFavorites);
      if (result.success) {
        const category = categories.find(c => c.id === categoryId);
        showMessage('success', result.message || `${t('favorites.loadCategory')}: ${category?.name || categoryId}`);
      } else {
        showMessage('error', result.message || '載入失敗'); // TODO: 翻譯
      }
    } catch (error) {
      showMessage('error', `${t('common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 獲取過濾後的收藏列表
  const getFilteredFavorites = (): FavoriteItem[] => {
    let filtered = favorites;

    // Category Filter
    if (filterCategory !== 'all') {
      if (filterCategory === 'uncategorized') {
        filtered = filtered.filter(f => !f.categoryId);
      } else {
        filtered = filtered.filter(f => f.categoryId === filterCategory);
      }
    }

    return filtered;
  };

  // Tag Filter (Multi-select)
  // Logic: Show streams containing ALL selected filter tags (AND logic)? Or ANY (OR logic)?
  // User Plan: "排序篩選優先:多標籤 > 分類" "可以選擇多個標籤來篩選收藏列表"
  // Let's implement OR logic for broad discovery first, or AND per my impl plan. 
  // "若是多選標籤，將顯示符合所有標籤的內容（暫定）" -> Implementation Plan said AND (Intersection).

  const getFinalFilteredFavorites = (): FavoriteItem[] => {
    let result = favorites;

    // 1. Tag Filter (Priority)
    if (filterTags.length > 0) {
      result = result.filter(item => {
        if (!item.tagIds) return false;
        // Check if item has ALL selected tags
        return filterTags.every(tId => item.tagIds?.includes(tId));
      });
    }

    // 2. Category Filter
    if (filterCategory !== 'all') {
      if (filterCategory === 'uncategorized') {
        result = result.filter(f => !f.categoryId);
      } else {
        result = result.filter(f => f.categoryId === filterCategory);
      }
    }

    return result;
  };

  const filteredFavorites = getFinalFilteredFavorites();

  // 進入編輯模式
  const handleStartEdit = (favorite: FavoriteItem) => {
    setEditingId(favorite.id);
    setEditName(favorite.name);
    setEditCategory(favorite.categoryId || '');
    setEditTags(favorite.tagIds || []); // Use editTags state
  };

  // 取消編輯
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditCategory('');
    setEditTags([]);
  };

  // 保存編輯
  const handleSaveEdit = () => {
    if (!editingId) return;

    if (!window.favoriteStreams) {
      showMessage('error', t('favorites.systemNotInitialized') || '收藏系統未初始化');
      return;
    }

    const categoryId = editCategory === '' || editCategory === 'uncategorized' ? null : editCategory;

    // Call service directly to support tags
    const result = favoritesService.updateFavorite(editingId, {
      name: editName,
      categoryId: categoryId,
      tagIds: editTags // Use editTags state
    });

    if (result.success) {
      showMessage('success', result.message || '已更新收藏');
      handleCancelEdit();
      loadData();
      debouncedBackup();
    } else {
      showMessage('error', result.message || '更新失敗');
    }
  };

  // 刪除單個收藏
  const handleDeleteFavorite = (id: string) => {
    if (!window.favoriteStreams) {
      showMessage('error', t('favorites.systemNotInitialized') || '收藏系統未初始化');
      return;
    }

    if (!confirm(`${t('favorites.delete')}?`)) {
      return;
    }

    const result = window.favoriteStreams.remove!(id);
    if (result.success) {
      showMessage('success', result.message || t('favorites.delete'));
      loadData();

      // 刪除操作立即備份
      if (window.indexedDBBackup?.isEnabled()) {
        if (backupTimeout) {
          clearTimeout(backupTimeout);
        }
        window.indexedDBBackup.backup().catch(() => { });
      }
    } else {
      showMessage('error', result.message || t('favorites.delete')); // TODO: 更好的錯誤訊息
    }
  };

  // 載入單個收藏
  const handleLoadFavorite = async (id: string) => {
    if (!window.favoriteStreams) {
      showMessage('error', t('favorites.systemNotInitialized') || '收藏系統未初始化');
      return;
    }

    try {
      const favorite = favorites.find(f => f.id === id);
      if (!favorite) {
        showMessage('error', t('favorites.noFavorites')); // TODO: 更好的錯誤訊息
        return;
      }
      const result = await window.favoriteStreams.load(favorite);
      if (result.success) {
        showMessage('success', result.message || t('favorites.load'));
      } else {
        showMessage('error', result.message || '載入失敗'); // TODO: 翻譯
      }
    } catch (error) {
      showMessage('error', `${t('common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 添加分類
  const handleAddCategory = () => {
    if (!categoryName.trim()) {
      showMessage('error', t('favorites.categoryName'));
      return;
    }

    if (!window.favoriteCategories) {
      showMessage('error', '分類系統未初始化');
      return;
    }

    const result = window.favoriteCategories.add!(categoryName);
    if (result.success) {
      showMessage('success', result.message || '已新增分類');
      setCategoryName('');
      loadData();
      debouncedBackup();
    } else {
      showMessage('error', result.message || '新增失敗');
    }
  };

  // --- Tag Operations ---
  const handleAddTag = () => {
    if (!newTagName.trim()) {
      showMessage('error', '請輸入標籤名稱');
      return;
    }

    const newTag = tagsService.addTag(newTagName.trim(), newTagColor);
    showMessage('success', '已新增標籤');
    setNewTagName('');
    // tagsService.addTag updates repo, we need to reload or just update local state
    // loadData() will fetch from repo
    loadData();
  };

  const handleDeleteTag = (tagId: string) => {
    if (confirm('確定要刪除此標籤嗎？包含該標籤的收藏將會自動移除此標籤。')) {
      tagsService.removeTag(tagId);
      showMessage('success', '已刪除標籤');
      loadData();
    }
  };

  const handleUpdateTag = (tagId: string, name: string, color: string) => {
    tagsService.updateTag(tagId, { name, color });
    showMessage('success', '已更新標籤');
    setEditingTagId(null);
    loadData();
  };

  // 匯出JSON - 使用與正式版完全相同的格式
  const handleExportJSON = () => {
    try {
      // 優先使用 indexedDBBackup.getAllData() 確保格式完全一致
      let data;
      if ((window as any).indexedDBBackup && typeof (window as any).indexedDBBackup.getAllData === 'function') {
        data = (window as any).indexedDBBackup.getAllData();
      } else {
        // 如果沒有 indexedDBBackup，手動構建與 getAllData() 完全相同的格式
        const safeJSONParse = (str: string | null, defaultValue: any) => {
          if (!str || str === 'null') return defaultValue;
          try {
            return JSON.parse(str);
          } catch {
            return defaultValue;
          }
        };

        data = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          userSettings: safeJSONParse(localStorage.getItem('userSettings'), null),
          favoriteStreams: favorites,
          favoriteCategories: categories,
          controlPanelCollapsed: localStorage.getItem('controlPanelCollapsed'),
          multiStreamLayout: safeJSONParse(localStorage.getItem('multiStreamLayout'), null),
          adConfig: safeJSONParse(localStorage.getItem('adConfig'), null)
        };
      }

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // 檔案名稱改為與正式版一致
      a.download = `multistream-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage('success', '已匯出JSON檔案');
    } catch (error) {
      showMessage('error', `匯出失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 匯入JSON - 支持完整格式（與正式版 importFromJSON() 邏輯一致）
  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // 驗證格式：檢查是否有 version（完整格式）或 favoriteStreams（簡化格式，向後兼容）
        if (!data.version && (!data.favoriteStreams || !Array.isArray(data.favoriteStreams))) {
          showMessage('error', '匯入失敗：無效的檔案格式');
          return;
        }

        // 如果是完整格式（有 version），檢查是否需要覆蓋現有數據
        if (data.version && (window as any).indexedDBBackup?.hasLocalStorageData?.()) {
          // 可以添加確認對話框，這裡暫時直接匯入
          // 如果需要確認，可以使用 React Dialog 組件
        }

        if (!window.favoriteStreams || !window.favoriteCategories) {
          showMessage('error', '收藏系統未初始化');
          return;
        }

        let importedCount = 0;
        let skippedCount = 0;

        // 如果是完整格式（有 version），直接覆蓋 localStorage（與 restore() 和 importFromJSON() 完全一致）
        // 這樣可以確保 categoryId 被正確保留
        if (data.version) {
          // 這些與 js/settings.js 的 restore() 和 importFromJSON() 中的邏輯完全一致
          if (data.userSettings) {
            localStorage.setItem('userSettings', JSON.stringify(data.userSettings));
          }
          if (data.favoriteStreams && Array.isArray(data.favoriteStreams)) {
            localStorage.setItem('favoriteStreams', JSON.stringify(data.favoriteStreams));
            importedCount = data.favoriteStreams.length;
          }
          if (data.favoriteCategories && Array.isArray(data.favoriteCategories)) {
            localStorage.setItem('favoriteCategories', JSON.stringify(data.favoriteCategories));
          }
          if (data.controlPanelCollapsed !== undefined) {
            localStorage.setItem('controlPanelCollapsed', data.controlPanelCollapsed);
          }
          if (data.multiStreamLayout) {
            localStorage.setItem('multiStreamLayout', JSON.stringify(data.multiStreamLayout));
          }
          if (data.adConfig) {
            localStorage.setItem('adConfig', JSON.stringify(data.adConfig));
          }
        } else {
          // 簡化格式（向後兼容）：使用 add 方法逐個添加，但確保分類 ID 正確
          // 獲取現有收藏列表（用於檢測重複）
          const existingFavorites = window.favoriteStreams.getList();
          const existingUrls = new Set(existingFavorites.map(f => f.url));

          // 匯入分類（保留原始 ID）
          if (data.favoriteCategories && Array.isArray(data.favoriteCategories)) {
            const existingCategories = window.favoriteCategories.getList();
            const categoryMap = new Map(existingCategories.map(c => [c.id, c]));

            for (const cat of data.favoriteCategories) {
              if (cat.id && cat.name) {
                // 如果分類不存在，直接添加到列表中（保留原始 ID）
                if (!categoryMap.has(cat.id)) {
                  categoryMap.set(cat.id, {
                    id: cat.id,
                    name: cat.name,
                    createdAt: cat.createdAt || new Date().toISOString()
                  });
                }
              }
            }

            // 保存更新後的分類列表
            window.favoriteCategories.saveList!(Array.from(categoryMap.values()));
          }

          // 匯入收藏（檢測重複）
          if (data.favoriteStreams && Array.isArray(data.favoriteStreams)) {
            for (const fav of data.favoriteStreams) {
              if (fav.url && !existingUrls.has(fav.url)) {
                try {
                  const result = await window.favoriteStreams.add(
                    fav.url,
                    fav.name,
                    fav.categoryId || null,
                    fav.channelId
                  );
                  if (result.success) {
                    importedCount++;
                    existingUrls.add(fav.url);
                  } else {
                    skippedCount++;
                  }
                } catch (error) {
                  skippedCount++;
                }
              } else {
                skippedCount++;
              }
            }
          }
        }

        // 重新載入數據
        // 確保自動修復新匯入項目的平台標籤
        tagsService.initializeDefaults();
        loadData();

        // 觸發 favoritesUpdated 事件，通知 ControlPanel 更新收藏列表
        window.dispatchEvent(new CustomEvent('favoritesUpdated', {
          detail: {
            action: 'import',
            importedCount: importedCount,
            skippedCount: skippedCount
          }
        }));

        // 如果已啟用備份，立即備份到 IndexedDB（與 importFromJSON() 一致）
        if ((window as any).indexedDBBackup?.isEnabled()) {
          try {
            await (window as any).indexedDBBackup.backup();
          } catch (error) {
            // 備份失敗，靜默處理
          }
        }

        showMessage('success', `已匯入 ${importedCount} 個收藏${skippedCount > 0 ? `，跳過 ${skippedCount} 個重複項目` : ''}`);
      } catch (error) {
        showMessage('error', `匯入失敗: ${error instanceof Error ? error.message : 'JSON格式錯誤'}`);
      }
    };
    input.click();
  };

  // const filteredFavorites = getFilteredFavorites(); // Removed old declaration
  // const favoriteCount = filteredFavorites.length; // Use the one from getFinalFilteredFavorites
  const favoriteCount = filteredFavorites.length;

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
              <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('favorites.title')}</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {t('favorites.subtitle')}
              </p>
            </div>
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6 h-full flex flex-col">
            <TabsList className={`flex w-full justify-start overflow-x-auto whitespace-nowrap scrollbar-hide mb-6 p-1 rounded-lg flex-shrink-0 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <TabsTrigger value="favorites" className="flex-1 min-w-[100px]">{t('favorites.myFavorites')}</TabsTrigger>
              <TabsTrigger value="categories" className="flex-1 min-w-[100px]">{t('favorites.categoryManagement')}</TabsTrigger>
              <TabsTrigger value="tags" className="flex-1 min-w-[100px]">標籤管理</TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 min-w-[100px]">{t('favorites.settings')}</TabsTrigger>
            </TabsList>

            <TabsContent value="favorites" className="flex flex-col flex-1 min-h-0 space-y-4 overflow-y-auto">
              {/* Add Favorite */}
              <div className={`p-4 rounded-lg border flex-shrink-0 ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('favorites.addFavorite')}</h3>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder={t('favorites.pasteUrl')}
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFavorite()}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                  />
                  <Input
                    type="text"
                    placeholder={t('favorites.customName')}
                    value={streamName}
                    onChange={(e) => setStreamName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFavorite()}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                  />
                  <Select value={selectedCategory || "uncategorized"} onValueChange={(value) => setSelectedCategory(value === "uncategorized" ? "" : value)}>
                    <SelectTrigger className={`w-[140px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                      <SelectValue placeholder={t('favorites.uncategorized')} />
                    </SelectTrigger>
                    <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                      <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('favorites.uncategorized')}</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id} className={theme === 'dark' ? 'text-white' : 'text-black'}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Add Favorite Popover Tag Selector (Button Only) */}
                  <TagPopoverSelector
                    allTags={tags}
                    selectedTagIds={selectedTags}
                    onChange={setSelectedTags}
                    theme={theme}
                    showSelectedChips={false}
                  />

                  <MuiButton onClick={handleAddFavorite} color="secondary" variant="contained" sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}>
                    <Plus className="size-4 mr-2" />
                    {t('favorites.add')}
                  </MuiButton>
                </div>

                {/* Selected Tags Display (Below inputs) */}
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.filter(tag => selectedTags.includes(tag.id)).map(tag => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        onDelete={() => setSelectedTags(prev => prev.filter(id => id !== tag.id))}
                        className="cursor-pointer"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Batch Import */}
              <div className={`p-4 rounded-lg border flex-shrink-0 ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('favorites.batchImport')}</h3>
                <div className="space-y-3">
                  <Textarea
                    placeholder={t('favorites.batchImportPlaceholder')}
                    value={batchUrls}
                    onChange={(e) => setBatchUrls(e.target.value)}
                    style={{ height: '150px' }}
                    className={theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}
                    disabled={isImporting}
                  />
                  {isImporting && (
                    <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {t('common.loading')} {importProgress.current} / {importProgress.total}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Select value={batchCategory || "uncategorized"} onValueChange={(value) => setBatchCategory(value === "uncategorized" ? "" : value)} disabled={isImporting}>
                      <SelectTrigger className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                        <SelectValue placeholder={t('favorites.uncategorized')} />
                      </SelectTrigger>
                      <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                        <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('favorites.uncategorized')}</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id} className={theme === 'dark' ? 'text-white' : 'text-black'}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <MuiButton onClick={handleBatchImport} disabled={isImporting} color="secondary" variant="contained" sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}>
                      {isImporting ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                      {t('favorites.batchImport')}
                    </MuiButton>
                  </div>
                </div>
              </div>

              {/* Favorites List */}
              <div className={`p-4 rounded-lg border flex flex-col ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 flex-shrink-0 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('favorites.myFavorites')}({favoriteCount})</h3>

                <div className="flex gap-2 mb-4 flex-wrap flex-shrink-0">
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className={`w-[120px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                      <SelectItem value="all" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('favorites.all')}</SelectItem>
                      <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('favorites.uncategorized')}</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id} className={theme === 'dark' ? 'text-white' : 'text-black'}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <MuiButton
                    variant="outlined"
                    size="small"
                    onClick={handleSelectAll}
                    color="secondary"
                    sx={{
                      borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
                      color: theme === 'dark' ? '#d1d5db' : '#374151',
                      '&:hover': {
                        borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
                        backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                      },
                    }}
                  >
                    {t('favorites.selectAll')}
                  </MuiButton>
                  <MuiButton
                    variant="outlined"
                    size="small"
                    onClick={handleDeselectAll}
                    color="secondary"
                    sx={{
                      borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
                      color: theme === 'dark' ? '#d1d5db' : '#374151',
                      '&:hover': {
                        borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
                        backgroundColor: theme === 'dark' ? '#1f2937' : '#f3f4f6',
                      },
                    }}
                  >
                    {t('favorites.deselectAll')}
                  </MuiButton>
                  <MuiButton
                    size="small"
                    onClick={handleLoadSelected}
                    color="secondary"
                    variant="contained"
                    sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}
                  >
                    {t('favorites.loadSelected')}
                  </MuiButton>
                  <MuiButton
                    size="small"
                    onClick={handleBatchDelete}
                    color="error"
                    variant="contained"
                    onMouseEnter={() => setIsDeleteHovered(true)}
                    onMouseLeave={() => setIsDeleteHovered(false)}
                    sx={{
                      bgcolor: isDeleteHovered ? '#b91c1c' : '#dc2626',
                      '&:hover': {
                        bgcolor: '#b91c1c',
                      },
                    }}
                  >
                    {t('favorites.delete')}
                  </MuiButton>
                </div>

                {/* 標籤篩選 - 水平 Chip List (Moved below buttons) */}
                {tags.length > 0 && (
                  <div className="mb-2 w-full">
                    <div className={`text-sm mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      篩選:
                    </div>
                    <TagFilterLayout
                      tags={tags}
                      selectedTags={filterTags}
                      onToggleTag={(tagId) => {
                        setFilterTags(prev =>
                          prev.includes(tagId)
                            ? prev.filter(id => id !== tagId)
                            : [...prev, tagId]
                        );
                      }}
                      onClear={() => setFilterTags([])}
                      theme={theme}
                      columns={10}
                    />
                  </div>
                )}
                {/* 收藏列表 - 設置最大高度限制並增加滾動 */}
                <Box
                  sx={{
                    maxHeight: '350px',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    // 自定義滾動條樣式
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
                  {filteredFavorites.length === 0 ? (
                    <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      {t('favorites.noFavorites')}
                    </div>
                  ) : (
                    <div className="space-y-2 pr-4">
                      {filteredFavorites.map(favorite => (
                        <FavoriteItem
                          key={favorite.id}
                          favorite={favorite}
                          categories={categories}
                          tags={tags} // Passed tags
                          theme={theme}
                          isSelected={selectedFavorites.has(favorite.id)}
                          isEditing={editingId === favorite.id}
                          editName={editName}
                          editCategory={editCategory}
                          editTags={editTags} // Pass editTags
                          onSelect={(id, checked) => {
                            const newSelected = new Set(selectedFavorites);
                            if (checked) {
                              newSelected.add(id);
                            } else {
                              newSelected.delete(id);
                            }
                            setSelectedFavorites(newSelected);
                          }}
                          onStartEdit={handleStartEdit}
                          onCancelEdit={handleCancelEdit}
                          onSaveEdit={handleSaveEdit}
                          onEditNameChange={setEditName}
                          onEditCategoryChange={setEditCategory}
                          onEditTagsChange={setEditTags} // Pass setEditTags
                          onDelete={handleDeleteFavorite}
                          onLoad={handleLoadFavorite}
                        />
                      ))}
                    </div>
                  )}
                </Box>
              </div>

              {/* 資料儲存提示 - 在"我的收藏"區塊下方，綠色半透明玻璃效果 */}
              {message && message.type === 'success' && (
                <div className={`p-3 rounded-lg text-sm backdrop-blur-md flex-shrink-0 text-white ${theme === 'dark'
                  ? 'bg-green-500/20 border border-green-500/30 shadow-lg shadow-green-500/10'
                  : 'bg-green-500/20 border border-green-500/30 shadow-lg shadow-green-500/10'
                  }`}>
                  {message.text}
                </div>
              )}
            </TabsContent>

            <TabsContent value="categories" className="space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Add Category */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('favorites.addCategory')}</h3>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder={t('favorites.categoryName')}
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                  />
                  <MuiButton onClick={handleAddCategory} color="secondary" variant="contained" sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}>
                    <Plus className="size-4 mr-2" />
                    {t('common.add')}
                  </MuiButton>
                </div>
              </div>

              {/* Categories List */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('favorites.categoryManagement')}</h3>
                {categories.length === 0 ? (
                  <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                    {t('favorites.noCategories')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {categories.map(cat => {
                      const count = favorites.filter(f => f.categoryId === cat.id).length;
                      return (
                        <CategoryItem
                          key={cat.id}
                          category={cat}
                          count={count}
                          theme={theme}
                          onLoad={() => handleLoadCategory(cat.id)}
                          onUpdate={(id, newName) => {
                            if (window.favoriteCategories) {
                              const result = window.favoriteCategories.update!(id, newName);
                              if (result.success) {
                                showMessage('success', result.message || '已更新分類');
                                loadData();
                                debouncedBackup();
                              } else {
                                showMessage('error', result.message || '更新失敗');
                              }
                            }
                          }}
                          onDelete={(id) => {
                            if (window.favoriteCategories && window.favoriteCategories.remove) {
                              window.favoriteCategories.remove(id);
                              showMessage('success', '已刪除分類');
                              loadData();
                              debouncedBackup();
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tags" className="space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Add Tag */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>新增標籤</h3>
                <div className="flex gap-2 items-center">
                  <Input
                    type="text"
                    placeholder="標籤名稱"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                  />
                  <div className="flex items-center gap-2">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>顏色:</span>
                    <input
                      type="color"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      className="h-9 w-9 p-0 border-0 rounded cursor-pointer"
                    />
                  </div>
                  <MuiButton onClick={handleAddTag} color="secondary" variant="contained" sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}>
                    <Plus className="size-4 mr-2" />
                    {t('common.add')}
                  </MuiButton>
                </div>
              </div>

              {/* Tags List */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>標籤管理</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <div key={tag.id} className={`flex items-center gap-2 p-2 rounded border ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}>
                      {editingTagId === tag.id ? (
                        <>
                          <Input
                            value={tag.name}
                            onChange={(e) => {
                              const newTags = tags.map(t => t.id === tag.id ? { ...t, name: e.target.value } : t);
                              setTags(newTags); // Optimistic update
                            }}
                            className="h-8 w-24 text-xs"
                          />
                          <input
                            type="color"
                            value={tag.color}
                            onChange={(e) => {
                              const newTags = tags.map(t => t.id === tag.id ? { ...t, color: e.target.value } : t);
                              setTags(newTags);
                            }}
                            className="h-8 w-8 p-0 border-0 rounded"
                          />
                          <MuiButton size="small" onClick={() => handleUpdateTag(tag.id, tag.name, tag.color)} color="secondary" variant="contained">
                            <Check className="size-3" />
                          </MuiButton>
                          <MuiButton size="small" onClick={() => { setEditingTagId(null); loadData(); }} variant="outlined" color="secondary">
                            <X className="size-3" />
                          </MuiButton>
                        </>
                      ) : (
                        <>
                          <TagChip tag={tag} />
                          <MuiButton size="small" onClick={() => setEditingTagId(tag.id)} sx={{ minWidth: 30, padding: '4px' }}>
                            <Edit2 className="size-3 text-gray-400 hover:text-white" />
                          </MuiButton>
                          <MuiButton size="small" onClick={() => handleDeleteTag(tag.id)} sx={{ minWidth: 30, padding: '4px' }}>
                            <Trash2 className="size-3 text-red-400 hover:text-red-500" />
                          </MuiButton>
                        </>
                      )}
                    </div>
                  ))}
                  {tags.length === 0 && <div className="text-gray-500 text-sm">暫無標籤</div>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('favorites.backup')}</h3>
                <div className="space-y-3">
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('favorites.backupDescription')}
                  </p>
                  <div className="flex gap-2">
                    <MuiButton
                      onClick={handleExportJSON}
                      color="secondary"
                      variant="contained"
                      sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}
                    >
                      {t('favorites.exportJSON')}
                    </MuiButton>
                    <MuiButton
                      onClick={handleImportJSON}
                      color="secondary"
                      variant="contained"
                      sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}
                    >
                      {t('favorites.importJSON')}
                    </MuiButton>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div >
  );
}

// 收藏項目組件
function FavoriteItem({
  favorite,
  categories,
  tags, // Added tags prop
  theme,
  isSelected,
  isEditing,
  editName,
  editCategory,
  editTags,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditNameChange,
  onEditCategoryChange,
  onEditTagsChange,
  onDelete,
  onLoad
}: {
  favorite: FavoriteItem;
  categories: Category[];
  tags: Tag[]; // Added tags prop
  theme: 'light' | 'dark';
  isSelected: boolean;
  isEditing: boolean;
  editName: string;
  editCategory: string;
  editTags?: string[]; // Optional since existing usage might not pass it yet, but we are updating parent
  onSelect: (id: string, checked: boolean) => void;
  onStartEdit: (favorite: FavoriteItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditNameChange: (name: string) => void;
  onEditCategoryChange: (categoryId: string) => void;
  onEditTagsChange?: (tags: string[]) => void;
  onDelete: (id: string) => void;
  onLoad: (id: string) => void;
}) {
  const { t } = useI18n();
  const category = categories.find(c => c.id === favorite.categoryId);
  const platformIcon = favorite.platform === 'twitch' ? '🎮' : '📺';

  if (isEditing) {
    return (
      <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}>
        <div className="flex gap-2 mb-2">
          <Input
            type="text"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            className={`flex-1 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300 text-black'}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
          />
          <Select value={editCategory || "uncategorized"} onValueChange={(value) => onEditCategoryChange(value === "uncategorized" ? "" : value)}>
            <SelectTrigger className={`w-[140px] ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300 text-black'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
              <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('favorites.uncategorized')}</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id} className={theme === 'dark' ? 'text-white' : 'text-black'}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Edit Tags Popover Button (Inline) */}
          <TagPopoverSelector
            allTags={tags}
            selectedTagIds={editTags || []}
            onChange={onEditTagsChange || (() => { })}
            theme={theme}
            showSelectedChips={false}
          />
        </div>

        {/* Edit Tags Chips (Below) */}
        {(editTags || []).length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {tags.filter(tag => (editTags || []).includes(tag.id)).map(tag => (
              <TagChip
                key={tag.id}
                tag={tag}
                onDelete={() => {
                  if (onEditTagsChange && editTags) {
                    onEditTagsChange(editTags.filter(id => id !== tag.id));
                  }
                }}
                className="cursor-pointer"
              />
            ))}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <MuiButton size="small" onClick={onSaveEdit} color="secondary" variant="contained" sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}>
            <Check className="size-3 mr-1" />
            {t('favorites.save')}
          </MuiButton>
          <MuiButton size="small" onClick={onCancelEdit} variant="outlined" color="secondary" sx={{
            borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
            color: theme === 'dark' ? '#d1d5db' : '#374151',
            '&:hover': {
              borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
            },
          }}>
            <X className="size-3 mr-1" />
            {t('favorites.cancel')}
          </MuiButton>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} flex items-center gap-3`}>
      <Checkbox
        checked={isSelected}
        onChange={(e) => onSelect(favorite.id, e.target.checked)}
        sx={{
          color: theme === 'dark' ? '#9ca3af' : '#4b5563',
          '&.Mui-checked': {
            color: theme === 'dark' ? '#a855f7' : '#9333ea',
          },
        }}
      />
      <span className="text-lg">{platformIcon}</span>
      {favorite.isLive !== null && (
        <div
          className={`w-2 h-2 rounded-full ${favorite.isLive === true ? 'bg-green-500' : 'bg-gray-500'
            }`}
          title={favorite.isLive === true ? t('favorites.live') : t('favorites.offline')}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
          {favorite.name}
        </div>
        <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
          <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            📁 {category?.name || t('favorites.uncategorized')}
          </span>
          {/* Tags Display */}
          {favorite.tagIds && favorite.tagIds.length > 0 && (
            <TagList
              tags={tags.filter(t => favorite.tagIds?.includes(t.id))}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <MuiButton
          size="small"
          variant="text"
          onClick={() => onStartEdit(favorite)}
          color="secondary"
          title={t('favorites.edit')}
          sx={{
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            '&:hover': {
              color: theme === 'dark' ? '#ffffff' : '#000000',
              backgroundColor: 'transparent',
            },
          }}
        >
          <Edit2 className="size-4" />
        </MuiButton>
        <MuiButton
          size="small"
          variant="text"
          onClick={() => onLoad(favorite.id)}
          color="secondary"
          title={t('favorites.addStream')}
          sx={{
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            '&:hover': {
              color: theme === 'dark' ? '#ffffff' : '#000000',
              backgroundColor: 'transparent',
            },
          }}
        >
          <Play className="size-4" />
        </MuiButton>
        <MuiButton
          size="small"
          variant="text"
          onClick={() => onDelete(favorite.id)}
          color="error"
          title={t('favorites.delete')}
          sx={{
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            '&:hover': {
              color: theme === 'dark' ? '#f87171' : '#dc2626',
              backgroundColor: 'transparent',
            },
          }}
        >
          <Trash2 className="size-4" />
        </MuiButton>
      </div>
    </div>
  );
}

// 分類項目組件
function CategoryItem({
  category,
  count,
  theme,
  onLoad,
  onUpdate,
  onDelete
}: {
  category: Category;
  count: number;
  theme: 'light' | 'dark';
  onLoad: () => void;
  onUpdate: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);

  const handleSave = () => {
    if (editName.trim()) {
      onUpdate(category.id, editName.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditName(category.name);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} flex items-center gap-2`}>
        <Input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className={`flex-1 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300 text-black'}`}
          autoFocus
        />
        <MuiButton size="small" onClick={handleSave} color="secondary" variant="contained" sx={{ bgcolor: '#9333ea', '&:hover': { bgcolor: '#7e22ce' } }}>
          <Check className="size-3" />
        </MuiButton>
        <MuiButton size="small" onClick={handleCancel} variant="outlined" color="secondary" sx={{
          borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
          color: theme === 'dark' ? '#d1d5db' : '#374151',
          '&:hover': {
            borderColor: theme === 'dark' ? '#374151' : '#d1d5db',
          },
        }}>
          <X className="size-3" />
        </MuiButton>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-900 hover:bg-gray-800' : 'bg-white hover:bg-gray-50'} transition-colors`}>
      <div className="flex items-center gap-3">
        <Folder className={`size-5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
        <div>
          <p className={theme === 'dark' ? 'text-white' : 'text-black'}>{category.name}</p>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{count} {t('favorites.streams')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <MuiButton
          variant="text"
          size="small"
          onClick={onLoad}
          color="secondary"
          title={t('favorites.loadCategory')}
          disabled={count === 0}
          sx={{
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            '&:hover': {
              color: theme === 'dark' ? '#a855f7' : '#9333ea',
              backgroundColor: 'transparent',
            },
          }}
        >
          <Play className="size-4" />
        </MuiButton>
        <MuiButton
          variant="text"
          size="small"
          onClick={() => setIsEditing(true)}
          color="secondary"
          title={t('favorites.edit')}
          sx={{
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            '&:hover': {
              color: theme === 'dark' ? '#ffffff' : '#000000',
              backgroundColor: 'transparent',
            },
          }}
        >
          <Edit2 className="size-4" />
        </MuiButton>
        <MuiButton
          variant="text"
          size="small"
          onClick={() => {
            if (confirm(t('favorites.delete') + ` "${category.name}"?`)) {
              onDelete(category.id);
            }
          }}
          title={t('favorites.delete')}
          color="error"
          sx={{
            color: theme === 'dark' ? '#9ca3af' : '#4b5563',
            '&:hover': {
              color: theme === 'dark' ? '#f87171' : '#dc2626',
              backgroundColor: 'transparent',
            },
          }}
        >
          <Trash2 className="size-4" />
        </MuiButton>
      </div>
    </div>
  );
}
