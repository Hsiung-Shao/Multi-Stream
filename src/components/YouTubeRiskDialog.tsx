import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Button,
    List,
    ListItem,
    ListItemText,
    Typography,
    Box,
    useTheme
} from '@mui/material';
import { AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { useI18n } from '../i18n/index';

interface YouTubeRiskDialogProps {
    open: boolean;
    streamCount: number;
    onClose: () => void;
    onPauseOthers?: () => void;
    onDontRemind: () => void;
}

export const YouTubeRiskDialog: React.FC<YouTubeRiskDialogProps> = ({
    open,
    streamCount,
    onClose,
    onPauseOthers,
    onDontRemind
}) => {
    const { t } = useI18n();
    const theme = useTheme();

    const isStrongWarning = streamCount >= 4;

    // Custom interpolation helper since the basic I18nContext might not support it
    const formatText = (key: any, replacements: Record<string, string | number>) => {
        let text = t(key);
        Object.keys(replacements).forEach(placeholder => {
            text = text.replace(`{${placeholder}}`, String(replacements[placeholder]));
        });
        return text;
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            aria-labelledby="youtube-risk-dialog-title"
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderTop: `6px solid ${isStrongWarning ? theme.palette.error.main : theme.palette.warning.main}`,
                }
            }}
        >
            <DialogTitle id="youtube-risk-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {isStrongWarning ? (
                    <AlertOctagon color={theme.palette.error.main} />
                ) : (
                    <AlertTriangle color={theme.palette.warning.main} />
                )}
                {t('youtubeRisk.title' as any)}
            </DialogTitle>
            <DialogContent>
                <DialogContentText component="div" sx={{ mb: 2 }}>
                    {formatText('youtubeRisk.body' as any, { n: streamCount })}
                </DialogContentText>

                <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 1 }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Info size={16} color={theme.palette.info.main} />
                        {t('youtubeRisk.disclaimer.title' as any)}
                    </Typography>
                    <List dense disablePadding>
                        <ListItem disablePadding sx={{ mb: 1 }}>
                            <ListItemText
                                primary={t('youtubeRisk.disclaimer.item1' as any)}
                                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                            />
                        </ListItem>
                        <ListItem disablePadding sx={{ mb: 1 }}>
                            <ListItemText
                                primary={t('youtubeRisk.disclaimer.item2' as any)}
                                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                            />
                        </ListItem>
                        <ListItem disablePadding>
                            <ListItemText
                                primary={t('youtubeRisk.disclaimer.item3' as any)}
                                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                            />
                        </ListItem>
                    </List>
                </Box>
            </DialogContent>
            <DialogActions sx={{ flexDirection: 'column', gap: 1, p: 2, pt: 0, alignItems: 'stretch' }}>
                <Box sx={{ display: 'flex', gap: 1, width: '100%', justifyContent: 'flex-end' }}>
                    {onPauseOthers && (
                        <Button
                            onClick={onPauseOthers}
                            color="secondary"
                            variant="outlined"
                        >
                            {t('youtubeRisk.pauseOthers' as any)}
                        </Button>
                    )}
                    <Button
                        onClick={onClose}
                        variant="contained"
                        color="primary"
                        autoFocus
                    >
                        {t('youtubeRisk.confirm' as any)}
                    </Button>
                </Box>
                <Button
                    onClick={onDontRemind}
                    color="inherit"
                    size="small"
                    sx={{ alignSelf: 'center', color: 'text.secondary', fontSize: '0.75rem' }}
                >
                    {t('youtubeRisk.sessionIgnore' as any)}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
