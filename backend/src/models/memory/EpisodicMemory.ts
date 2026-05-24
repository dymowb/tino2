import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('episodic_memories')
@Index(['userId', 'isActive'])
export class EpisodicMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  userId: string;

  @Column('text')
  summary: string;

  // embedding vector(1024) — managed via raw SQL only

  @Column('text', { nullable: true })
  workflowId: string | null;

  @Column('uuid', { nullable: true })
  bookingId: string | null;

  @Column('float', { default: 0.5 })
  importance: number;

  @Column('int', { default: 0 })
  accessCount: number;

  @Column('timestamp with time zone')
  occurredAt: Date;

  @Column('timestamp with time zone', { nullable: true })
  lastAccessedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column('timestamp with time zone', { nullable: true })
  expiresAt: Date | null;

  @Column('boolean', { default: true })
  isActive: boolean;

  @Column('timestamp with time zone', { nullable: true })
  reflectedAt: Date | null;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, any> | null;
}
