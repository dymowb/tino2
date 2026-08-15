import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { IsEmail, IsString, IsEnum } from 'class-validator';

export enum UserType {
  CUSTOMER = 'customer',
  PROVIDER = 'provider',
  ADMIN = 'admin',
}

@Entity('users')
@Index(['email'], { unique: true })
export class BasicUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @IsEmail()
  email: string;

  @Column({ select: false })
  @IsString()
  password: string;

  @Column()
  @IsString()
  firstName: string;

  @Column()
  @IsString()
  lastName: string;

  @Column()
  @IsEnum(UserType)
  userType: UserType;

  @Column({ nullable: true })
  @IsString()
  phone?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isVerified: boolean;

  // Suspension fields (mapped here so the login path can honour expired temporary
  // suspensions symmetrically with the authenticate middleware — see DEF-B2).
  @Column({ nullable: true })
  suspensionReason?: string;

  @Column({ type: 'text', nullable: true })
  suspensionComment?: string;

  @Column({ type: 'timestamp', nullable: true })
  suspendedUntil?: Date;

  /**
   * Consecutive failed password attempts since the last success. Reset to zero on
   * a successful login, and on the first attempt after a lockout expires.
   */
  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  /**
   * Set when the attempt threshold is crossed. Login is refused until this passes;
   * the window is bounded so an attacker cannot lock a victim out permanently by
   * guessing badly on purpose.
   */
  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil?: Date | null;

  @Column({ nullable: true })
  emailVerificationToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpiry?: Date;

  @Column({ nullable: true })
  passwordResetToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiry?: Date;

  @Column({ nullable: true })
  profileImage?: string;

  @Column({ type: 'jsonb', nullable: true })
  settings?: {
    notifications?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    };
    privacy?: {
      profileVisible?: boolean;
      locationSharing?: boolean;
    };
    [key: string]: any;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
