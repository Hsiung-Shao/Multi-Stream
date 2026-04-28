import { useState, useCallback } from 'react';
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
import { Loader2, CheckCircle, LogIn, Eye, EyeOff } from 'lucide-react';
import { useCreateEvent } from '../hooks/useEvents';
import { logEvent } from '../../../utils/analytics';
import { useAuthContext } from '../../../contexts/AuthContext';
import { LoginDialog } from '../../../components/Dialogs/LoginDialog';
import { EventCard } from './EventCard';
import type { EventType, CreateEventInput, VTuberEvent } from '../types';

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EventFormState {
  title: string;
  description: string;
  event_type: EventType;
  start_time: string;
  end_time: string;
  location: string;
  url: string;
  image_url: string;
}

const initialForm: EventFormState = {
  title: '',
  description: '',
  event_type: 'vtuber_event',
  start_time: '',
  end_time: '',
  location: '',
  url: '',
  image_url: '',
};

export function CreateEventDialog({ open, onOpenChange }: CreateEventDialogProps) {
  const { t } = useTranslation('vtuber');
  const createMutation = useCreateEvent();
  const { isLoggedIn, user } = useAuthContext();
  const [form, setForm] = useState<EventFormState>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof EventFormState, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const set = useCallback(<K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!form.title.trim()) errs.title = t('fieldRequired');
    if (!form.start_time) errs.start_time = t('fieldRequired');
    if (form.end_time && form.start_time && new Date(form.end_time) <= new Date(form.start_time)) {
      errs.end_time = t('eventEndBeforeStart', '結束時間必須晚於開始時間');
    }
    if (form.url && !isValidUrl(form.url)) errs.url = t('invalidUrl');
    if (form.image_url && !isValidUrl(form.image_url)) errs.image_url = t('invalidUrl');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!isLoggedIn || !user) return;
    if (!validate()) return;

    const input: CreateEventInput = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      event_type: form.event_type,
      start_time: new Date(form.start_time).toISOString(),
      end_time: form.end_time ? new Date(form.end_time).toISOString() : undefined,
      location: form.location.trim() || undefined,
      url: form.url.trim() || undefined,
      image_url: form.image_url.trim() || undefined,
    };

    await createMutation.mutateAsync({ input, userId: user.id });
    logEvent('VTuber', 'event_create', form.event_type);
    setSubmitted(true);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setForm(initialForm);
      setErrors({});
      setSubmitted(false);
      createMutation.reset();
    }, 300);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('createEvent')}</SheetTitle>
            <SheetDescription className="text-xs">{t('eventLoginRequired')}</SheetDescription>
          </SheetHeader>

          {!isLoggedIn ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <LogIn className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">{t('eventLoginRequired')}</p>
              <Button variant="outline" onClick={() => setLoginDialogOpen(true)}>
                {t('loginButton')}
              </Button>
            </div>
          ) : submitted ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 animate-in fade-in duration-300">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="text-sm text-center text-foreground">{t('eventSubmitSuccess')}</p>
              <Button variant="outline" onClick={handleClose}>{t('common:close', '關閉')}</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pt-4">
              <Field label={t('eventTitle')} error={errors.title} required>
                <Input
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder={t('eventTitlePlaceholder')}
                  maxLength={200}
                />
              </Field>

              <Field label={t('eventDescription')}>
                <Textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder={t('eventDescriptionPlaceholder')}
                  className="min-h-[80px] resize-y"
                  maxLength={2000}
                />
                <span className="text-[11px] text-muted-foreground text-right block">
                  {form.description.length}/2000
                </span>
              </Field>

              <Field label={t('eventType')}>
                <Select value={form.event_type} onValueChange={(v) => set('event_type', v as EventType)}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vtuber_event">{t('eventTypeVtuber')}</SelectItem>
                    <SelectItem value="livestream">{t('eventTypeLivestream')}</SelectItem>
                    <SelectItem value="community">{t('eventTypeCommunity')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t('eventStartTime')} error={errors.start_time} required>
                <Input
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => set('start_time', e.target.value)}
                />
              </Field>

              <Field label={t('eventEndTime')}>
                <Input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => set('end_time', e.target.value)}
                />
              </Field>

              <Field label={t('eventLocation')}>
                <Input
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder={t('eventLocationPlaceholder')}
                  maxLength={200}
                />
              </Field>

              <Field label={t('eventUrl')} error={errors.url}>
                <Input
                  type="url"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder={t('eventUrlPlaceholder')}
                />
              </Field>

              <Field label={t('eventImageUrl')} error={errors.image_url}>
                <Input
                  type="url"
                  value={form.image_url}
                  onChange={(e) => set('image_url', e.target.value)}
                  placeholder={t('eventImageUrlPlaceholder')}
                />
              </Field>

              {/* Preview toggle */}
              {form.title.trim() && form.start_time && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? t('eventHidePreview', '隱藏預覽') : t('eventShowPreview', '顯示預覽')}
                  </button>
                  {showPreview && (
                    <div className="rounded-lg border border-dashed border-border p-3 bg-muted/30">
                      <p className="text-[10px] text-muted-foreground mb-2">{t('eventPreviewLabel', '活動卡片預覽')}</p>
                      <EventCard
                        event={buildPreviewEvent(form, user?.id)}
                      />
                    </div>
                  )}
                </div>
              )}

              {createMutation.isError && (
                <p className="text-xs text-destructive text-center">{t('eventSubmitError')}</p>
              )}

              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                className="w-full gap-2"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('eventSubmitting')}
                  </>
                ) : (
                  t('eventSubmit')
                )}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <LoginDialog open={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function buildPreviewEvent(form: EventFormState, userId?: string): VTuberEvent {
  return {
    id: 'preview',
    title: form.title.trim() || '（未輸入標題）',
    description: form.description.trim() || null,
    event_type: form.event_type,
    vtuber_id: null,
    organizer_id: userId ?? '',
    start_time: form.start_time ? new Date(form.start_time).toISOString() : new Date().toISOString(),
    end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
    location: form.location.trim() || null,
    url: form.url.trim() || null,
    image_url: form.image_url.trim() || null,
    status: 'pending',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
