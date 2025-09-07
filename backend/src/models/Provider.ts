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
import { IsString, IsNumber, IsArray, IsBoolean, Min, Max } from 'class-validator';
import { User } from './User';
import { Booking } from './Booking';
import { Quote } from './Quote';
import { Review } from './Review';

@Entity('providers')
@Index(['userId'])
@Index(['location'])
export class Provider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.provider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  @IsString()
  businessName: string;

  @Column({ type: 'text' })
  @IsString()
  description: string;

  @Column({ type: 'json' })
  @IsArray()
  services: string[];

  @Column({ type: 'json' })
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 25.0 })
  @IsNumber()
  @Min(1)
  @Max(100)
  serviceRadius: number;

  @Column({ type: 'numeric', precision: 3, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  @Max(5)
  rating: number;

  @Column({ default: 0 })
  @IsNumber()
  @Min(0)
  totalReviews: number;

  @Column({ type: 'json', nullable: true })
  portfolioImages: string[];

  @Column({ default: false })
  @IsBoolean()
  isBackgroundChecked: boolean;

  @Column({ default: false })
  @IsBoolean()
  isInsured: boolean;

  @Column({ default: true })
  @IsBoolean()
  isActive: boolean;

  @Column({ type: 'json' })
  availableHours: {
    monday: { start: string; end: string; available: boolean };
    tuesday: { start: string; end: string; available: boolean };
    wednesday: { start: string; end: string; available: boolean };
    thursday: { start: string; end: string; available: boolean };
    friday: { start: string; end: string; available: boolean };
    saturday: { start: string; end: string; available: boolean };
    sunday: { start: string; end: string; available: boolean };
  };

  @Column({ type: 'json', nullable: true })
  pricing: {
    baseRate: number;
    currency: string;
    rateType: 'hourly' | 'fixed' | 'quote';
  };

  @Column({ type: 'json', nullable: true })
  certifications: Array<{
    name: string;
    issuer: string;
    dateObtained: Date;
    expiryDate?: Date;
    documentUrl?: string;
  }>;

  @Column({ type: 'json', nullable: true })
  insurance: {
    provider: string;
    policyNumber: string;
    coverage: number;
    expiryDate: Date;
    documentUrl?: string;
  };

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  completedJobs: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  responseRate: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  averageResponseTime: number;

  @Column({ type: 'datetime', nullable: true })
  verifiedAt: Date;

  @Column({ nullable: true })
  verifiedBy: string;

  @Column({ type: 'datetime', nullable: true })
  rejectedAt: Date;

  @Column({ nullable: true })
  rejectedBy: string;

  @Column({ type: 'text', nullable: true })
  verificationNotes: string;

  @Column({ type: 'text', nullable: true })
  adminNotes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Booking, (booking) => booking.provider)
  bookings: Booking[];

  @OneToMany(() => Quote, (quote) => quote.provider)
  quotes: Quote[];

  @OneToMany(() => Review, (review) => review.provider)
  reviews: Review[];
}
