import { ProceduralResult, RetrievedMemories } from './MemoryRetriever';

export class ContextInjector {
  /**
   * Format retrieved memories into a <memory> block for system-prompt injection.
   * Procedural rules are NOT included here — they go in the separate <constraints> block
   * (see formatConstraints). Returns null when there is nothing to inject.
   */
  format(memories: RetrievedMemories): string | null {
    const hasContent = memories.semantic.length > 0 || memories.episodic.length > 0;
    if (!hasContent) return null;

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

    lines.push('</memory>');
    return lines.join('\n');
  }

  /**
   * Format active procedural rules into a <constraints> block.
   * Uses imperative language so the LLM treats these as mandatory, not advisory.
   * Returns null when there are no active rules.
   */
  formatConstraints(procedural: ProceduralResult[]): string | null {
    if (procedural.length === 0) return null;

    const lines: string[] = [
      '<constraints>',
      'REGRAS COMPORTAMENTAIS — você DEVE seguir estas regras obrigatoriamente. Elas têm prioridade sobre seu comportamento padrão.',
    ];
    for (const p of procedural) {
      lines.push(`• ${p.promptFragment}`);
    }
    lines.push('</constraints>');
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
