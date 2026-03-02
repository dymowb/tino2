/**
 * useAssistantWorkflow - Custom hook for AI Assistant workflow management
 *
 * Handles:
 * - Starting a workflow via mutation
 * - Polling workflow status via conditional refetchInterval
 * - Deriving UI state from workflow data
 * - Tracking conversation message history
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, WorkflowData, WorkflowProviderResult, ProviderAnalysis, Recommendation, VerificationReport } from '../services/api';

/** Message in the conversation history */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/** The derived UI state exposed by this hook */
export interface AssistantWorkflowState {
  /** Current workflow data from the API (null if no workflow started) */
  workflow: WorkflowData | null;

  /** Conversation messages for display */
  messages: ChatMessage[];

  /** Whether the workflow is actively being processed */
  isProcessing: boolean;

  /** Follow-up question from the Requirements Agent (null if none) */
  followUpQuestion: string | null;

  /** Provider results when workflow is completed */
  results: WorkflowProviderResult[];

  /** Analysis results from Analysis Agent (keyed by providerId) */
  analysisResults: ProviderAnalysis[];

  /** Ranked recommendations from Recommendation Agent */
  recommendations: Recommendation[];

  /** Verification report from Verification Agent (undefined if timed out or not yet run) */
  verification: VerificationReport | undefined;

  /** Which agent is currently working (for progress display) */
  currentStep: string | null;

  /** Error message if workflow failed */
  error: string | null;

  /** Start a new workflow with the user's initial message */
  startWorkflow: (message: string) => void;

  /** Send a follow-up answer to the assistant */
  sendMessage: (message: string) => void;

  /** Cancel the current workflow */
  cancel: () => void;

  /** Reset to initial state (for "New Search") */
  reset: () => void;

  /** Whether the start mutation is in flight */
  isStarting: boolean;

  /** Whether a message send is in flight */
  isSending: boolean;
}

// Terminal statuses where polling should stop
const TERMINAL_STATUSES: WorkflowData['status'][] = ['completed', 'failed', 'cancelled'];

export function useAssistantWorkflow(): AssistantWorkflowState {
  const queryClient = useQueryClient();

  // Track the active workflow ID
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  // Track conversation messages for the chat display
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const startMutation = useMutation({
    mutationFn: (message: string) => apiService.startWorkflow(message),
    onSuccess: (data, message) => {
      setWorkflowId(data.workflowId);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          content: message,
          timestamp: new Date(),
        },
      ]);
    },
  });

  const { data: workflow } = useQuery({
    queryKey: ['assistant-workflow', workflowId],
    queryFn: () => apiService.getWorkflow(workflowId!),
    enabled: workflowId !== null, // Only enabled when workflowId is set
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL_STATUSES.includes(status)) {
        return false;
      }
      if (status === 'waiting_for_user') {
        return false;
      }
      return 2000; // Poll every 2 seconds while active
    },
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      apiService.sendWorkflowMessage(workflowId!, message),
    onSuccess: (_data, message) => {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          content: message,
          timestamp: new Date(),
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ['assistant-workflow', workflowId] });
    },
  });

  const derivedState = useMemo(() => {
    return {
      isProcessing: workflow?.status === 'pending' || workflow?.status === 'active',
      followUpQuestion: workflow?.context?.requirements?.followUpQuestion ?? null,
      results: workflow?.context?.searchResults ?? [],
      analysisResults: workflow?.context?.analysisResults ?? [],
      recommendations: workflow?.context?.recommendations ?? [],
      verification: workflow?.context?.verification,
      currentStep: workflow?.currentAgent ?? null,
      error: workflow?.error?.message ?? null,
    };
  }, [workflow]);

  // ─── Cancel Handler ───────────────────────────────────────────────
  const cancel = useCallback(() => {
    if (workflowId) {
      apiService.cancelWorkflow(workflowId);
      setWorkflowId(null);
      setMessages([]);
      queryClient.removeQueries({ queryKey: ['assistant-workflow', workflowId] });
    }
  }, [workflowId, queryClient]);

  // ─── Reset Handler ────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (workflowId) {
      queryClient.removeQueries({ queryKey: ['assistant-workflow', workflowId] });
    }
    setWorkflowId(null);
    setMessages([]);
  }, [workflowId, queryClient]);

  return {
    workflow: workflow ?? null,
    messages,
    ...derivedState,
    startWorkflow: startMutation.mutate,
    sendMessage: sendMutation.mutate,
    cancel,
    reset,
    isStarting: startMutation.isPending,
    isSending: sendMutation.isPending,
  };
}
