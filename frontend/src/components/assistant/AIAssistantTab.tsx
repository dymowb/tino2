/**
 * AIAssistantTab - Main AI assistant interface
 *
 * Renders different UI based on workflow state:
 * - No workflow → Welcome message + text input
 * - Processing → Message history + progress indicator
 * - Waiting for user → Follow-up question + answer input
 * - Completed → Provider result cards
 * - Failed → Error message + retry button
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Paper,
  Grid,
  Stack,
  Card,
  CardContent,
  Chip,
  Rating,
  Divider,
  Slide,
  Tooltip,
} from '@mui/material';
import { CheckCircleOutline, CheckBox, CheckBoxOutlineBlank } from '@mui/icons-material';
import { Send, Refresh, AutoAwesome, EmojiEvents, WarningAmber, RequestQuote } from '@mui/icons-material';
import { Recommendation, VerificationReport, apiService } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { useAssistantWorkflow } from '../../hooks/useAssistantWorkflow';
import AssistantProviderCard from './AssistantProviderCard';
import AIRequirementsSummary, { RequirementsSummary } from './AIRequirementsSummary';
import ProviderDetailDrawer from './ProviderDetailDrawer';
import VoiceMicButton from './VoiceMicButton';
import { toast } from 'react-hot-toast';

const MAX_PROVIDERS = Number(import.meta.env.VITE_MAX_PROVIDERS_PER_QUOTE ?? 5);

interface AIAssistantTabProps {
  onComplete?: () => void;
  onReset?: () => void;
}

const AIAssistantTab: React.FC<AIAssistantTabProps> = ({ onComplete, onReset }) => {
  const { t } = useTranslation('assistant');
  const {
    workflow,
    messages,
    isProcessing,
    isStreaming,
    progressMessage,
    progressStage,
    narrative,
    followUpQuestion,
    results,
    analysisResults,
    recommendations,
    verification,
    currentStep,
    error,
    startWorkflow,
    sendMessage,
    cancel,
    reset,
    isStarting,
    isSending,
  } = useAssistantWorkflow();

  // Input state for the text field (used for both initial message and follow-up)
  const [input, setInput] = useState('');

  // Provider detail drawer
  const [drawerProvider, setDrawerProvider] = useState<import('../../services/api').WorkflowProviderResult | null>(null);

  // Multi-select quote state
  const [selectedProviderIds, setSelectedProviderIds] = useState<Set<string>>(new Set());
  const [isSendingQuote, setIsSendingQuote] = useState(false);

  // Editable requirements summary
  const [editedRequirements, setEditedRequirements] = useState<RequirementsSummary | null>(null);
  const [editedDescription, setEditedDescription] = useState('');
  const [requirementsModified, setRequirementsModified] = useState(false);

  // Sort order for the "all providers" section below recommendations
  const [providerSort, setProviderSort] = useState<'match' | 'rating' | 'price'>('match');

  // TTS: speak assistant text via the /voice/synthesize endpoint
  const speakText = useCallback(async (text: string) => {
    try {
      const blob = await apiService.voiceSynthesize(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.play();
    } catch {
      // TTS unavailable (no OPENAI_API_KEY) — silent fail
    }
  }, []);

  // Auto-read follow-up questions aloud so the voice interaction feels natural
  useEffect(() => {
    if (followUpQuestion) speakText(followUpQuestion);
  }, [followUpQuestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise editable requirements when workflow completes
  useEffect(() => {
    const summary = workflow?.context?.requirements?.requirementsSummary;
    if (summary && !editedRequirements) {
      setEditedRequirements(summary as RequirementsSummary);
      // Prefer the AI-generated job summary (captures conversation nuances) over
      // the raw initial message, which may be as terse as "need a plumber".
      setEditedDescription((summary as RequirementsSummary).description ?? workflow?.context?.userRequest ?? '');
      setRequirementsModified(false);
    }
    if (workflow?.status === 'completed') onComplete?.();
  }, [workflow?.context?.requirements?.requirementsSummary, workflow?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset selection + requirements when workflow is reset
  useEffect(() => {
    if (!workflow) {
      setSelectedProviderIds(new Set());
      setEditedRequirements(null);
      setEditedDescription('');
      setRequirementsModified(false);
      onReset?.();
    }
  }, [workflow]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleProvider = (providerId: string) => {
    setSelectedProviderIds(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) { next.delete(providerId); } else { next.add(providerId); }
      return next;
    });
  };

  const handleSendQuote = async () => {
    if (selectedProviderIds.size === 0 || !editedRequirements) return;
    setIsSendingQuote(true);
    try {
      const req = editedRequirements;
      await apiService.createQuoteRequest({
        serviceType: req.serviceType,
        description: editedDescription,
        location: {
          city: req.location.neighborhood ?? req.location.city ?? '',
          address: req.location.address || undefined,
          state: req.location.state || undefined,
          zipCode: req.location.zipCode || undefined,
        },
        preferredDate: req.timing.preferredDate && /^\d{4}-\d{2}-\d{2}/.test(req.timing.preferredDate)
          ? req.timing.preferredDate : undefined,
        budget: req.budget
          ? { min: req.budget.min ?? 0, max: req.budget.max ?? 0, currency: 'BRL' }
          : undefined,
        urgency: ({ emergency: 'urgent', high: 'high', low: 'low' } as Record<string, 'low' | 'medium' | 'high' | 'urgent'>)[req.urgency] ?? 'medium',
        targetProviderIds: [...selectedProviderIds],
      });
      toast.success(t('results.quoteSent', { count: selectedProviderIds.size }));
      setSelectedProviderIds(new Set());
    } catch {
      toast.error(t('results.quoteError', 'Failed to send quote request. Please try again.'));
    } finally {
      setIsSendingQuote(false);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!workflow) {
      // No workflow yet → start a new one
      startWorkflow(input.trim());
    } else if (followUpQuestion) {
      // Workflow waiting for user → send follow-up answer
      sendMessage(input.trim());
    }

    setInput('');
  };

  // Map agent names to user-friendly status messages
  const getStatusMessage = (agent: string | null): string => {
    switch (agent) {
      case 'requirements':
        return t('status.requirements');
      case 'search':
        return t('status.search');
      case 'analysis':
        return t('status.analysis');
      case 'recommendation':
        return t('status.recommendation', 'Building your personalised recommendations…');
      case 'verification':
        return t('status.verification');
      case 'narrative':
        return t('status.narrative');
      default:
        return t('status.starting');
    }
  };

  const renderWelcome = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <AutoAwesome sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t('welcome.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 500, mx: 'auto' }}>
        {t('welcome.subtitle')}
      </Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600, mx: 'auto' }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('welcome.placeholder')}
          disabled={isStarting}
          sx={{ mb: 2 }}
        />
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={!input.trim() || isStarting}
            startIcon={isStarting ? <CircularProgress size={20} /> : <Send />}
          >
            {t('actions.send')}
          </Button>
          <VoiceMicButton
            onTranscript={(text) => { if (text) startWorkflow(text); }}
            disabled={isStarting}
          />
        </Stack>
      </Box>
    </Box>
  );

  const renderProcessing = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <CircularProgress size={48} sx={{ mb: 2 }} />
      <Typography variant="h6" sx={{ mb: 1 }}>
        {isStreaming ? getStatusMessage(progressStage) : getStatusMessage(currentStep)}
      </Typography>

      {/* Narrative streams in token-by-token once the recommendation stage completes */}
      {narrative && (
        <Paper
          sx={{ maxWidth: 600, mx: 'auto', mt: 3, p: 2, bgcolor: 'primary.50', textAlign: 'left' }}
          elevation={0}
        >
          <Typography variant="body1">
            {narrative}
            {/* Blinking cursor while still streaming */}
            {isStreaming && <Box component="span" sx={{ borderRight: '2px solid', animation: 'blink 1s step-end infinite', '@keyframes blink': { '50%': { borderColor: 'transparent' } } }}>&#8203;</Box>}
          </Typography>
        </Paper>
      )}

      {/* Conversation history (shown when not streaming, e.g. polling follow-up) */}
      {!isStreaming && messages.length > 0 && (
        <Box sx={{ maxWidth: 600, mx: 'auto', mt: 3, textAlign: 'left' }}>
          {messages.map((msg) => (
            <Paper
              key={msg.id}
              sx={{
                p: 2,
                mb: 1,
                bgcolor: msg.role === 'user' ? 'primary.50' : 'grey.50',
                borderLeft: msg.role === 'user' ? '3px solid' : 'none',
                borderColor: 'primary.main',
              }}
            >
              <Typography variant="body2">{msg.content}</Typography>
            </Paper>
          ))}
        </Box>
      )}

      <Button variant="text" color="inherit" onClick={cancel} sx={{ mt: 2 }}>
        {t('actions.cancel')}
      </Button>
    </Box>
  );

  const renderFollowUp = () => (
    <Box sx={{ maxWidth: 600, mx: 'auto', py: 4 }}>
      {/* Show conversation history — exclude the active follow-up question, which
          is rendered on its own below (avoids showing the same question twice). */}
      {messages
        .filter((msg) => !(msg.role === 'assistant' && msg.content === followUpQuestion))
        .map((msg) => (
        <Paper
          key={msg.id}
          sx={{
            p: 2,
            mb: 1,
            bgcolor: msg.role === 'user' ? 'primary.50' : 'grey.50',
            borderLeft: msg.role === 'user' ? '3px solid' : 'none',
            borderColor: 'primary.main',
          }}
        >
          <Typography variant="body2">{msg.content}</Typography>
        </Paper>
      ))}

      {/* Follow-up question from the assistant */}
      <Paper sx={{ p: 2, mb: 2, bgcolor: 'info.50', borderLeft: '3px solid', borderColor: 'info.main' }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {t('followUp.title')}
        </Typography>
        <Typography variant="body2">{followUpQuestion}</Typography>
      </Paper>

      {/* Answer input */}
      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          fullWidth
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('followUp.placeholder')}
          disabled={isSending}
          sx={{ mb: 2 }}
        />
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            type="submit"
            variant="contained"
            disabled={!input.trim() || isSending}
            startIcon={isSending ? <CircularProgress size={20} /> : <Send />}
          >
            {t('actions.send')}
          </Button>
          <VoiceMicButton
            onTranscript={(text) => { if (text) sendMessage(text); }}
            disabled={isSending}
          />
          <Button variant="text" color="inherit" onClick={cancel}>
            {t('actions.cancel')}
          </Button>
        </Stack>
      </Box>
    </Box>
  );

  const rankColors: Record<number, { border: string; badge: string }> = {
    1: { border: '#FFD700', badge: '#FFD700' },
    2: { border: '#C0C0C0', badge: '#C0C0C0' },
    3: { border: '#CD7F32', badge: '#CD7F32' },
  };

  const renderRecommendationCard = (rec: Recommendation) => {
    const colors = rankColors[rec.rank] ?? { border: '#E0E0E0', badge: '#E0E0E0' };
    return (
      <Card key={rec.provider.providerId} sx={{ mb: 2, border: `2px solid ${colors.border}` }}>
        <CardContent>
          {/* Rank + name + rating row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Chip
              icon={<EmojiEvents sx={{ fontSize: 16 }} />}
              label={`#${rec.rank}`}
              size="small"
              sx={{ bgcolor: colors.badge, color: 'white', fontWeight: 'bold', '& .MuiChip-icon': { color: 'white' } }}
            />
            <Typography variant="h6" sx={{ fontWeight: 'bold', flex: 1 }}>
              {rec.provider.businessName}
            </Typography>
            <Rating value={Number(rec.provider.rating) || 0} readOnly size="small" precision={0.5} />
            <Typography variant="body2" color="text.secondary">
              ({rec.provider.totalReviews})
            </Typography>
          </Box>

          {/* Reasoning */}
          <Typography variant="body2" sx={{ mb: 1.5, color: 'text.primary' }}>
            {rec.reasoning}
          </Typography>

          {/* Tradeoffs */}
          {rec.tradeoffs && rec.tradeoffs.length > 0 && (
            <Stack spacing={0.5} sx={{ mb: 1.5 }}>
              {rec.tradeoffs.map((t, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                  <WarningAmber sx={{ fontSize: 14, color: 'warning.main', mt: '2px', flexShrink: 0 }} />
                  <Typography variant="caption" color="text.secondary">{t}</Typography>
                </Box>
              ))}
            </Stack>
          )}

          {/* Best for */}
          {rec.bestFor && (
            <Chip label={`${t('results.bestFor', 'Best for')}: ${rec.bestFor}`} size="small" variant="outlined" sx={{ mb: 1.5 }} />
          )}

          {/* Strengths from analysis */}
          {rec.analysis.strengths.length > 0 && (
            <Stack spacing={0.5}>
              {rec.analysis.strengths.slice(0, 3).map((s, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                  <CheckCircleOutline sx={{ fontSize: 14, color: 'success.main', mt: '2px', flexShrink: 0 }} />
                  <Typography variant="caption">{s}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>

        <Divider />
        <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={() => setDrawerProvider(rec.provider as import('../../services/api').WorkflowProviderResult)} sx={{ flexShrink: 0 }}>
            {t('actions.viewProfile')}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={selectedProviderIds.size >= MAX_PROVIDERS && !selectedProviderIds.has(rec.provider.providerId) ? t('actions.maxSelected') : ''}>
            <span>
              <Chip
                icon={selectedProviderIds.has(rec.provider.providerId) ? <CheckBox fontSize="small" /> : <CheckBoxOutlineBlank fontSize="small" />}
                label={t('actions.requestQuote')}
                onClick={selectedProviderIds.size >= MAX_PROVIDERS && !selectedProviderIds.has(rec.provider.providerId) ? undefined : () => toggleProvider(rec.provider.providerId)}
                color={selectedProviderIds.has(rec.provider.providerId) ? 'success' : 'default'}
                variant={selectedProviderIds.has(rec.provider.providerId) ? 'filled' : 'outlined'}
                size="small"
                clickable={!(selectedProviderIds.size >= MAX_PROVIDERS && !selectedProviderIds.has(rec.provider.providerId))}
                sx={{ fontWeight: selectedProviderIds.has(rec.provider.providerId) ? 600 : 400 }}
              />
            </span>
          </Tooltip>
        </Box>
      </Card>
    );
  };

  const renderResults = () => (
    <Box sx={{ py: 2 }}>
      {/* Editable requirements summary */}
      {editedRequirements && (
        <AIRequirementsSummary
          requirements={editedRequirements}
          description={editedDescription}
          isModified={requirementsModified}
          onChange={(r, d) => {
            setEditedRequirements(r);
            setEditedDescription(d);
            setRequirementsModified(true);
          }}
          onRerun={() => {
            // Re-run in place with the edited requirements: seed them so the
            // backend skips extraction and re-runs search → analysis →
            // recommendation directly. Fold the (possibly edited) description
            // into the seeded requirements so it persists across the re-run and
            // stays in sync with what the provider will see.
            if (editedRequirements) {
              startWorkflow(editedDescription, { ...editedRequirements, description: editedDescription });
            }
          }}
        />
      )}

      {/* Narrative intro generated during the stream */}
      {narrative && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'primary.50' }} elevation={0}>
          <Typography variant="body1">{narrative}</Typography>
        </Paper>
      )}

      {recommendations.length > 0 ? (
        <>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('results.recommendationsTitle', 'Your Top Recommendations')}
          </Typography>
          {verification && !verification.timedOut && (
            <Alert
              severity={verification.passed ? 'success' : 'warning'}
              icon={verification.passed ? undefined : <WarningAmber />}
              sx={{ mb: 2 }}
            >
              {verification.passed
                ? t('results.qualityVerified', { score: verification.qualityScore })
                : t('results.qualityConcerns', { score: verification.qualityScore, note: verification.suggestions[0] ?? t('results.someConcerns') })}
            </Alert>
          )}
          {recommendations
            .sort((a, b) => a.rank - b.rank)
            .map(renderRecommendationCard)}

          {/* All providers found — sorted list below the curated top picks */}
          {results.length > 0 && (() => {
            const recommendedIds = new Set(recommendations.map(r => r.provider.providerId));
            const remaining = results.filter(p => !recommendedIds.has(p.providerId));
            if (remaining.length === 0) return null;

            const sorted = [...remaining].sort((a, b) => {
              if (providerSort === 'rating') return b.rating - a.rating;
              if (providerSort === 'price') return (a.pricing?.baseRate ?? Infinity) - (b.pricing?.baseRate ?? Infinity);
              return b.matchScore - a.matchScore; // default: match score
            });

            return (
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" color="text.secondary">
                    {t('results.otherProvidersFound', { count: remaining.length })}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">{t('results.sortBy')}</Typography>
                    {(['match', 'rating', 'price'] as const).map(opt => (
                      <Button
                        key={opt}
                        size="small"
                        variant={providerSort === opt ? 'contained' : 'outlined'}
                        onClick={() => setProviderSort(opt)}
                        sx={{ minWidth: 0, px: 1.5, py: 0.5, fontSize: '0.75rem' }}
                      >
                        {t(`results.sort_${opt}`)}
                      </Button>
                    ))}
                  </Box>
                </Box>
                <Grid container spacing={2}>
                  {sorted.map(provider => (
                    <Grid item xs={12} md={6} key={provider.providerId}>
                      <AssistantProviderCard
                        provider={provider}
                        analysis={analysisResults.find(a => a.providerId === provider.providerId)}
                        isSelected={selectedProviderIds.has(provider.providerId)}
                        selectionDisabled={selectedProviderIds.size >= MAX_PROVIDERS}
                        onToggleSelect={() => toggleProvider(provider.providerId)}
                        onViewProfile={() => setDrawerProvider(provider)}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            );
          })()}
        </>
      ) : (
        <>
          <Typography variant="h6" sx={{ mb: 3 }}>
            {t('results.title')}
          </Typography>
          {results.length === 0 ? (
            <Alert severity="info">{t('results.noResults')}</Alert>
          ) : (
            <Grid container spacing={3}>
              {results.map((provider) => (
                <Grid item xs={12} md={6} lg={4} key={provider.providerId}>
                  <AssistantProviderCard
                    provider={provider}
                    analysis={analysisResults.find(a => a.providerId === provider.providerId)}
                    isSelected={selectedProviderIds.has(provider.providerId)}
                    selectionDisabled={selectedProviderIds.size >= MAX_PROVIDERS}
                    onToggleSelect={() => toggleProvider(provider.providerId)}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button variant="outlined" startIcon={<Refresh />} onClick={() => { reset(); onReset?.(); }}>
          {t('actions.newSearch')}
        </Button>
      </Box>
    </Box>
  );

  const renderError = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <Alert severity="error" sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}>
        {error}
      </Alert>
      <Button variant="contained" startIcon={<Refresh />} onClick={reset}>
        {t('actions.retry')}
      </Button>
    </Box>
  );

  const renderContent = () => {
    if (error) return renderError();
    // Keep the spinner while the pipeline is still running — prevents a flash
    // where the grid appears mid-pipeline before recommendations are ready.
    if (isProcessing) return renderProcessing();
    if (followUpQuestion) return renderFollowUp();
    if (workflow?.status === 'completed') return renderResults();

    return renderWelcome();
  };

  return (
    <Box sx={{ pb: selectedProviderIds.size > 0 ? 10 : 0 }}>
      {renderContent()}
      <ProviderDetailDrawer
        provider={drawerProvider}
        open={!!drawerProvider}
        onClose={() => setDrawerProvider(null)}
      />

      {/* Sticky selection bar */}
      <Slide direction="up" in={selectedProviderIds.size > 0} mountOnEnter unmountOnExit>
        <Paper
          elevation={8}
          sx={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1300,
            p: 2, display: 'flex', alignItems: 'center', gap: 2,
            borderTop: '1px solid', borderColor: 'divider',
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={600}>
              {t('results.selectedCount', '{{count}} of {{max}} providers selected', {
                count: selectedProviderIds.size, max: MAX_PROVIDERS,
              })}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              {Array.from({ length: MAX_PROVIDERS }).map((_, i) => (
                <Box
                  key={i}
                  sx={{
                    width: 32, height: 4, borderRadius: 2,
                    bgcolor: i < selectedProviderIds.size ? 'primary.main' : 'action.disabled',
                    transition: 'background-color 0.2s',
                  }}
                />
              ))}
            </Box>
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setSelectedProviderIds(new Set())}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {t('results.clearSelection', 'Clear')}
          </Button>
          <Button
            variant="contained"
            size="large"
            startIcon={isSendingQuote ? <CircularProgress size={16} color="inherit" /> : <RequestQuote />}
            onClick={handleSendQuote}
            disabled={isSendingQuote}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {t('results.sendQuoteRequest', 'Send Quote Request')}
          </Button>
        </Paper>
      </Slide>
    </Box>
  );
};

export default AIAssistantTab;
