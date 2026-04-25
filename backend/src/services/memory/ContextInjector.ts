import { RetrievedMemories } from './MemoryRetriever';

export class ContextInjector {
  /**
   * Format retrieved memories into a <memory> block for system-prompt injection.
   * Returns null when there is nothing to inject so callers can skip prepending.
   */
  format(memories: RetrievedMemories): string | null {
    if (!memories.hasAny) return null;

    const lines: string[] = ['<memory>'];

    if (memories.semantic.length > 0) {
      lines.push('[O QUE SEI SOBRE VOCÊ]');
      for (const m of memories.semantic) {
        lines.push(`• ${m.content}`);
      }
    }

    if (memories.episodic.length > 0) {
      if (lines.length > 1) lines.push('');
      lines.push('[CONTEXTO RECENTE]');
      for (const e of memories.episodic) {
        lines.push(`• ${this.shortDate(e.occurredAt)}: ${e.summary}`);
      }
    }

    if (memories.procedural.length > 0) {
      if (lines.length > 1) lines.push('');
      lines.push('[PREFERÊNCIAS ATIVAS]');
      for (const p of memories.procedural) {
        lines.push(`• ${p.promptFragment}`);
      }
    }

    lines.push('</memory>');
    return lines.join('\n');
  }

  /**
   * Prepend the <memory> block to baseSystemPrompt.
   * If there are no memories, returns baseSystemPrompt unchanged.
   */
  inject(memories: RetrievedMemories, baseSystemPrompt: string): string {
    const block = this.format(memories);
    return block ? `${block}\n\n${baseSystemPrompt}` : baseSystemPrompt;
  }

  private shortDate(date: Date): string {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}

export const contextInjector = new ContextInjector();
