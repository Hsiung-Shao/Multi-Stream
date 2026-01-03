

import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun, Globe, Settings } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { useUIStore } from '../../store/useUIStore';
import { useStreamStore } from '../../store/useStreamStore';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    const { t, i18n } = useTranslation('common');

    // Stores
    const { theme, setTheme } = useUIStore();
    const {
        gridMode,
        toggleGridMode,
        magneticMode,
        toggleMagneticMode
    } = useStreamStore();

    const currentLanguage = i18n.language || 'zh-TW';

    const handleLanguageChange = (value: string) => {
        i18n.changeLanguage(value);
        localStorage.setItem('i18nextLng', value);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-100">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        {t('settings.title') || 'Settings'}
                    </DialogTitle>
                    <DialogDescription>
                        {t('settings.description') || 'Manage your preferences and global configurations.'}
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="general" className="w-full mt-2">
                    <TabsList className="grid w-full grid-cols-3 bg-zinc-900">
                        <TabsTrigger value="general">{t('settings.general') || 'General'}</TabsTrigger>
                        <TabsTrigger value="canvas">{t('settings.canvas') || 'Canvas'}</TabsTrigger>
                        <TabsTrigger value="about">{t('settings.about') || 'About'}</TabsTrigger>
                    </TabsList>

                    {/* General Settings */}
                    <TabsContent value="general" className="space-y-4 py-4">
                        {/* Theme */}
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col space-y-1">
                                <Label className="flex items-center gap-2">
                                    {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                    {t('settings.theme') || 'Theme'}
                                </Label>
                                <span className="text-xs text-muted-foreground">
                                    {t('settings.theme_desc') || 'Switch between dark and light mode.'}
                                </span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Button
                                    variant={theme === 'dark' ? 'secondary' : 'outline'}
                                    size="sm"
                                    onClick={() => setTheme('dark')}
                                    className="h-8 px-2"
                                >
                                    Dark
                                </Button>
                                <Button
                                    variant={theme === 'light' ? 'secondary' : 'outline'}
                                    size="sm"
                                    onClick={() => setTheme('light')}
                                    className="h-8 px-2"
                                >
                                    Light
                                </Button>
                            </div>
                        </div>

                        {/* Language */}
                        <div className="flex items-center justify-between mt-4">
                            <div className="flex flex-col space-y-1">
                                <Label className="flex items-center gap-2">
                                    <Globe className="w-4 h-4" />
                                    {t('settings.language') || 'Language'}
                                </Label>
                                <span className="text-xs text-muted-foreground">
                                    {t('settings.language_desc') || 'Select your preferred language.'}
                                </span>
                            </div>
                            <Select value={currentLanguage} onValueChange={handleLanguageChange}>
                                <SelectTrigger className="w-[140px] h-8 text-xs bg-zinc-900 border-zinc-700">
                                    <SelectValue placeholder="Language" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="zh-TW">繁體中文</SelectItem>
                                    <SelectItem value="zh-CN">简体中文</SelectItem>
                                    <SelectItem value="en">English</SelectItem>
                                    <SelectItem value="ja">日本語</SelectItem>
                                    <SelectItem value="ko">한국어</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </TabsContent>

                    {/* Canvas Settings */}
                    <TabsContent value="canvas" className="space-y-4 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col space-y-1">
                                <Label>{t('settings.show_grid') || 'Show Grid'}</Label>
                                <span className="text-xs text-muted-foreground">
                                    {t('settings.show_grid_desc') || 'Toggle the visibility of the canvas grid.'}
                                </span>
                            </div>
                            <Switch
                                checked={gridMode}
                                onCheckedChange={toggleGridMode}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex flex-col space-y-1">
                                <Label>{t('settings.magnetic') || 'Magnetic Snapping'}</Label>
                                <span className="text-xs text-muted-foreground">
                                    {t('settings.magnetic_desc') || 'Items snap to adjacent items.'}
                                </span>
                            </div>
                            <Switch
                                checked={magneticMode}
                                onCheckedChange={toggleMagneticMode}
                            />
                        </div>
                    </TabsContent>

                    {/* About */}
                    <TabsContent value="about" className="space-y-4 py-4">
                        <div className="flex flex-col items-center justify-center space-y-2 p-4 bg-zinc-900/50 rounded-lg">
                            <Monitor className="w-12 h-12 text-primary opacity-80" />
                            <h3 className="text-lg font-bold">Multi-Stream</h3>
                            <p className="text-xs text-muted-foreground">v2.3.0</p>
                            <p className="text-center text-sm text-zinc-400 mt-2">
                                A powerful multi-streaming dashboard built with React, Zustand, and Shadcn UI.
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
                            <a href="#" className="hover:text-zinc-300">GitHub</a>
                            <span>•</span>
                            <a href="#" className="hover:text-zinc-300">Discord</a>
                            <span>•</span>
                            <a href="#" className="hover:text-zinc-300">Docs</a>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)} variant="outline">
                        {t('common.close') || 'Close'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
