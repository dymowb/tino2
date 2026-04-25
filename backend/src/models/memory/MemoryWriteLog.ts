import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type WriteAction = 'created' | 'merged' | 'discarded' | 'deprecated';
import { MemoryType } from './MemoryRetrievalLog';

@Entity('memory_write_log')
export class MemoryWriteLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index('write_log_user_idx', ['userId'])
  userId: string;

  @Column({ name: 'memory_type', type: 'varchar', length: 20 })
  memoryType: MemoryType;

  @Column({ type: 'varchar', length: 20 })
  action: WriteAction;

  @Column({ name: 'memory_id', type: 'uuid', nullable: true })
  memoryId: string | null;

  @Column({ name: 'source_content', type: 'text' })
  sourceContent: string;

  @Column({ name: 'extracted_content', type: 'text', nullable: true })
  extractedContent: string | null;

  @Column({ name: 'dedup_decision', type: 'jsonb', nullable: true })
  dedupDecision: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
