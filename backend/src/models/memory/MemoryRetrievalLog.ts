import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type MemoryType = 'semantic' | 'episodic' | 'procedural';

@Entity('memory_retrieval_log')
export class MemoryRetrievalLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  userId: string;

  @Column('text')
  queryText: string;

  // query_embedding vector(1024) — not mapped, stored for future analysis

  @Column({ type: 'varchar', length: 20 })
  memoryType: MemoryType;

  @Column('jsonb')
  results: Array<{ memoryId: string; score: number; rank: number }>;

  @Column('text', { nullable: true })
  workflowId: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  retrievedAt: Date;
}
