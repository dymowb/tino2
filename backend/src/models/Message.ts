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
import { IsString, IsEnum, IsBoolean } from 'class-validator';
import { User } from './User';
import { Conversation } from './Conversation';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
}

@Entity('messages')
@Index(['conversationId'])
@Index(['senderId'])
@Index(['receiverId'])
@Index(['createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversationId: string;

  @Column()
  senderId: string;

  @Column({ nullable: true })
  receiverId: string | undefined;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @ManyToOne(() => User, (user) => user.sentMessages)
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @ManyToOne(() => User, (user) => user.receivedMessages, { nullable: true })
  @JoinColumn({ name: 'receiverId' })
  receiver: User;

  @Column({ type: 'text' })
  @IsString()
  message: string;

  @Column({ 
    type: 'varchar', 
    enum: MessageType, 
    default: MessageType.TEXT 
  })
  @IsEnum(MessageType)
  messageType: MessageType;

  @Column({ type: 'json', nullable: true })
  attachments: string[];

  @Column({ default: false })
  @IsBoolean()
  isRead: boolean;

  @Column({ type: 'datetime', nullable: true })
  readAt: Date;

  @Column({ default: false })
  @IsBoolean()
  isDelivered: boolean;

  @Column({ type: 'datetime', nullable: true })
  deliveredAt: Date;

  @Column({ nullable: true })
  replyToMessageId: string;

  @ManyToOne(() => Message, { nullable: true })
  @JoinColumn({ name: 'replyToMessageId' })
  replyToMessage: Message;

  @Column({ default: false })
  @IsBoolean()
  isEdited: boolean;

  @Column({ type: 'datetime', nullable: true })
  editedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}