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
import { IsString, IsNumber, Min, Max } from 'class-validator';
import { User } from './User';
import { Provider } from './Provider';
import { Booking } from './Booking';

@Entity('reviews')
@Index(['bookingId'])
@Index(['customerId'])
@Index(['providerId'])
@Index(['rating'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bookingId: string;

  @Column()
  customerId: string;

  @Column()
  providerId: string;

  @ManyToOne(() => Booking, (booking) => booking.reviews)
  @JoinColumn({ name: 'bookingId' })
  booking: Booking;

  @ManyToOne(() => User, (user) => user.customerReviews)
  @JoinColumn({ name: 'customerId' })
  customer: User;

  @ManyToOne(() => Provider, (provider) => provider.reviews)
  @JoinColumn({ name: 'providerId' })
  provider: Provider;

  @Column({ type: 'numeric', precision: 3, scale: 2 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @Column({ type: 'text', nullable: true })
  @IsString()
  comment: string;

  @Column({ type: 'jsonb', nullable: true })
  images: string[];

  @Column({ type: 'jsonb', nullable: true })
  criteria: {
    quality: number;
    timeliness: number;
    communication: number;
    professionalism: number;
    valueForMoney: number;
  };

  @Column({ type: 'text', nullable: true })
  response: string;

  @Column({ type: 'timestamp', nullable: true })
  respondedAt: Date;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: false })
  isFlagged: boolean;

  @Column({ nullable: true })
  flagReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
