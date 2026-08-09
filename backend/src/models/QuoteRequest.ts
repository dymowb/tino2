import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { IsString, IsEnum, IsDate } from 'class-validator';
import { User } from './User';
import { Quote } from './Quote';

export enum QuoteRequestStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('quote_requests')
@Index(['customerId'])
@Index(['status'])
@Index(['serviceType'])
export class QuoteRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @ManyToOne(() => User, (user) => user.quoteRequests)
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column()
  @IsString()
  serviceType: string;

  // Canonical category (from service_categories) resolved from serviceType. Drives
  // provider matching for broadcast requests. Null = uncategorised → broadcast-all.
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'text' })
  @IsString()
  description: string;

  @Column({ type: 'jsonb' })
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };

  @Column({ type: 'timestamp', nullable: true })
  @IsDate()
  preferredDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  budget: {
    min: number;
    max: number;
    currency: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  images: string[];

  // When set, the request is targeted at these specific providers (by provider id).
  // Null/empty = broadcast to all matching providers. Drives provider-side visibility.
  @Column({ type: 'jsonb', nullable: true })
  targetProviderIds: string[];

  // Present when this request was created from a completed booking's rebook flow.
  @Column({ type: 'uuid', nullable: true })
  sourceBookingId: string | null;

  @Column({ type: 'varchar', enum: UrgencyLevel, default: UrgencyLevel.MEDIUM })
  @IsEnum(UrgencyLevel)
  urgency: UrgencyLevel;

  @Column({ type: 'varchar', enum: QuoteRequestStatus, default: QuoteRequestStatus.OPEN })
  @IsEnum(QuoteRequestStatus)
  status: QuoteRequestStatus;

  @Column({ type: 'jsonb', nullable: true })
  requirements: Array<{
    category: string;
    requirement: string;
    mandatory: boolean;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  availability: Array<{
    date: Date;
    timeSlots: Array<{
      start: string;
      end: string;
    }>;
  }>;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 25.0 })
  searchRadius: number;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ default: 0 })
  quotesReceived: number;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date;

  @Column({ nullable: true })
  closureReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Quote, (quote) => quote.request)
  quotes: Quote[];
}
