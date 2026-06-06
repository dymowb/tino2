import React, { useState } from 'react';
import {
  Box, Paper, Typography, TextField, Chip, IconButton, Collapse,
  Alert, Button, Stack, Tooltip,
} from '@mui/material';
import {
  Edit, ExpandMore, ExpandLess, Refresh, CalendarToday,
  AttachMoney, LocationOn, Build, Warning,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

export interface RequirementsSummary {
  serviceType: string;
  /** AI-generated, provider-facing summary of the job (nuances not in other fields). */
  description?: string;
  location: { neighborhood?: string; address?: string; city?: string; state?: string; zipCode?: string };
  timing: { preferredDate?: string; preferredTime?: string; isFlexible: boolean };
  budget?: { min?: number; max?: number; hasFlexibility: boolean };
  specialRequirements: string[];
  urgency: 'low' | 'medium' | 'high' | 'emergency';
}

interface Props {
  requirements: RequirementsSummary;
  description: string;
  onChange: (r: RequirementsSummary, description: string) => void;
  onRerun: () => void;
  isModified: boolean;
}

const AIRequirementsSummary: React.FC<Props> = ({
  requirements, description, onChange, onRerun, isModified,
}) => {
  const { t } = useTranslation('assistant');
  const [expanded, setExpanded] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);

  const update = (patch: Partial<RequirementsSummary>) =>
    onChange({ ...requirements, ...patch }, description);

  const updateDescription = (d: string) =>
    onChange(requirements, d);

  const Field: React.FC<{
    icon: React.ReactNode; label: string; value: string; fieldKey: string;
    onSave: (v: string) => void;
  }> = ({ icon, label, value, fieldKey, onSave }) => {
    const [draft, setDraft] = useState(value);
    const editing = editingField === fieldKey;

    if (editing) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 140 }}>
          <TextField
            size="small" value={draft} autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { onSave(draft); setEditingField(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { onSave(draft); setEditingField(null); } }}
            sx={{ flex: 1 }}
          />
        </Box>
      );
    }

    return (
      <Tooltip title={t('summary.clickToEdit', 'Click to edit')}>
        <Box
          onClick={() => { setDraft(value); setEditingField(fieldKey); }}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', flex: 1,
            minWidth: 120, px: 1, py: 0.5, borderRadius: 1,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Box sx={{ color: 'primary.main', display: 'flex', fontSize: '1rem' }}>{icon}</Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
              {label}
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {value || <em style={{ opacity: 0.5 }}>{t('summary.notSet', 'Not set')}</em>}
            </Typography>
          </Box>
          <Edit sx={{ fontSize: 12, ml: 'auto', opacity: 0.4 }} />
        </Box>
      </Tooltip>
    );
  };

  const budgetDisplay = requirements.budget
    ? [requirements.budget.min && `R$${requirements.budget.min}`, requirements.budget.max && `R$${requirements.budget.max}`]
        .filter(Boolean).join(' – ')
    : '';

  const locationDisplay = [
    requirements.location.neighborhood,
    requirements.location.city,
    requirements.location.state,
  ].filter(Boolean).join(', ');

  const dateDisplay = [requirements.timing.preferredDate, requirements.timing.preferredTime]
    .filter(Boolean).join(' ');

  return (
    <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', px: 2, py: 1.25,
          bgcolor: 'primary.50', cursor: 'pointer', userSelect: 'none',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
          {t('summary.title', 'Your Requirements')}
        </Typography>
        {isModified && (
          <Chip
            icon={<Warning sx={{ fontSize: 14 }} />}
            label={t('summary.modified', 'Modified')}
            size="small" color="warning" variant="outlined" sx={{ mr: 1 }}
          />
        )}
        <IconButton size="small">{expanded ? <ExpandLess /> : <ExpandMore />}</IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, py: 1.5 }}>
          {/* Key fields row */}
          <Stack direction="row" spacing={0} flexWrap="wrap" useFlexGap sx={{ gap: 0.5 }}>
            <Field
              icon={<Build sx={{ fontSize: 16 }} />}
              label={t('summary.serviceType', 'Service')}
              value={requirements.serviceType}
              fieldKey="serviceType"
              onSave={v => update({ serviceType: v })}
            />
            <Field
              icon={<LocationOn sx={{ fontSize: 16 }} />}
              label={t('summary.location', 'Location')}
              value={locationDisplay}
              fieldKey="location"
              onSave={v => {
                // Parse positionally in the SAME order the value is displayed
                // (neighborhood, city, state) and overwrite all three so editing
                // replaces rather than leaving a stale neighborhood prepended.
                const parts = v.split(',').map(s => s.trim());
                update({
                  location: {
                    ...requirements.location,
                    neighborhood: parts[0] || undefined,
                    city: parts[1] || undefined,
                    state: parts[2] || undefined,
                  },
                });
              }}
            />
            <Field
              icon={<CalendarToday sx={{ fontSize: 16 }} />}
              label={t('summary.date', 'Date / Time')}
              value={dateDisplay || (requirements.timing.isFlexible ? t('summary.flexible', 'Flexible') : '')}
              fieldKey="date"
              onSave={v => update({ timing: { ...requirements.timing, preferredDate: v } })}
            />
            <Field
              icon={<AttachMoney sx={{ fontSize: 16 }} />}
              label={t('summary.budget', 'Budget')}
              value={budgetDisplay}
              fieldKey="budget"
              onSave={v => {
                const nums = v.match(/\d+/g)?.map(Number) ?? [];
                update({ budget: { min: nums[0], max: nums[1] ?? nums[0], hasFlexibility: true } });
              }}
            />
          </Stack>

          {/* Description */}
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {t('summary.description', 'Description')}
            </Typography>
            <TextField
              fullWidth size="small" multiline maxRows={3}
              value={description}
              onChange={e => updateDescription(e.target.value)}
              placeholder={t('summary.descriptionPlaceholder', 'Describe what you need...')}
              sx={{ mt: 0.5 }}
            />
          </Box>
        </Box>

        {/* Modification warning */}
        {isModified && (
          <Alert
            severity="warning" sx={{ borderRadius: 0, py: 0.5 }}
            action={
              <Button size="small" startIcon={<Refresh />} onClick={onRerun} color="warning">
                {t('summary.rerun', 'Re-run Search')}
              </Button>
            }
          >
            {t('summary.modifiedWarning', 'Requirements changed — results may no longer match. Re-run the search to update.')}
          </Alert>
        )}
      </Collapse>
    </Paper>
  );
};

export default AIRequirementsSummary;
