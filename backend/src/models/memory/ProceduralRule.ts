import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type ProceduralRuleStatus = 'pending' | 'active' | 'deprecated' | 'rejected';

@Entity('procedural_rules')
@Index(['userId', 'status'])
export class ProceduralRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  userId: string;

  @Column('text')
  ruleText: string;

  @Column('text')
  promptFragment: string;

  // embedding vector(1024) — managed via raw SQL only

  @Column('float')
  confidence: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ProceduralRuleStatus;

  @Column('uuid', { array: true, nullable: true })
  sourceEpisodeIds: string[] | null;

  @Column('int', { default: 1 })
  version: number;

  @Column('boolean', { default: false })
  autoApproved: boolean;

  @Column('float', { nullable: true })
  approvalThresholdUsed: number | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @Column('timestamp with time zone', { nullable: true })
  activatedAt: Date | null;

  @Column('timestamp with time zone', { nullable: true })
  deprecatedAt: Date | null;
}
