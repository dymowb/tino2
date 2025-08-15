import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { IsString, IsNumber, IsEnum, IsDate, Min } from 'class-validator';
import { User } from './User';
import { Provider } from './Provider';
import { QuoteRequest } from './QuoteRequest';

export enum QuoteStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  WITHDRAWN = 'withdrawn',
}

@Entity('quotes')
@Index(['requestId'])
@Index(['providerId'])
@Index(['customerId'])
@Index(['status'])
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  requestId: string;

  @Column()
  providerId: string;

  @Column()
  customerId: string;

  @ManyToOne(() => QuoteRequest, (quoteRequest) => quoteRequest.quotes)
  @JoinColumn({ name: 'requestId' })
  request: QuoteRequest;

  @ManyToOne(() => Provider, (provider) => provider.quotes)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @ManyToOne(() => User, (user) => user.customerQuotes)
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @Column()
  @IsString()
  serviceType: string;

  @Column({ type: 'text' })
  @IsString()
  description: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  @IsNumber()
  @Min(0)
  estimatedPrice: number;

  @Column({ default: 60 })
  @IsNumber()
  @Min(15)
  estimatedDuration: number;

  @Column({ type: 'datetime' })
  @IsDate()
  validUntil: Date;

  @Column({ type: 'varchar', enum: QuoteStatus, default: QuoteStatus.PENDING })
  @IsEnum(QuoteStatus)
  status: QuoteStatus;

  @Column({ type: 'json', nullable: true })
  breakdown: {
    labor: number;
    materials: number;
    equipment: number;
    other: number;
    tax: number;
  };

  @Column({ type: 'json', nullable: true })
  terms: Array<{
    item: string;
    description: string;
  }>;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'json', nullable: true })
  attachments: string[];

  @Column({ type: 'datetime', nullable: true })
  acceptedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  rejectedAt: Date;

  @Column({ nullable: true })
  rejectionReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}