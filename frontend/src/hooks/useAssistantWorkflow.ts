/**
 * useAssistantWorkflow - Custom hook for AI Assistant workflow management
 *
 * Initial request: streams via SSE (POST ?stream=true) — progress labels and
 * token-by-token narrative appear immediately as the pipeline runs.
 *
 * Follow-up turns (after waiting_for_user): fall back to polling, same as before.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiService,
  WorkflowData,
  WorkflowProviderResult,
  ProviderAnalysis,
  Recommendation,
  VerificationReport,
} from '../services/api';
import type { RequirementsSummary } from '../components/assistant/AIRequirementsSummary';

/** Message in the conversation history */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/** The derived UI state exposed by this hook */
export interface AssistantWorkflowState {
  workflow: WorkflowData | null;
  messages: ChatMessage[];
  isProcessing: boolean;
  isStreaming: boolean;
  /** Current pipeline stage label (e.g. "Searching for providers…") */
  progressMessage: string;
  /** Current pipeline stage key (requirements|search|analysis|recommendation|verification|narrative) for localized labels */
  progressStage: string | null;
  /** Narrative text accumulated from token events (typewriter effect) */
  narrative: string;
  followUpQuestion: string | null;
  results: WorkflowProviderResult[];
  analysisResults: ProviderAnalysis[];
  recommendations: Recommendation[];
  verification: VerificationReport | undefined;
  currentStep: string | null;
  error: string | null;
  /**
   * Start a new workflow. When `requirements` is supplied (re-run path), the
   * backend seeds them as already-complete and skips requirements extraction,
   * running search → analysis → recommendation directly on the edited values.
   */
  startWorkflow: (message: string, requirements?: RequirementsSummary) => void;
  sendMessage: (message: string) => void;
  cancel: () => void;
  reset: () => void;
  isStarting: boolean;
  isSending: boolean;
}

// Terminal statuses where polling should stop
const TERMINAL_STATUSES: WorkflowData['status'][] = ['completed', 'failed', 'cancelled'];

// ─── SSE line parser ──────────────────────────────────────────────────────────
// Parses `data: {...}\n\n` lines out of a raw text chunk, handling the fact
// that chunks from the network may be split arbitrarily mid-line.
function parseSSEChunk(buffer: string, incoming: string): [object[], string] {
  const combined = buffer + incoming;
  const lines = combined.split('\n');
  const remaining = lines.pop() ?? ''; // incomplete last line stays in buffer
  const events: object[] = [];

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // malformed line — skip
    }
  }

  return [events, remaining];
}

