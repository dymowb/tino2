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
} from '@mui/material';
import { Send, Refresh, AutoAwesome } from '@mui/icons-material';
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

  const renderResults = () => (
    <Box sx={{ py: 2 }}>
      <Typography variant="h6" sx={{ mb: 3 }}>
        {t('results.title')}
      </Typography>
      {results.length === 0 ? (
        <Alert severity="info">{t('results.noResults')}</Alert>
      ) : (
        <Grid container spacing={3}>
          {results.map((provider) => (
            <Grid item xs={12} md={6} lg={4} key={provider.providerId}>
              <AssistantProviderCard provider={provider} />
            </Grid>
          ))}
        </Grid>
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
