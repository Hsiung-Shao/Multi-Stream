import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { X, Plus, Trash2, Edit2, Star, Folder, Play, Check, Loader2, Gamepad2, Youtube } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { useTranslation } from 'react-i18next';
import { TagList } from './ui/TagList';
import { TagChip } from './ui/TagChip';
import { TagPopoverSelector } from './ui/TagPopoverSelector';
import { TagFilterLayout } from './ui/TagFilterLayout';
import { tagsService } from '../features/favorites/TagsService';
import { favoritesService } from '../features/favorites/FavoritesService';
import { favoritesLoader } from '../features/favorites/FavoritesLoader';
import { backupService } from '../features/backup/index';

import type { FavoriteStream, FavoriteCategory as Category, Tag } from '../features/favorites/types';

interface FavoritesManagerProps {
  theme: 'light' | 'dark';
  onClose: () => void;
}

interface AddStreamFormValues {
  url: string;
  name: string;
  categoryId: string;
  tagIds: string[];
}

interface BatchImportFormValues {
  urls: string;
  categoryId: string;
}

interface AddCategoryFormValues {
  name: string;
}

interface TagFormValues {
  name: string;
  color: string;
}

interface EditStreamFormValues {
  name: string;
  categoryId: string;
  tagIds: string[];
}

// 防抖備份函數（2秒）
let backupTimeout: NodeJS.Timeout | null = null;
function debouncedBackup() {
  if (backupTimeout) {
    clearTimeout(backupTimeout);
  }
  backupTimeout = setTimeout(() => {
    if (backupService.isEnabled()) {
      backupService.backup().catch(() => {
        // 備份錯誤，靜默處理
      });
    }
  }, 2000); // 2秒後備份
}