export function useAssistantWorkflow(): AssistantWorkflowState {
  const queryClient = useQueryClient();

  // ─── Core state ────────────────────────────────────────────────────
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Streaming-specific state
  const [isStreaming, setIsStreaming] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  // Stage key (requirements|search|analysis|recommendation|verification|narrative)
  // from the backend SSE so the component can render a localized label rather
  // than the backend's English message string.
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [narrative, setNarrative] = useState('');
  const [streamedWorkflow, setStreamedWorkflow] = useState<WorkflowData | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  // AbortController ref so cancel() can stop an in-flight stream
  const abortRef = useRef<AbortController | null>(null);

  // ─── Polling (follow-up turns only) ────────────────────────────────
  // Enabled only when we have a workflowId and no active stream.
  // The stream IS the data source during initial run; polling takes over
  // for subsequent turns after waiting_for_user.
  const { data: polledWorkflow } = useQuery({
    queryKey: ['assistant-workflow', workflowId],
    queryFn: () => apiService.getWorkflow(workflowId!),
    enabled: workflowId !== null && !isStreaming,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 2000;
      if (TERMINAL_STATUSES.includes(status)) return false;
      if (status === 'waiting_for_user') return false;
      return 2000;
    },
  });

  // Effective workflow: polled result (fresher after follow-ups) overrides streamed
  const workflow = polledWorkflow ?? streamedWorkflow;

  // Persist each agent follow-up question into the conversation transcript as it
  // appears. Both the initial streamed turn and every subsequent polled turn
  // funnel through here, so multi-turn conversations keep their full history
  // (previously only the first question was recorded → later ones vanished).
  const followUpQuestion = workflow?.context?.requirements?.followUpQuestion ?? null;
  useEffect(() => {
    if (!followUpQuestion) return;
    setMessages((prev) =>
      prev.some((m) => m.role === 'assistant' && m.content === followUpQuestion)
        ? prev
        : [...prev, { id: `q-${Date.now()}`, role: 'assistant', content: followUpQuestion, timestamp: new Date() }]
    );
  }, [followUpQuestion]);

  // ─── Start workflow (streaming) ─────────────────────────────────────
  const startWorkflow = useCallback(async (message: string, requirements?: RequirementsSummary) => {
    // Reset state for a fresh run
    setIsStreaming(true);
    setNarrative('');
    setProgressMessage('Starting…');
    setProgressStage(null);
    setStreamedWorkflow(null);
    setStreamError(null);
    setWorkflowId(null);
    setMessages([
      { id: Date.now().toString(), role: 'user', content: message, timestamp: new Date() },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem('accessToken');
      const apiBase = import.meta.env.VITE_API_URL || '/api/v1';
      const response = await fetch(`${apiBase}/agentic-assistant/workflows?stream=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          initialMessage: message,
          locale: localStorage.getItem('i18nextLng') || 'pt',
          ...(requirements && { requirements }),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const [events, nextBuffer] = parseSSEChunk(buffer, decoder.decode(value, { stream: true }));
        buffer = nextBuffer;

        for (const event of events as any[]) {
          switch (event.type) {
            case 'started':
              setWorkflowId(event.workflowId);
              break;

            case 'progress':
              setProgressMessage(event.message);
              setProgressStage(event.stage ?? null);
              break;

            case 'token':
              setNarrative((prev) => prev + event.text);
              break;

            case 'complete':
              setStreamedWorkflow(event.data);
              // The agent's follow-up question (if any) is appended to `messages`
              // by the effect below — this keeps the initial turn and every
              // subsequent polled turn on the same code path, so no question is
              // dropped from the transcript on multi-turn conversations.
              break;

            case 'error':
              setStreamError(event.message ?? 'An error occurred');
              break;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStreamError('Connection error — please try again');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  // ─── Send follow-up message (polling path) ──────────────────────────
  const sendMutation = useMutation({
    mutationFn: (message: string) => apiService.sendWorkflowMessage(workflowId!, message),
    onSuccess: (_data, message) => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'user', content: message, timestamp: new Date() },
      ]);
      queryClient.invalidateQueries({ queryKey: ['assistant-workflow', workflowId] });
    },
  });

  // ─── Cancel ────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    if (workflowId) {
      apiService.cancelWorkflow(workflowId);
      queryClient.removeQueries({ queryKey: ['assistant-workflow', workflowId] });
    }
    setWorkflowId(null);
    setMessages([]);
    setIsStreaming(false);
    setStreamedWorkflow(null);
    setNarrative('');
    setProgressMessage('');
  }, [workflowId, queryClient]);

  // ─── Reset ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (workflowId) {
      queryClient.removeQueries({ queryKey: ['assistant-workflow', workflowId] });
    }
    setWorkflowId(null);
    setMessages([]);
    setIsStreaming(false);
    setStreamedWorkflow(null);
    setNarrative('');
    setProgressMessage('');
    setStreamError(null);
  }, [workflowId, queryClient]);

  // ─── Derived UI state ───────────────────────────────────────────────
  const derivedState = useMemo(() => {
    return {
      isProcessing: isStreaming || workflow?.status === 'pending' || workflow?.status === 'active',
      followUpQuestion: workflow?.context?.requirements?.followUpQuestion ?? null,
      results: workflow?.context?.searchResults ?? [],
      analysisResults: workflow?.context?.analysisResults ?? [],
      recommendations: workflow?.context?.recommendations ?? [],
      verification: workflow?.context?.verification,
      currentStep: workflow?.currentAgent ?? null,
      error: streamError ?? workflow?.error?.message ?? null,
    };
  }, [workflow, isStreaming, streamError]);

  return {
    workflow: workflow ?? null,
    messages,
    isStreaming,
    progressMessage,
    progressStage,
    narrative,
    ...derivedState,
    startWorkflow,
    sendMessage: sendMutation.mutate,
    cancel,
    reset,
    isStarting: isStreaming,
    isSending: sendMutation.isPending,
  };
}
