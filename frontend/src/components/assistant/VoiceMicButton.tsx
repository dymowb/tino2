import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Tooltip, Box, keyframes } from '@mui/material';
import { Mic, MicOff, Stop } from '@mui/icons-material';
import { tokens } from '../../theme/theme';
import { apiService } from '../../services/api';

interface VoiceMicButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

type RecordState = 'idle' | 'recording' | 'transcribing';

const pulse = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(196,83,42,0.5); }
  70%  { box-shadow: 0 0 0 12px rgba(196,83,42,0); }
  100% { box-shadow: 0 0 0 0 rgba(196,83,42,0); }
`;

const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({ onTranscript, disabled }) => {
  const { t } = useTranslation('assistant');
  const [state, setState] = useState<RecordState>('idle');
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microfone requer HTTPS. Use newtino.com.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all microphone tracks
        stream.getTracks().forEach(t => t.stop());
        setState('transcribing');

        const blob = new Blob(chunksRef.current, { type: mimeType });

        try {
          const transcript = await apiService.voiceTranscribe(blob, 'recording.webm');
          if (transcript.trim()) {
            onTranscript(transcript.trim());
          } else {
            setError('Não entendi. Tente novamente.');
          }
        } catch (err: any) {
          console.error('[Voice] transcribe error:', err?.message ?? err);
          setError(`Erro: ${err?.message ?? 'desconhecido'}`);
        } finally {
          setState('idle');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setState('recording');
    } catch {
      setError('Microfone não disponível.');
      setState('idle');
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const handleClick = () => {
    if (state === 'idle') startRecording();
    else if (state === 'recording') stopRecording();
  };

  // These were hardcoded Portuguese in an app that ships three languages — and
  // once the label became the button's accessible name, an English or Spanish
  // screen-reader user would have been read Portuguese.
  const label =
    state === 'idle' ? t('voice.idle')
    : state === 'recording' ? t('voice.recording')
    : t('voice.transcribing');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      {/* `describeChild` matters here: without it MUI puts `aria-label` on the
          child, and the child is the <span> that exists so a disabled button can
          still show a tooltip. `aria-label` on a plain span is prohibited ARIA and
          named nothing. The button carries its own name; the tooltip only
          describes it. */}
      <Tooltip title={error ?? label} arrow describeChild>
        <span>
          <IconButton
            onClick={handleClick}
            aria-label={label}
            disabled={disabled || state === 'transcribing'}
            size="large"
            sx={{
              width: 48, height: 48,
              bgcolor: state === 'recording' ? tokens.color.terra : 'transparent',
              border: `2px solid ${state === 'recording' ? tokens.color.terra : tokens.color.earth}`,
              color: state === 'recording' ? '#fff' : tokens.color.earth,
              borderRadius: '50%',
              transition: 'all 0.2s ease',
              animation: state === 'recording' ? `${pulse} 1.5s ease-out infinite` : 'none',
              '&:hover': {
                bgcolor: state === 'recording' ? tokens.color.terraDark : `${tokens.color.earth}15`,
              },
              '&:disabled': { opacity: 0.4, borderColor: 'divider', color: 'text.disabled' },
            }}
          >
            {state === 'recording' ? <Stop /> : state === 'transcribing' ? <MicOff /> : <Mic />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

export default VoiceMicButton;
