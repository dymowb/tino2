import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToMany,
} from 'typeorm';
import { IsEmail, IsString, IsPhoneNumber, IsBoolean, IsEnum } from 'class-validator';
import { Provider } from './Provider';
import { Booking } from './Booking';
import { Quote } from './Quote';
import { QuoteRequest } from './QuoteRequest';
import { Review } from './Review';
import { Payment } from './Payment';
import { Message } from './Message';
import { Conversation } from './Conversation';

export enum UserType {
  CUSTOMER = 'customer',
  PROVIDER = 'provider',
}

@Entity('users')
@Index(['email'])
@Index(['userType'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @IsEmail()
  email: string;

  @Column()
  @IsString()
  password: string;

  @Column()
  @IsString()
  firstName: string;

  @Column()
  @IsString()
  lastName: string;

  @Column({ nullable: true })
  @IsPhoneNumber(null)
  phone: string;

  @Column({ nullable: true })
  profileImage: string;

  @Column({ type: 'varchar', enum: UserType, default: UserType.CUSTOMER })
  @IsEnum(UserType)
  userType: UserType;

  @Column({ default: false })
  @IsBoolean()
  isVerified: boolean;

  @Column({ default: true })
  @IsBoolean()
  isActive: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastLogin: Date;

  @Column({ type: 'json', nullable: true })
  settings: {
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
    privacy: {
      showProfile: boolean;
      showLocation: boolean;
    };
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Provider, (provider) => provider.user)
  provider: Provider[];

  @OneToMany(() => Booking, (booking) => booking.customer)
  customerBookings: Booking[];

  @OneToMany(() => Booking, (booking) => booking.provider)
  providerBookings: Booking[];

  @OneToMany(() => Quote, (quote) => quote.customer)
  customerQuotes: Quote[];

  @OneToMany(() => Quote, (quote) => quote.provider)
  providerQuotes: Quote[];

  @OneToMany(() => QuoteRequest, (quoteRequest) => quoteRequest.customer)
  quoteRequests: QuoteRequest[];

  @OneToMany(() => Review, (review) => review.customer)
  customerReviews: Review[];

  @OneToMany(() => Review, (review) => review.provider)
  providerReviews: Review[];

  @OneToMany(() => Payment, (payment) => payment.customer)
  customerPayments: Payment[];

  @OneToMany(() => Payment, (payment) => payment.provider)
  providerPayments: Payment[];

  @OneToMany(() => Message, (message) => message.sender)
  sentMessages: Message[];

  @OneToMany(() => Message, (message) => message.receiver)
  receivedMessages: Message[];

  @ManyToMany(() => Conversation, (conversation) => conversation.participants)
  conversations: Conversation[];
}
