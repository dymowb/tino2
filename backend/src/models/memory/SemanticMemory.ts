import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type MemorySourceType = 'extraction' | 'reflection' | 'manual';

@Entity('semantic_memories')
@Index(['userId', 'isActive'])
export class SemanticMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  userId: string;

  @Column('text')
  content: string;

  // embedding vector(1024) lives in DB — not mapped here.
  // All vector ops use MemoryDataSource.query() directly.

  @Column('float', { default: 0.8 })
  confidence: number;

  @Column('float', { default: 0.5 })
  importance: number;

  @Column({ type: 'varchar', length: 20, default: 'extraction' })
  sourceType: MemorySourceType;

  @Column('text', { nullable: true })
  sourceRef: string | null;

  @Column('int', { default: 0 })
  accessCount: number;

  @Column('timestamp with time zone', { nullable: true })
  lastAccessedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column('timestamp with time zone', { nullable: true })
  expiresAt: Date | null;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null;
}
