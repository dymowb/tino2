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
import { IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { User } from './User';
import { Provider } from './Provider';
import { Booking } from './Booking';

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  CASH = 'cash',
}

@Entity('payments')
@Index(['bookingId'])
@Index(['customerId'])
@Index(['providerId'])
@Index(['status'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bookingId: string;

  @Column()
  customerId: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Booking, (booking) => booking.payments)
  @JoinColumn({ name: 'bookingId' })
  booking: Booking;

  @ManyToOne(() => User, (user) => user.customerPayments)
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @ManyToOne(() => Provider, (provider) => provider.user)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  @IsNumber()
  @Min(0)
  amount: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  platformFee: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  processingFee: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  providerAmount: number;

  @Column({ default: 'USD' })
  @IsString()
  currency: string;

  @Column({ type: 'varchar', enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @Column({ nullable: true })
  stripePaymentIntentId: string;

  @Column({ nullable: true })
  stripeChargeId: string;

  @Column({ nullable: true })
  paypalTransactionId: string;

  @Column({ nullable: true })
  stripeRefundId: string;

  @Column({ type: 'varchar', enum: PaymentStatus, default: PaymentStatus.PENDING })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    last4?: string;
    cardBrand?: string;
    receipt_url?: string;
    failure_reason?: string;
    refund_reason?: string;
    requiresCapture?: boolean;
    escrowHold?: boolean;
    stripeCustomerId?: string;
    dispute_id?: string;
    dispute_reason?: string;
    dispute_status?: string;
    [key: string]: any; // Allow additional properties
  };

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  failedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  refundedAt: Date;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  refundAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