export function FavoritesManager({ theme, onClose }: FavoritesManagerProps) {
  const { t } = useTranslation(['favorites', 'common', 'tags']);

  const { register: registerAddStream, handleSubmit: handleSubmitAddStream, control: controlAddStream, reset: resetAddStream, setValue: setAddStreamValue, watch: watchAddStream } = useForm<AddStreamFormValues>({
    defaultValues: {
      url: '',
      name: '',
      categoryId: 'uncategorized',
      tagIds: []
    }
  });

  // Watch values for UI display if needed
  const selectedTags = watchAddStream('tagIds');

  const { register: registerBatchImport, handleSubmit: handleSubmitBatchImport, control: controlBatchImport, reset: resetBatchImport } = useForm<BatchImportFormValues>({
    defaultValues: {
      urls: '',
      categoryId: 'uncategorized'
    }
  });

  const { register: registerAddCategory, handleSubmit: handleSubmitAddCategory, reset: resetAddCategory } = useForm<AddCategoryFormValues>({
    defaultValues: { name: '' }
  });

  const { register: registerAddTag, handleSubmit: handleSubmitAddTag, reset: resetAddTag } = useForm<TagFormValues>({
    defaultValues: { name: '', color: '#3b82f6' }
  });
  const [filterCategory, setFilterCategory] = useState('all');

  const { register: registerEditStream, handleSubmit: handleSubmitEditStream, control: controlEditStream, reset: resetEditStream } = useForm<EditStreamFormValues>();

  const [favorites, setFavorites] = useState<FavoriteStream[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedFavorites, setSelectedFavorites] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('favorites');
  const [tags, setTags] = useState<Tag[]>([]);

  const [filterTags, setFilterTags] = useState<string[]>([]); // For filtering

  const [editingTagId, setEditingTagId] = useState<string | null>(null);

  // 載入收藏和分類列表
  const loadData = useCallback(() => {
    try {
      const favoritesList = favoritesService.getFavorites();
      const categoriesList = favoritesService.getCategories();
      const tagsList = tagsService.getAllTags();
      setFavorites(favoritesList);
      setCategories(categoriesList);
      setTags(tagsList);
    } catch (error) {
      // 載入數據時發生錯誤，繼續處理
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

  // 添加單個收藏 - Wrapped in form submission
  const onSubmitAddStream = async (data: AddStreamFormValues) => {
    try {
      const categoryId = data.categoryId === '' || data.categoryId === 'uncategorized' ? null : data.categoryId;

      // 嚴格保留原本的 service 調用方式，確保 YouTube 邏輯不變
      const result = await favoritesService.addFavorite(
        data.url,
        data.name || undefined,
        categoryId,
        undefined, // providedChannelId
        undefined, // providedVideoId
        data.tagIds
      );

      if (result.success) {
        showMessage('success', result.message || t('add'));
        // Reset form
        resetAddStream({
          url: '',
          name: '',
          categoryId: 'uncategorized',
          tagIds: []
        });
        loadData();
        debouncedBackup();
      } else {
        showMessage('error', result.message || t('addFailed') || '加入失敗');
      }
    } catch (error) {
      showMessage('error', `${t('common:common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 批量匯入 - Wrapped in form submission
  const onSubmitBatchImport = async (data: BatchImportFormValues) => {
    setIsImporting(true);
    setImportProgress({ current: 0, total: 0 });

    try {
      // 解析URL列表（支援逗號、換行、空格分隔）
      const urlList = data.urls
        .split(/[,\n\r]+/)
        .map(url => url.trim())
        .filter(url => url.length > 0);

      if (urlList.length === 0) {
        showMessage('error', t('noValidUrls') || '未找到有效的網址');
        setIsImporting(false);
        return;
      }

      setImportProgress({ current: 0, total: urlList.length });

      const categoryId = data.categoryId === '' || data.categoryId === 'uncategorized' ? null : data.categoryId;
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];

      // 逐個處理URL
      for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];
        setImportProgress({ current: i + 1, total: urlList.length });

        try {
          // 嚴格保留原本的 service 調用方式
          const result = await favoritesService.addFavorite(
            url,
            undefined, // name
            categoryId,
            undefined, // providedChannelId
            undefined, // providedVideoId
            [] // tags - Batch import generally doesn't assign tags in this UI
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

      // Reset form
      resetBatchImport({
        urls: '',
        categoryId: 'uncategorized'
      });

      if (successCount > 0) {
        // 確保自動修復新匯入項目的平台標籤
        tagsService.initializeDefaults();
        loadData();
        debouncedBackup();
        const successMsg = failCount > 0
          ? t('batchImportSuccessWithFail')?.replace('{success}', successCount.toString()).replace('{fail}', failCount.toString()) || `成功匯入 ${successCount} 個收藏，失敗 ${failCount} 個`
          : t('batchImportSuccess')?.replace('{success}', successCount.toString()) || `成功匯入 ${successCount} 個收藏`;
        showMessage('success', successMsg);
        // 匯入成功後切換到"我的收藏"標籤頁
        setActiveTab('favorites');
      } else {
        showMessage('error', t('batchImportFailed') || `匯入失敗: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`);
      }
    } catch (error) {
      setIsImporting(false);
      showMessage('error', t('batchImportError') || `匯入錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 批量刪除
  const handleBatchDelete = () => {
    if (selectedFavorites.size === 0) {
      showMessage('error', '請選擇要刪除的收藏');
      return;
    }

    if (!confirm(`確定要刪除選中的 ${selectedFavorites.size} 個收藏嗎？`)) {
      return;
    }

    let deletedCount = 0;
    selectedFavorites.forEach(id => {
      const result = favoritesService.removeFavorite(id);
      if (result.success) {
        deletedCount++;
      }
    });

    setSelectedFavorites(new Set());
    loadData();

    // 刪除操作立即備份
    if (backupService.isEnabled()) {
      if (backupTimeout) {
        clearTimeout(backupTimeout);
      }
      backupService.backup().catch(() => { });
    }

    showMessage('success', `${t('delete')} ${deletedCount} ${t('myFavorites')}`);
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
      showMessage('error', t('loadSelected'));
      return;
    }

    try {
      const selectedItems = favorites.filter(f => selectedFavorites.has(f.id));
      const result = await favoritesLoader.loadMultiple(selectedItems);
      if (result.success) {
        showMessage('success', result.message || t('loadSelected'));
      } else {
        showMessage('error', result.message || t('common:common.error'));
      }
    } catch (error) {
      showMessage('error', `${t('common:common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 載入分類中的所有收藏
  const handleLoadCategory = async (categoryId: string) => {
    const categoryFavorites = favorites.filter(f => f.categoryId === categoryId);

    if (categoryFavorites.length === 0) {
      showMessage('error', t('noFavorites'));
      return;
    }

    try {
      const result = await favoritesLoader.loadMultiple(categoryFavorites);
      if (result.success) {
        const category = categories.find(c => c.id === categoryId);
        showMessage('success', result.message || `${t('loadCategory')}: ${category?.name || categoryId}`);
      } else {
        showMessage('error', result.message || t('common:common.error'));
      }
    } catch (error) {
      showMessage('error', `${t('common:common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 獲取過濾後的收藏列表
  const getFilteredFavorites = (): FavoriteStream[] => {
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

  const getFinalFilteredFavorites = (): FavoriteStream[] => {
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
  const handleStartEdit = (favorite: FavoriteStream) => {
    setEditingId(favorite.id);
    resetEditStream({
      name: favorite.name,
      categoryId: favorite.categoryId || 'uncategorized',
      tagIds: favorite.tagIds || []
    });
  };

  // 取消編輯
  const handleCancelEdit = () => {
    setEditingId(null);
    resetEditStream();
  };

  // 保存編輯 - Wrapped in form submission
  const onSubmitEditStream = (data: EditStreamFormValues) => {
    if (!editingId) return;

    if (!data.name.trim()) {
      showMessage('error', t('customName'));
      return;
    }

    const categoryId = data.categoryId === 'uncategorized' ? null : data.categoryId;

    // Call service directly to support tags
    const result = favoritesService.updateFavorite(editingId, {
      name: data.name,
      categoryId: categoryId,
      tagIds: data.tagIds
    });

    if (result.success) {
      showMessage('success', `${result.message || t('common:common.save') + t('common:common.success')}`);
      handleCancelEdit();
      loadData();
      debouncedBackup();
    } else {
      showMessage('error', `${result.message || t('common:common.save') + t('common:common.error')}`);
    }
  };

  // 刪除單個收藏
  const handleDeleteFavorite = (id: string) => {
    const result = favoritesService.removeFavorite(id);
    if (result.success) {
      showMessage('success', result.message || t('delete'));
      loadData();

      // 刪除操作立即備份
      if (backupService.isEnabled()) {
        if (backupTimeout) {
          clearTimeout(backupTimeout);
        }
        backupService.backup().catch(() => { });
      }
    } else {
      showMessage('error', result.message || t('delete'));
    }
  };

  // 載入單個收藏
  const handleLoadFavorite = async (id: string) => {
    try {
      const favorite = favorites.find(f => f.id === id);
      if (!favorite) {
        showMessage('error', t('noFavorites'));
        return;
      }
      const result = await favoritesLoader.load(favorite);
      if (result.success) {
        showMessage('success', result.message || t('load'));
      } else {
        showMessage('error', result.message || t('common:common.error'));
      }
    } catch (error) {
      showMessage('error', `${t('common:common.error')}: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 添加分類 - Wrapped in form submission
  const onSubmitAddCategory = (data: AddCategoryFormValues) => {
    if (!data.name.trim()) {
      showMessage('error', t('categoryName'));
      return;
    }

    const result = favoritesService.addCategory(data.name);
    if (result.success) {
      showMessage('success', result.message || t('addCategory'));
      resetAddCategory();
      loadData();
      debouncedBackup();
    } else {
      showMessage('error', result.message || t('addCategory') + t('common:common.error'));
    }
  };

  // --- Tag Operations ---
  const onSubmitAddTag = (data: TagFormValues) => {
    if (!data.name.trim()) {
      showMessage('error', '請輸入標籤名稱');
      return;
    }

    tagsService.addTag(data.name.trim(), data.color);
    showMessage('success', t('tags:addTag'));
    resetAddTag();
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
      // 優先使用 backupService.getAllData() 確保格式完全一致
      let data;
      if (backupService && typeof backupService.getAllData === 'function') {
        data = backupService.getAllData();
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
        if (data.version && backupService.hasLocalStorageData()) {
          // 可以添加確認對話框，這裡暫時直接匯入
        }

        let importedCount = 0;
        let skippedCount = 0;

        // 如果是完整格式（有 version），直接覆蓋 localStorage（與 restore() 和 importFromJSON() 完全一致）
        // 這樣可以確保 categoryId 被正確保留
        if (data.version) {
          if (data.userSettings) {
            localStorage.setItem('userSettings', JSON.stringify(data.userSettings));
          }
          if (data.favoriteStreams && Array.isArray(data.favoriteStreams)) {
            favoritesService.saveFavorites(data.favoriteStreams);
            importedCount = data.favoriteStreams.length;
          }
          if (data.favoriteCategories && Array.isArray(data.favoriteCategories)) {
            favoritesService.saveCategories(data.favoriteCategories);
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
          const existingFavorites = favoritesService.getFavorites();
          const existingUrls = new Set(existingFavorites.map(f => f.url));

          // 匯入分類（保留原始 ID）
          if (data.favoriteCategories && Array.isArray(data.favoriteCategories)) {
            const existingCategories = favoritesService.getCategories();
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
            favoritesService.saveCategories(Array.from(categoryMap.values()));
          }

          // ?臬?嗉?嚗炎皜祇?銴?
          if (data.favoriteStreams && Array.isArray(data.favoriteStreams)) {
            for (const fav of data.favoriteStreams) {
              if (fav.url && !existingUrls.has(fav.url)) {
                try {
                  const result = await favoritesService.addFavorite(
                    fav.url,
                    fav.name,
                    fav.categoryId || null,
                    fav.channelId,
                    undefined,
                    []
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

        // ?頛?豢?
        // 蝣箔??芸?靽桀儔?啣?仿??桃?撟喳璅惜
        tagsService.initializeDefaults();
        loadData();

        // 閫貊 favoritesUpdated 鈭辣嚗 ControlPanel ?湔?嗉??”
        window.dispatchEvent(new CustomEvent('favoritesUpdated', {
          detail: {
            action: 'import',
            importedCount: importedCount,
            skippedCount: skippedCount
          }
        }));

        // 憒?撌脣??典?隞踝?蝡?遢??IndexedDB嚗? importFromJSON() 銝?湛?
        if (backupService.isEnabled()) {
          try {
            await backupService.backup();
          } catch (error) {
            // ?遢憭望?嚗?暺???
          }
        }

        showMessage('success', t('favorites:batchImportSuccessWithFail', { success: importedCount, fail: skippedCount }));
      } catch (error) {
        showMessage('error', t('favorites:batchImportError') + `: ${error instanceof Error ? error.message : 'JSON Parsing Error'}`);
      }
    };
    input.click();
  };

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
              <h2 className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('title')}</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                {t('subtitle')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className={`h-8 w-8 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-transparent' : 'text-gray-600 hover:text-black hover:bg-transparent'}`}
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="p-6 h-full flex flex-col">
            <TabsList className={`flex w-full justify-start overflow-x-auto whitespace-nowrap scrollbar-hide mb-6 p-1 rounded-lg flex-shrink-0 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <TabsTrigger value="favorites" className="flex-1 min-w-[100px]">{t('myFavorites')}</TabsTrigger>
              <TabsTrigger value="categories" className="flex-1 min-w-[100px]">{t('categoryManagement')}</TabsTrigger>
              <TabsTrigger value="tags" className="flex-1 min-w-[100px]">{t('tags:addTag')}</TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 min-w-[100px]">{t('settings')}</TabsTrigger>
            </TabsList>

            <TabsContent value="favorites" className="flex flex-col flex-1 min-h-0 space-y-4 overflow-y-auto">
              {/* Add Favorite */}
              <div className={`p-4 rounded-lg border flex-shrink-0 ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('addFavorite')}</h3>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder={t('pasteUrl')}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                    {...registerAddStream('url', { required: true })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitAddStream(onSubmitAddStream)()}
                  />
                  <Input
                    type="text"
                    placeholder={t('customName')}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                    {...registerAddStream('name')}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitAddStream(onSubmitAddStream)()}
                  />

                  <Controller
                    name="categoryId"
                    control={controlAddStream}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className={`w-[140px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                          <SelectValue placeholder={t('uncategorized')} />
                        </SelectTrigger>
                        <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                          <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('uncategorized')}</SelectItem>
                          {categories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id} className={theme === 'dark' ? 'text-white' : 'text-black'}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />

                  {/* Add Favorite Popover Tag Selector (Button Only) */}
                  <Controller
                    name="tagIds"
                    control={controlAddStream}
                    render={({ field }) => (
                      <TagPopoverSelector
                        allTags={tags}
                        selectedTagIds={field.value}
                        onChange={field.onChange}
                        theme={theme}
                        showSelectedChips={false}
                      />
                    )}
                  />

                  <Button onClick={handleSubmitAddStream(onSubmitAddStream)} className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Plus className="size-4 mr-2" />
                    {t('add')}
                  </Button>
                </div>

                {/* Selected Tags Display (Below inputs) */}
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.filter(tag => selectedTags.includes(tag.id)).map(tag => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        onDelete={() => {
                          const current = selectedTags;
                          setAddStreamValue('tagIds', current.filter(id => id !== tag.id));
                        }}
                        className="cursor-pointer"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Batch Import */}
              <div className={`p-4 rounded-lg border flex-shrink-0 ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('batchImport')}</h3>
                <div className="space-y-3">
                  <Textarea
                    placeholder={t('batchImportPlaceholder')}
                    className={`min-h-[100px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                    {...registerBatchImport('urls', { required: true })}
                    disabled={isImporting}
                  />
                  {isImporting && (
                    <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {t('common:common.loading')} {importProgress.current} / {importProgress.total}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Controller
                      name="categoryId"
                      control={controlBatchImport}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange} disabled={isImporting}>
                          <SelectTrigger className={`w-[180px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                            <SelectValue placeholder={t('category')} />
                          </SelectTrigger>
                          <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                            <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('uncategorized')}</SelectItem>
                            {categories.map(cat => (
                              <SelectItem key={cat.id} value={cat.id} className={theme === 'dark' ? 'text-white' : 'text-black'}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />

                    <Button
                      onClick={handleSubmitBatchImport(onSubmitBatchImport)}
                      disabled={isImporting}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />
                          {t('common:common.loading')} ({importProgress.current}/{importProgress.total})
                        </>
                      ) : (
                        <>
                          <Folder className="size-4 mr-2" />
                          {t('batchImportButton')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Favorites List */}
              <div className={`p-4 rounded-lg border flex flex-col ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 flex-shrink-0 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('myFavorites')}({favoriteCount})</h3>

                <div className="flex gap-2 mb-4 flex-wrap flex-shrink-0">
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className={`w-[120px] ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                      <SelectItem value="all" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('all')}</SelectItem>
                      <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('uncategorized')}</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id} className={theme === 'dark' ? 'text-white' : 'text-black'}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}
                  >
                    {t('selectAll')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeselectAll}
                    className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}
                  >
                    {t('deselectAll')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleLoadSelected}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {t('loadSelected')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBatchDelete}
                    className="bg-red-600 hover:bg-red-700 text-white"

                  >
                    {t('delete')}
                  </Button>
                </div>

                {/* Tag Filter (Chip List) */}
                {tags.length > 0 && (
                  <div className="mb-2 w-full">
                    <div className={`text-sm mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      {t('tags:filterTitle')}:
                    </div>
                    <TagFilterLayout
                      tags={tags}
                      selectedTags={filterTags}
                      onToggleTag={(tagId: string) => {
                        setFilterTags(prev =>
                          prev.includes(tagId)
                            ? prev.filter(id => id !== tagId)
                            : [...prev, tagId]
                        );
                      }}
                      onClear={() => setFilterTags([])}
                      theme={theme}
                      maxVisibleTags={10}

                    />
                  </div>
                )}
                {/* Favorites List Item Container */}
                <div
                  className="max-h-[350px] overflow-y-auto overflow-x-hidden"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: theme === 'dark' ? '#6b7280 #374151' : '#9ca3af #f3f4f6'
                  }}
                >
                  {filteredFavorites.length === 0 ? (
                    <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                      {t('noFavorites')}
                    </div>
                  ) : (
                    <div className="space-y-2 pr-4">
                      {
                        filteredFavorites.map(favorite => (
                          <FavoriteItem
                            key={favorite.id}
                            favorite={favorite}
                            categories={categories}
                            tags={tags}
                            theme={theme}
                            isSelected={selectedFavorites.has(favorite.id)}
                            isEditing={editingId === favorite.id}
                            control={controlEditStream}
                            register={registerEditStream}
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
                            onSaveEdit={handleSubmitEditStream(onSubmitEditStream)}
                            onDelete={handleDeleteFavorite}
                            onLoad={handleLoadFavorite}
                          />
                        ))
                      }
                    </div >
                  )}
                </div >
              </div >

              {/* Success Message Display */}
              {
                message && message.type === 'success' && (
                  <div className={`p-3 rounded-lg text-sm backdrop-blur-md flex-shrink-0 text-white ${theme === 'dark'
                    ? 'bg-green-500/20 border border-green-500/30 shadow-lg shadow-green-500/10'
                    : 'bg-green-500/20 border border-green-500/30 shadow-lg shadow-green-500/10'
                    }`}>
                    {message.text}
                  </div>
                )
              }
            </TabsContent >

            <TabsContent value="categories" className="space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Add Category */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('addCategory')}</h3>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder={t('categoryName')}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                    {...registerAddCategory('name', { required: true })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitAddCategory(onSubmitAddCategory)()}
                  />
                  <Button onClick={handleSubmitAddCategory(onSubmitAddCategory)} className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Plus className="size-4 mr-2" />
                    {t('common:common.add')}
                  </Button>
                </div>
              </div>

              {/* Categories List */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('categoryManagement')}</h3>
                {categories.length === 0 ? (
                  <div className={`py-8 text-center text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                    {t('noCategories')}
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
                            const result = favoritesService.updateCategory(id, newName);
                            if (result.success) {
                              showMessage('success', result.message || t('common:common.success'));
                              loadData();
                              debouncedBackup();
                            } else {
                              showMessage('error', result.message || t('common:common.error'));
                            }
                          }}
                          onDelete={(id) => {
                            const result = favoritesService.removeCategory(id);
                            if (result.success) {
                              showMessage('success', t('common:common.success'));
                              loadData();
                              debouncedBackup();
                            } else {
                              showMessage('error', result.message || t('common:common.error'));
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
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('tags:addTag')}</h3>
                <div className="flex gap-2 items-center">
                  <Input
                    type="text"
                    placeholder={t('tags:tagName') || '標籤名稱'}
                    className={`flex-1 ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-black'}`}
                    {...registerAddTag('name', { required: true })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitAddTag(onSubmitAddTag)()}
                  />
                  <div className="flex items-center gap-2">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>{t('tags:color') || '顏色'}:</span>
                    <input
                      type="color"
                      className="h-9 w-9 p-0 border-0 rounded cursor-pointer"
                      {...registerAddTag('color')}
                    />
                  </div>
                  <Button onClick={handleSubmitAddTag(onSubmitAddTag)} className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Plus className="size-4 mr-2" />
                    {t('common:common.add')}
                  </Button>
                </div>
              </div>

              {/* Tags List */}
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('tags:tagList') || '標籤列表'}</h3>
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
                          <Button size="icon" className="h-6 w-6" onClick={() => handleUpdateTag(tag.id, tag.name, tag.color)}>
                            <Check className="size-3" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => { setEditingTagId(null); loadData(); }}>
                            <X className="size-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <TagChip tag={tag} />
                          <Button size="icon" variant="ghost" className="h-7 w-7 p-1" onClick={() => setEditingTagId(tag.id)}>
                            <Edit2 className="size-3 text-gray-400 hover:text-white" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 p-1" onClick={() => handleDeleteTag(tag.id)}>
                            <Trash2 className="size-3 text-red-400 hover:text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                  {tags.length === 0 && <div className="text-gray-500 text-sm">{t('tags:noTagsFound')}</div>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`mb-4 ${theme === 'dark' ? 'text-white' : 'text-black'}`}>{t('backup')}</h3>
                <div className="space-y-3">
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {t('backupDescription')}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleExportJSON}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {t('exportJSON')}
                    </Button>
                    <Button
                      onClick={handleImportJSON}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {t('importJSON')}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs >
        </div >
      </div >
    </div >
  );
}

// Favorite Item Component
function FavoriteItem({
  favorite,
  categories,
  tags,
  theme,
  isSelected,
  isEditing,
  control,
  register,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onLoad
}: {
  favorite: FavoriteStream;
  categories: Category[];
  tags: Tag[];
  theme: 'light' | 'dark';
  isSelected: boolean;
  isEditing: boolean;
  control: any;
  register: any;
  onSelect: (id: string, checked: boolean) => void;
  onStartEdit: (favorite: FavoriteStream) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (id: string) => void;
  onLoad: (id: string) => void;
}) {
  const { t } = useTranslation(['favorites', 'common']);
  const category = categories.find(c => c.id === favorite.categoryId);

  if (isEditing) {
    return (
      <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}>
        <div className="flex gap-2 mb-2">
          <Input
            type="text"
            className={`flex-1 ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300 text-black'}`}
            {...register('name', { required: true })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
          />

          <Controller
            name="categoryId"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className={`w-[140px] ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300 text-black'}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}>
                  <SelectItem value="uncategorized" className={theme === 'dark' ? 'text-white' : 'text-black'}>{t('uncategorized')}</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id} className={theme === 'dark' ? 'text-white' : 'text-black'}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          {/* Edit Tags Popover Button (Inline) */}
          <Controller
            name="tagIds"
            control={control}
            render={({ field }) => (
              <TagPopoverSelector
                allTags={tags}
                selectedTagIds={field.value}
                onChange={field.onChange}
                theme={theme}
                showSelectedChips={false}
              />
            )}
          />
        </div>

        {/* Edit Tags Chips (Below) */}
        <Controller
          name="tagIds"
          control={control}
          render={({ field }) => (
            <>
              {(field.value || []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {tags.filter(tag => (field.value || []).includes(tag.id)).map(tag => (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      onDelete={() => {
                        const current = field.value || [];
                        field.onChange(current.filter((id: string) => id !== tag.id));
                      }}
                      className="cursor-pointer"
                    />
                  ))}
                </div>
              )}
            </>
          )}
        />

        <div className="flex gap-2 justify-end">
          <Button size="sm" onClick={onSaveEdit} className="bg-purple-600 hover:bg-purple-700 text-white">
            <Check className="size-3 mr-1" />
            {t('save')}
          </Button>
          <Button size="sm" onClick={onCancelEdit} variant="outline" className={theme === 'dark' ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}>
            <X className="size-3 mr-1" />
            {t('cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'} flex items-center gap-3`}>
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked: boolean | 'indeterminate') => onSelect(favorite.id, !!checked)}
        className={theme === 'dark' ? 'border-gray-500 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500' : 'border-gray-400 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600'}
      />
      <span className="text-lg">
        {favorite.platform === 'twitch' ? (
          <Gamepad2 className="size-4" style={{ color: '#9146ff' }} />
        ) : (
          <Youtube className="size-4" style={{ color: '#FF0000' }} />
        )}
      </span>
      {favorite.isLive !== null && (
        <div
          className={`w-2 h-2 rounded-full ${favorite.isLive === true ? 'bg-green-500' : 'bg-gray-500'
            }`}
          title={favorite.isLive === true ? t('live') : t('offline')}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
          {favorite.name}
        </div>
        <div className="flex items-center gap-2 text-xs mt-1 flex-wrap">
          <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
            {category?.name || t('uncategorized')}
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
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onStartEdit(favorite)}
          title={t('edit')}
          className={`h-8 w-8 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-transparent' : 'text-gray-600 hover:text-black hover:bg-transparent'}`}
        >
          <Edit2 className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onLoad(favorite.id)}
          title={t('addStream')}
          className={`h-8 w-8 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-transparent' : 'text-gray-600 hover:text-black hover:bg-transparent'}`}
        >
          <Play className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(favorite.id)}
          title={t('delete')}
          className={`h-8 w-8 ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-transparent' : 'text-gray-600 hover:text-red-600 hover:bg-transparent'}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// Category Item Component
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
  const { t } = useTranslation(['favorites', 'common']);
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
        <Button size="icon" className="h-6 w-6" onClick={handleSave}>
          <Check className="size-3" />
        </Button>
        <Button size="icon" variant="outline" className="h-6 w-6" onClick={handleCancel}>
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${theme === 'dark' ? 'bg-gray-900 hover:bg-gray-800' : 'bg-white hover:bg-gray-50'} transition-colors`}>
      <div className="flex items-center gap-3">
        <Folder className={`size-5 ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`} />
        <div>
          <p className={theme === 'dark' ? 'text-white' : 'text-black'}>{category.name}</p>
          <p className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>{count} {t('streams')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onLoad}
          title={t('loadCategory')}
          disabled={count === 0}
          className={`h-8 w-8 ${theme === 'dark' ? 'text-gray-400 hover:text-purple-400 hover:bg-transparent' : 'text-gray-600 hover:text-purple-600 hover:bg-transparent'}`}
        >
          <Play className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(true)}
          title={t('edit')}
          className={`h-8 w-8 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-transparent' : 'text-gray-600 hover:text-black hover:bg-transparent'}`}
        >
          <Edit2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (confirm(t('delete') + ` "${category.name}"?`)) {
              onDelete(category.id);
            }
          }}
          title={t('delete')}
          className={`h-8 w-8 ${theme === 'dark' ? 'text-gray-400 hover:text-red-400 hover:bg-transparent' : 'text-gray-600 hover:text-red-600 hover:bg-transparent'}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
