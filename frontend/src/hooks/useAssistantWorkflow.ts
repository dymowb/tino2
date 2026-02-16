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
import { apiService, WorkflowData, WorkflowProviderResult } from '../services/api';

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

  // ─── TODO 1: Start Workflow Mutation ──────────────────────────────
  //
  // Use useMutation to call apiService.startWorkflow(message)
  //
  // On success:
  //   1. Set the workflowId (this triggers polling)
  //   2. Add the user's message to the messages array
  //
  // Hints:
  //   - mutationFn receives the message string
  //   - onSuccess receives the API response { workflowId, status }
  //   - Use setWorkflowId() and setMessages()
  //   - Generate a message id with Date.now().toString()
  //
  const startMutation = useMutation({
    mutationFn: (message: string) => apiService.startWorkflow(message),
    onSuccess: (data, message) => {
      // TODO: Set workflowId from data.workflowId
      setWorkflowId(data.workflowId);
      // TODO: Add user message to messages array
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

  // ─── TODO 2: Polling Query ────────────────────────────────────────
  //
  // Use useQuery to poll apiService.getWorkflow(workflowId)
  //
  // Key config:
  //   - queryKey: ['assistant-workflow', workflowId]
  //   - enabled: only when workflowId is not null
  //   - refetchInterval: return 2000 (ms) while workflow is active,
  //     return false when status is terminal (completed/failed/cancelled)
  //     or when waiting_for_user
  //
  // The refetchInterval callback receives the query object.
  // Access the current status via: query.state.data?.status
  //
  // Hint: Check if the status is in TERMINAL_STATUSES or is 'waiting_for_user'
  //
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

  // ─── TODO 3: Send Follow-up Message Mutation ──────────────────────
  //
  // Use useMutation to call apiService.sendWorkflowMessage(workflowId, message)
  //
  // On success:
  //   1. Add the user's answer to messages
  //   2. Invalidate the workflow query to trigger a fresh fetch
  //      (use queryClient.invalidateQueries)
  //
  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      apiService.sendWorkflowMessage(workflowId!, message),
    onSuccess: (_data, message) => {
      // TODO: Add user message to messages array
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'user',
          content: message,
          timestamp: new Date(),
        },
      ]);
      // TODO: Invalidate the query to resume polling
      queryClient.invalidateQueries({ queryKey: ['assistant-workflow', workflowId] });
    },
  });

  // ─── TODO 4: Derive UI State ──────────────────────────────────────
  //
  // Use useMemo to compute derived values from the workflow data.
  // This avoids recomputing on every render.
  //
  // From workflow?.status and workflow?.context, derive:
  //   - isProcessing: true when status is 'pending' or 'active'
  //   - followUpQuestion: the follow-up question string when status is 'waiting_for_user'
  //     (found at workflow?.context?.requirements?.followUpQuestion)
  //   - results: the searchResults array (or empty array)
  //     (found at workflow?.context?.searchResults)
  //   - currentStep: the currentAgent name (or null)
  //   - error: the error message if status is 'failed' (or null)
  //     (found at workflow?.error?.message)
  //
  const derivedState = useMemo(() => {
    return {
      isProcessing: workflow?.status === 'pending' || workflow?.status === 'active',
      followUpQuestion: workflow?.context?.requirements?.followUpQuestion ?? null,
      results: workflow?.context?.searchResults ?? [],
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
