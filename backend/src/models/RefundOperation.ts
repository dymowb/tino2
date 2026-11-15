import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Payment } from './Payment';
import { User } from './User';

export enum RefundOperationStatus {
  PENDING = 'pending',
  INDETERMINATE = 'indeterminate',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

/**
 * Durable boundary between Tino's payment state and Stripe's refund API.
 *
 * A row exists before the network call. Its id is the Stripe idempotency key,
 * so retries after a timeout or process failure ask Stripe about the same refund
 * instead of creating another one.
 */
@Entity('refund_operations')
@Index(['paymentId', 'status'])
@Index(['stripeRefundId'], { unique: true, where: '"stripeRefundId" IS NOT NULL' })
export class RefundOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  idempotencyKey: string;

  @Column()
  paymentId: string;

  @ManyToOne(() => Payment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentId' })
  payment: Payment;

  @Column()
  requestedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requestedBy' })
  requester: User;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount: number;

  @Column({ default: false })
  fullRefund: boolean;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', default: RefundOperationStatus.PENDING })
  status: RefundOperationStatus;

  @Column({ nullable: true })
  stripeRefundId: string | null;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
