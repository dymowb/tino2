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
  COMPLETED = 'completed',
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
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  customerId: string;

  @Column()
  providerId: string;

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

  @Column({ type: 'json' })
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };

  @Column({ type: 'datetime' })
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

  @Column({ type: 'json', nullable: true })
  additionalServices: Array<{
    name: string;
    price: number;
    approved: boolean;
  }>;

  @Column({ type: 'json', nullable: true })
  timeline: Array<{
    status: BookingStatus;
    datetime: Date;
    note?: string;
  }>;

  @Column({ type: 'datetime', nullable: true })
  confirmedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  cancelledAt: Date;

  @Column({ nullable: true })
  cancellationReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Payment, (payment) => payment.booking)
  payments: Payment[];

  @OneToMany(() => Review, (review) => review.booking)
  reviews: Review[];
}