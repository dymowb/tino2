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

import React, { useState } from 'react';
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
} from '@mui/material';
import { CheckCircleOutline } from '@mui/icons-material';
import { Send, Refresh, AutoAwesome, EmojiEvents, WarningAmber } from '@mui/icons-material';
import { Recommendation } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { useAssistantWorkflow } from '../../hooks/useAssistantWorkflow';
import AssistantProviderCard from './AssistantProviderCard';

const AIAssistantTab: React.FC = () => {
  const { t } = useTranslation('assistant');
  const {
    workflow,
    messages,
    isProcessing,
    followUpQuestion,
    results,
    analysisResults,
    recommendations,
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
      default:
        return t('status.starting');
    }
  };

  // ─── TODO: Conditional Rendering ──────────────────────────────────
  //
  // Render different content based on workflow state.
  // The logic should follow this priority (check in order):
  //
  // 1. If error is not null → show error state
  // 2. If results.length > 0 (workflow completed with results) → show results
  // 3. If followUpQuestion is not null → show follow-up question + input
  // 4. If isProcessing → show progress indicator
  // 5. Otherwise (no workflow) → show welcome state
  //
  // Each state has its JSX written below as helper functions.
  // Your job: write the renderContent() function that picks the right one.
  //

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
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={!input.trim() || isStarting}
          startIcon={isStarting ? <CircularProgress size={20} /> : <Send />}
        >
          {t('actions.send')}
        </Button>
      </Box>
    </Box>
  );

  const renderProcessing = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <CircularProgress size={48} sx={{ mb: 2 }} />
      <Typography variant="h6" sx={{ mb: 1 }}>
        {getStatusMessage(currentStep)}
      </Typography>
      {/* Show conversation history */}
      {messages.length > 0 && (
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
      <Button
        variant="text"
        color="inherit"
        onClick={cancel}
        sx={{ mt: 2 }}
      >
        {t('actions.cancel')}
      </Button>
    </Box>
  );

  const renderFollowUp = () => (
    <Box sx={{ maxWidth: 600, mx: 'auto', py: 4 }}>
      {/* Show conversation history */}
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
        <Stack direction="row" spacing={1}>
          <Button
            type="submit"
            variant="contained"
            disabled={!input.trim() || isSending}
            startIcon={isSending ? <CircularProgress size={20} /> : <Send />}
          >
            {t('actions.send')}
          </Button>
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
            <Rating value={rec.provider.rating} readOnly size="small" precision={0.5} />
            <Typography variant="body2" color="text.secondary">
              ({rec.provider.reviewCount})
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
            <Chip label={`Best for: ${rec.bestFor}`} size="small" variant="outlined" sx={{ mb: 1.5 }} />
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
        <Box sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={1}>
            <Button fullWidth variant="outlined" size="small">
              {t('actions.viewProfile')}
            </Button>
            <Button fullWidth variant="contained" size="small">
              {t('actions.requestQuote')}
            </Button>
          </Stack>
        </Box>
      </Card>
    );
  };

  const renderResults = () => (
    <Box sx={{ py: 2 }}>
      {recommendations.length > 0 ? (
        <>
          <Typography variant="h6" sx={{ mb: 3 }}>
            {t('results.recommendationsTitle', 'Your Top Recommendations')}
          </Typography>
          {recommendations
            .sort((a, b) => a.rank - b.rank)
            .map(renderRecommendationCard)}
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
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}
      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button variant="outlined" startIcon={<Refresh />} onClick={reset}>
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

  // TODO: Implement renderContent()
  //
  // Check the conditions in priority order (listed above) and return
  // the appropriate render function call.
  //
  // Example structure:
  //   if (someCondition) return renderSomething();
  //   if (otherCondition) return renderOther();
  //   ...
  //   return renderDefault();
  //
  const renderContent = () => {
    // YOUR CODE HERE
    if (error) return renderError();
    if (results.length > 0) return renderResults();
    if (followUpQuestion) return renderFollowUp();
    if (isProcessing) return renderProcessing();

    return renderWelcome();
  };

  return (
    <Box>
      {renderContent()}
    </Box>
  );
};

export default AIAssistantTab;
