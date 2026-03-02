import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../../../components/ui/sheet';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../../components/ui/command';
import { Plus, X, Loader2, CheckCircle, Link2, Youtube, Twitch, ChevronsUpDown, Check, Users } from 'lucide-react';
import { useSubmitContribution, useVTuberGroups } from '../hooks/useVTubers';
import type { VTuberNationality, VTuberContributionPayload } from '../types';

// ---------------------------------------------------------------------------
// Props & Constants
// ---------------------------------------------------------------------------

interface ContributeVTuberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NATIONALITIES: VTuberNationality[] = ['TW', 'HK', 'MY', 'JP', 'KR', 'OTHER'];

const NATIONALITY_FLAGS: Record<VTuberNationality, string> = {
  TW: '🇹🇼',
  HK: '🇭🇰',
  MY: '🇲🇾',
  JP: '🇯🇵',
  KR: '🇰🇷',
  OTHER: '🌐',
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const YT_CHANNEL_ID_REGEX = /^UC[a-zA-Z0-9_-]{22}$/;
const YT_HANDLE_REGEX = /^@[a-zA-Z0-9_.-]{1,50}$/;
const TWITCH_ID_REGEX = /^[a-zA-Z0-9_]{1,25}$/;

/** Validate YouTube input: URL, channel ID, or @handle */
function isValidYoutubeInput(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return true; // optional field

  // Direct channel ID
  if (YT_CHANNEL_ID_REGEX.test(trimmed)) return true;

  // @handle
  if (YT_HANDLE_REGEX.test(trimmed)) return true;

  // YouTube URL
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
    try {
      const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/** Extract Twitch username from URL or direct input */
function extractTwitchId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // URL format: twitch.tv/username
  const match = trimmed.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (match) return match[1];

  // Direct username
  return trimmed;
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Form State
// ---------------------------------------------------------------------------

interface FormState {
  contributorName: string;
  contributorContact: string;
  name: string;
  nationality: VTuberNationality;
  youtubeUrl: string;
  twitchInput: string;
  groupName: string;
  debutDate: string;
  sourceUrls: string[];
  sourceNote: string;
}

const initialForm: FormState = {
  contributorName: '',
  contributorContact: '',
  name: '',
  nationality: 'TW',
  youtubeUrl: '',
  twitchInput: '',
  groupName: '',
  debutDate: '',
  sourceUrls: [''],
  sourceNote: '',
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ContributeVTuberDialog({ open, onOpenChange }: ContributeVTuberDialogProps) {
  const { t } = useTranslation('vtuber');
  const submitMutation = useSubmitContribution();
  const { data: groups = [] } = useVTuberGroups();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'channel', string>>>({});
  const [submitted, setSubmitted] = useState(false);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const validate = (): boolean => {
    const errs: typeof errors = {};

    if (!form.contributorName.trim()) errs.contributorName = t('fieldRequired');
    if (!form.name.trim()) errs.name = t('fieldRequired');

    // At least one channel
    if (!form.youtubeUrl.trim() && !form.twitchInput.trim()) {
      errs.channel = t('needAtLeastOneChannel');
    }
    if (form.youtubeUrl.trim() && !isValidYoutubeInput(form.youtubeUrl)) {
      errs.youtubeUrl = t('invalidYoutubeInput');
    }
    if (form.twitchInput.trim()) {
      const twitchId = extractTwitchId(form.twitchInput);
      if (!TWITCH_ID_REGEX.test(twitchId)) {
        errs.twitchInput = t('invalidTwitchInput');
      }
    }

    // Source URLs
    const validUrls = form.sourceUrls.filter((u) => u.trim());
    if (validUrls.length === 0) {
      errs.sourceUrls = t('needAtLeastOneSource');
    } else {
      for (const url of validUrls) {
        if (!isValidUrl(url.trim())) {
          errs.sourceUrls = t('invalidUrl');
          break;
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const twitchId = extractTwitchId(form.twitchInput);

    const payload: VTuberContributionPayload = {
      name: form.name.trim(),
      nationality: form.nationality,
      ...(form.youtubeUrl.trim() && { youtube_channel_id: form.youtubeUrl.trim() }),
      ...(twitchId && { twitch_channel_id: twitchId }),
      ...(form.groupName.trim() && { group_name: form.groupName.trim() }),
      ...(form.debutDate && { debut_date: form.debutDate }),
    };

    await submitMutation.mutateAsync({
      action: 'add',
      payload,
      submittedBy: form.contributorName.trim(),
      submitterContact: form.contributorContact.trim() || undefined,
      sourceUrls: form.sourceUrls.filter((u) => u.trim()).map((u) => u.trim()),
      sourceNote: form.sourceNote.trim() || undefined,
    });

    setSubmitted(true);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setForm(initialForm);
      setErrors({});
      setSubmitted(false);
      submitMutation.reset();
    }, 300);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('contributeTitle')}</SheetTitle>
          <SheetDescription className="text-xs">{t('contributeDesc')}</SheetDescription>
        </SheetHeader>

        {submitted ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 animate-in fade-in duration-300">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-sm text-center text-foreground">{t('submitSuccess')}</p>
            <Button variant="outline" onClick={handleClose}>{t('common:close', '關閉')}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pt-4">
            {/* ── Contributor info ── */}
            <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
              <legend className="text-xs font-medium text-muted-foreground px-1">
                {t('adminContributor')}
              </legend>
              <Field label={t('contributorName')} error={errors.contributorName} required>
                <Input
                  value={form.contributorName}
                  onChange={(e) => set('contributorName', e.target.value)}
                  placeholder={t('contributorNamePlaceholder')}
                  maxLength={20}
                />
              </Field>
              <Field label={t('contributorContact')}>
                <Input
                  value={form.contributorContact}
                  onChange={(e) => set('contributorContact', e.target.value)}
                  placeholder={t('contributorContactPlaceholder')}
                  maxLength={100}
                />
              </Field>
            </fieldset>

            {/* ── VTuber info ── */}
            <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
              <legend className="text-xs font-medium text-muted-foreground px-1">VTuber</legend>

              <Field label={t('vtuberName')} error={errors.name} required>
                <Input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder={t('vtuberNamePlaceholder')}
                  maxLength={100}
                />
              </Field>

              <Field label={t('nationality')}>
                <Select value={form.nationality} onValueChange={(v) => set('nationality', v as VTuberNationality)}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NATIONALITIES.map((n) => (
                      <SelectItem key={n} value={n}>
                        <span className="mr-1.5">{NATIONALITY_FLAGS[n]}</span>
                        {t(n.toLowerCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* YouTube */}
              <Field
                label={t('youtubeChannel')}
                error={errors.youtubeUrl || errors.channel}
                icon={<Youtube className="w-4 h-4 text-red-500" />}
              >
                <Input
                  value={form.youtubeUrl}
                  onChange={(e) => set('youtubeUrl', e.target.value)}
                  placeholder={t('youtubeChannelPlaceholder')}
                />
              </Field>

              {/* Twitch */}
              <Field
                label={t('twitchChannel')}
                error={errors.twitchInput}
                icon={<Twitch className="w-4 h-4 text-violet-500" />}
              >
                <Input
                  value={form.twitchInput}
                  onChange={(e) => set('twitchInput', e.target.value)}
                  placeholder={t('twitchChannelPlaceholder')}
                />
              </Field>

              {/* Group combobox */}
              <Field label={t('groupNameLabel')}>
                <GroupCombobox
                  groups={groups}
                  value={form.groupName}
                  onChange={(v) => set('groupName', v)}
                  placeholder={t('groupSearchPlaceholder')}
                  addNewLabel={t('groupAddNew')}
                  noneLabel={t('groupNone')}
                />
              </Field>

              {/* Debut date */}
              <Field label={t('debutDateLabel')}>
                <Input
                  type="date"
                  value={form.debutDate}
                  onChange={(e) => set('debutDate', e.target.value)}
                />
              </Field>
            </fieldset>

            {/* ── Source verification ── */}
            <fieldset className="space-y-3 rounded-lg border border-border/50 p-3">
              <legend className="text-xs font-medium text-muted-foreground px-1 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                {t('sourceUrls')}
              </legend>
              <p className="text-[11px] text-muted-foreground">{t('sourceUrlsHint')}</p>

              {form.sourceUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const next = [...form.sourceUrls];
                      next[i] = e.target.value;
                      set('sourceUrls', next);
                    }}
                    placeholder={t('sourceUrlsPlaceholder')}
                    className="flex-1"
                  />
                  {form.sourceUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => set('sourceUrls', form.sourceUrls.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {errors.sourceUrls && <p className="text-[11px] text-destructive">{errors.sourceUrls}</p>}

              {form.sourceUrls.length < 3 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => set('sourceUrls', [...form.sourceUrls, ''])}
                >
                  <Plus className="w-3 h-3" />
                  {t('addSourceUrl')}
                </Button>
              )}

              <Field label={t('sourceNote')}>
                <Textarea
                  value={form.sourceNote}
                  onChange={(e) => set('sourceNote', e.target.value)}
                  placeholder={t('sourceNotePlaceholder')}
                  className="min-h-[60px] resize-y"
                  maxLength={500}
                />
              </Field>
            </fieldset>

            {/* ── Submit ── */}
            {submitMutation.isError && (
              <p className="text-xs text-destructive text-center">{t('submitError')}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="w-full gap-2"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('submitting')}
                </>
              ) : (
                t('submitContribution')
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  icon,
  required,
  children,
}: {
  label: string;
  error?: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group Combobox
// ---------------------------------------------------------------------------

function GroupCombobox({
  groups,
  value,
  onChange,
  placeholder,
  addNewLabel,
  noneLabel,
}: {
  groups: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  addNewLabel: string;
  noneLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  const isNewValue = search.trim() && !groups.some((g) => g.name.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9 text-sm"
        >
          {value ? (
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              {value}
            </span>
          ) : (
            <span className="text-muted-foreground">{noneLabel}</span>
          )}
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              {!search.trim() && noneLabel}
            </CommandEmpty>
            <CommandGroup>
              {/* Clear option */}
              <CommandItem
                value=""
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                  setSearch('');
                }}
                className="text-xs text-muted-foreground"
              >
                <Check className={`mr-2 h-3 w-3 ${!value ? 'opacity-100' : 'opacity-0'}`} />
                {noneLabel}
              </CommandItem>

              {/* Existing groups */}
              {filtered.map((group) => (
                <CommandItem
                  key={group.id}
                  value={group.name}
                  onSelect={() => {
                    onChange(group.name);
                    setOpen(false);
                    setSearch('');
                  }}
                  className="text-sm"
                >
                  <Check className={`mr-2 h-3 w-3 ${value === group.name ? 'opacity-100' : 'opacity-0'}`} />
                  {group.name}
                </CommandItem>
              ))}

              {/* Add new option */}
              {isNewValue && (
                <CommandItem
                  value={`__new__${search.trim()}`}
                  onSelect={() => {
                    onChange(search.trim());
                    setOpen(false);
                    setSearch('');
                  }}
                  className="text-sm"
                >
                  <Plus className="mr-2 h-3 w-3 text-primary" />
                  <span>{addNewLabel.replace('{{name}}', search.trim())}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
