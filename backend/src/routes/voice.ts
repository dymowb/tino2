import { Router, Request, Response } from 'express';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';
import { File as NodeFile } from 'node:buffer';
import { authenticate } from '@/middleware/auth';
import { getAiSetting } from '@/services/AiConfigurationService';

// Node 18 doesn't expose File as a global; OpenAI SDK v6 requires it for uploads
if (!globalThis.File) (globalThis as any).File = NodeFile;

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  return new OpenAI({ apiKey: key });
}

function requiredVoiceSetting(name: 'VOICE_TRANSCRIPTION_MODEL' | 'VOICE_TTS_MODEL'): string {
  const value = getAiSetting(name === 'VOICE_TRANSCRIPTION_MODEL' ? 'transcription' : 'speech');
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

// Voice is an optional enhancement. When no OpenAI key is configured (e.g. dev),
// degrade silently with 204 so the client just skips voice instead of surfacing a 500.
const hasOpenAI = () => !!process.env.OPENAI_API_KEY;

// POST /api/v1/voice/transcribe
// Accepts audio blob (webm/ogg/wav/mp4), returns {transcript}
router.post(
  '/transcribe',
  authenticate,
  upload.single('audio'),
  async (req: Request, res: Response) => {
    if (!hasOpenAI()) {
      res.status(204).end();
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No audio file provided' });
      return;
    }

    const ext = req.file.mimetype.includes('webm')
      ? 'webm'
      : req.file.mimetype.includes('ogg')
        ? 'ogg'
        : req.file.mimetype.includes('wav')
          ? 'wav'
          : 'mp4';

    try {
      const openai = getOpenAI();
      const result = await openai.audio.transcriptions.create({
        file: await toFile(req.file.buffer, `recording.${ext}`, { type: req.file.mimetype }),
        model: requiredVoiceSetting('VOICE_TRANSCRIPTION_MODEL'),
        language: 'pt',
      });
      res.json({ success: true, data: { transcript: result.text } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// POST /api/v1/voice/synthesize
// Accepts {text}, streams back mp3 audio
router.post('/synthesize', authenticate, async (req: Request, res: Response) => {
  if (!hasOpenAI()) {
    res.status(204).end();
    return;
  }
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ success: false, error: 'No text provided' });
    return;
  }

  // Truncate to ~4000 chars so TTS doesn't time out on very long responses
  const truncated = text.length > 4000 ? text.slice(0, 4000) + '…' : text;

  try {
    const openai = getOpenAI();
    const mp3 = await openai.audio.speech.create({
      model: requiredVoiceSetting('VOICE_TTS_MODEL'),
      voice: 'nova', // natural, friendly — good fit for a service assistant
      input: truncated,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
