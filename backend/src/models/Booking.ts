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
import { IsString, IsNumber, IsEnum, IsDate, Min } from 'class-validator';
import { User } from './User';
import { Provider } from './Provider';
import { Payment } from './Payment';
import { Review } from './Review';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  PENDING_COMPLETION = 'pending_completion',
  COMPLETED = 'completed',
  IN_DISPUTE = 'in_dispute',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('bookings')
@Index(['customerId'])
@Index(['providerId'])
@Index(['status'])
@Index(['scheduledDate'])
@Index(['quoteId'], { unique: true, where: '"quoteId" IS NOT NULL' })
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column()
  providerId: string;

  // Origin link: when a booking is created by accepting a quote, these point back
  // to that quote and its request. Null for any legacy/direct bookings created
  // before the unified-lifecycle refactor. Lets the bookings hub render one
  // continuous "request → quotes → booking" card instead of duplicates.
  @Column({ type: 'uuid', nullable: true })
  quoteId: string | null;

  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @ManyToOne(() => User, (user) => user.customerBookings)
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @ManyToOne(() => Provider, (provider) => provider.bookings)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column()
  @IsString()
  serviceType: string;

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

  @Column({ type: 'timestamp' })
  @IsDate()
  scheduledDate: Date;

  @Column({ default: 60 })
  @IsNumber()
  @Min(15)
  estimatedDuration: number;

  @Column({ type: 'varchar', enum: BookingStatus, default: BookingStatus.PENDING })
  @IsEnum(BookingStatus)
  status: BookingStatus;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @Column({ type: 'varchar', enum: PaymentStatus, default: PaymentStatus.PENDING })
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  specialInstructions: string;

  @Column({ type: 'jsonb', nullable: true })
  additionalServices: Array<{
    name: string;
    price: number;
    approved: boolean;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  timeline: Array<{
    status: BookingStatus;
    datetime: Date;
    note?: string;
  }>;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ type: 'timestamp', nullable: true })
  holdPlacedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  @Column({ nullable: true })
  cancellationReason: string;

  @Column({ default: false })
  isDisputed: boolean;

  @Column({ nullable: true })
  disputeStatus: string;

  @Column({ nullable: true })
  disputeReason: string;

  @Column({ type: 'timestamp', nullable: true })
  disputedAt: Date;

  @Column({ nullable: true })
  disputeResolution: string;

  @Column({ type: 'timestamp', nullable: true })
  disputeResolvedAt: Date;

  @Column({ nullable: true })
  disputeResolvedBy: string;

  @Column({ type: 'text', nullable: true })
  adminNotes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Payment, (payment) => payment.booking)
  payments: Payment[];

  @OneToMany(() => Review, (review) => review.booking)
  reviews: Review[];
}
