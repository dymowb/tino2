import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { AppDataSource } from '@/config/database';
import { Message, MessageType } from '@/models/Message';
import { Conversation, ConversationType } from '@/models/Conversation';
import { User } from '@/models/User';
import logger from '@/config/logger';
import notificationService from '@/services/NotificationService';
import { NotificationType } from '@/models/Notification';
import {
  CreateConversationRequest,
  SendMessageRequest,
  UpdateMessageRequest,
  ConversationSearchQuery,
  MessageSearchQuery,
} from '@/types';

export class MessageService {
  private messageRepository: Repository<Message>;
  private conversationRepository: Repository<Conversation>;
  private userRepository: Repository<User>;
  private io: Server | null = null;

  constructor() {
    this.messageRepository = AppDataSource.getRepository(Message);
    this.conversationRepository = AppDataSource.getRepository(Conversation);
    this.userRepository = AppDataSource.getRepository(User);
  }

  setSocketServer(io: Server): void {
    this.io = io;
  }

  // Conversation Management
  async createConversation(userId: string, conversationData: CreateConversationRequest): Promise<Conversation> {
    try {
      // Ensure the requesting user is included in participants
      const allParticipantIds = Array.from(new Set([userId, ...conversationData.participantIds]));

      // Verify all participants exist
      const participants = await this.userRepository.findByIds(allParticipantIds);
      if (participants.length !== allParticipantIds.length) {
        throw new Error('One or more participants not found');
      }

      // For direct conversations, check if one already exists between these users
      if (conversationData.type === 'direct' || !conversationData.type) {
        if (allParticipantIds.length === 2) {
          const existingConversation = await this.conversationRepository
            .createQueryBuilder('conversation')
            .leftJoinAndSelect('conversation.participants', 'participants')
            .where('conversation.type = :type', { type: ConversationType.DIRECT })
            .andWhere('conversation.isActive = :isActive', { isActive: true })
            .getMany();

          // Check if there's already a direct conversation between these two users
          for (const conv of existingConversation) {
            const participantIds = conv.participants.map(p => p.id).sort();
            if (participantIds.length === 2 && 
                participantIds[0] === allParticipantIds.sort()[0] && 
                participantIds[1] === allParticipantIds.sort()[1]) {
              return conv;
            }
          }
        }
      }

      // Create new conversation
      const conversation = this.conversationRepository.create({
        type: (conversationData.type as ConversationType) || ConversationType.DIRECT,
        title: conversationData.title,
        description: conversationData.description,
        metadata: conversationData.metadata,
        participants,
      });

      const savedConversation = await this.conversationRepository.save(conversation) as Conversation;

      // Emit to all participants
      if (this.io) {
        allParticipantIds.forEach(participantId => {
          this.io!.to(`user_${participantId}`).emit('conversation:new', {
            conversation: savedConversation,
          });
        });
      }

      logger.info('Conversation created', { 
        conversationId: savedConversation.id, 
        participantCount: allParticipantIds.length 
      });

      return savedConversation;
    } catch (error) {
      logger.error('Error creating conversation:', error);
      throw error;
    }
  }

  async getConversationById(conversationId: string, userId: string): Promise<Conversation | null> {
    try {
      const conversation = await this.conversationRepository
        .createQueryBuilder('conversation')
        .leftJoinAndSelect('conversation.participants', 'participants')
        .leftJoinAndSelect('conversation.messages', 'messages')
        .leftJoinAndSelect('messages.sender', 'sender')
        .where('conversation.id = :conversationId', { conversationId })
        .andWhere('participants.id = :userId', { userId })
        .orderBy('messages.createdAt', 'ASC')
        .getOne();

      return conversation;
    } catch (error) {
      logger.error('Error fetching conversation:', error);
      throw error;
    }
  }

  async getUserConversations(query: ConversationSearchQuery): Promise<{
    conversations: Conversation[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const {
        userId,
        type,
        isActive = true,
        page = 1,
        limit = 20,
        sortBy = 'lastMessage',
        sortOrder = 'desc',
      } = query;

      if (!userId) {
        throw new Error('User ID is required');
      }

      let queryBuilder = this.conversationRepository
        .createQueryBuilder('conversation')
        .leftJoinAndSelect('conversation.participants', 'participants')
        .leftJoin('conversation.messages', 'lastMessage')
        .addSelect(['lastMessage.id', 'lastMessage.message', 'lastMessage.createdAt', 'lastMessage.senderId'])
        .leftJoin('lastMessage.sender', 'lastSender')
        .addSelect(['lastSender.id', 'lastSender.firstName', 'lastSender.lastName'])
        .where('participants.id = :userId', { userId });

      if (type) {
        queryBuilder = queryBuilder.andWhere('conversation.type = :type', { type });
      }

      if (isActive !== undefined) {
        queryBuilder = queryBuilder.andWhere('conversation.isActive = :isActive', { isActive });
      }

      // Apply sorting
      const sortField = 
        sortBy === 'lastMessage' ? 'conversation.lastMessageAt' :
        sortBy === 'title' ? 'conversation.title' :
        'conversation.createdAt';

      queryBuilder = queryBuilder.orderBy(sortField, sortOrder.toUpperCase() as 'ASC' | 'DESC');

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder = queryBuilder.skip(offset).take(limit);

      const [conversations, total] = await queryBuilder.getManyAndCount();

      logger.info('User conversations retrieved', {
        userId,
        total,
        page,
        limit,
      });

      return {
        conversations,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      throw error;
    }
  }

  // Message Management
  async sendMessage(senderId: string, messageData: SendMessageRequest): Promise<Message> {
    try {
      // Verify sender exists
      const sender = await this.userRepository.findOne({ where: { id: senderId } });
      if (!sender) {
        throw new Error('Sender not found');
      }

      // Verify conversation exists and user is a participant
      const conversation = await this.conversationRepository
        .createQueryBuilder('conversation')
        .leftJoinAndSelect('conversation.participants', 'participants')
        .where('conversation.id = :conversationId', { conversationId: messageData.conversationId })
        .andWhere('participants.id = :senderId', { senderId })
        .getOne();

      if (!conversation) {
        throw new Error('Conversation not found or access denied');
      }

      // Find the receiver (for direct conversations; undefined for group/support chats)
      const receiverId = conversation.participants
        .find(participant => participant.id !== senderId)?.id;

      // Create message
      const message = this.messageRepository.create({
        conversationId: messageData.conversationId,
        senderId,
        receiverId,
        message: messageData.message || '',
        messageType: (messageData.messageType as MessageType) || MessageType.TEXT,
        attachments: messageData.attachments || [],
        replyToMessageId: messageData.replyToMessageId,
      });

      const savedMessage = await this.messageRepository.save(message) as Message;

      // Notify recipient of new message
      if (receiverId) {
        notificationService.createNotification(receiverId, {
          type: NotificationType.MESSAGE,
          title: 'New Message',
          message: messageData.message.substring(0, 100),
          actionUrl: `/messages/${messageData.conversationId}`,
          metadata: { conversationId: messageData.conversationId },
        }).catch(err => logger.error('Failed to send message notification:', err));
      }

      // Update conversation last message
      conversation.lastMessageId = savedMessage.id;
      conversation.lastMessageAt = new Date();
      await this.conversationRepository.save(conversation);

      // Load sender details
      const messageWithSender = await this.messageRepository
        .createQueryBuilder('message')
        .leftJoinAndSelect('message.sender', 'sender')
        .leftJoinAndSelect('message.receiver', 'receiver')
        .where('message.id = :messageId', { messageId: savedMessage.id })
        .getOne();

      // Emit real-time message to all conversation participants
      if (this.io && messageWithSender) {
        conversation.participants.forEach(participant => {
          this.io!.to(`user_${participant.id}`).emit('message:new', {
            message: messageWithSender,
            conversationId: messageData.conversationId,
          });
        });
      }

      logger.info('Message sent', { 
        messageId: savedMessage.id, 
        senderId, 
        conversationId: messageData.conversationId 
      });

      return messageWithSender || savedMessage;
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  async getConversationMessages(query: MessageSearchQuery): Promise<{
    messages: Message[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const {
        conversationId,
        senderId,
        receiverId,
        messageType,
        isRead,
        page = 1,
        limit = 50,
        sortBy = 'created',
        sortOrder = 'desc',
      } = query;

      if (!conversationId) {
        throw new Error('Conversation ID is required');
      }

      let queryBuilder = this.messageRepository
        .createQueryBuilder('message')
        .leftJoinAndSelect('message.sender', 'sender')
        .leftJoinAndSelect('message.receiver', 'receiver')
        .leftJoinAndSelect('message.replyToMessage', 'replyToMessage')
        .leftJoinAndSelect('replyToMessage.sender', 'replyToSender')
        .where('message.conversationId = :conversationId', { conversationId });

      if (senderId) {
        queryBuilder = queryBuilder.andWhere('message.senderId = :senderId', { senderId });
      }

      if (receiverId) {
        queryBuilder = queryBuilder.andWhere('message.receiverId = :receiverId', { receiverId });
      }

      if (messageType) {
        queryBuilder = queryBuilder.andWhere('message.messageType = :messageType', { messageType });
      }

      if (isRead !== undefined) {
        queryBuilder = queryBuilder.andWhere('message.isRead = :isRead', { isRead });
      }

      // Apply sorting
      queryBuilder = queryBuilder.orderBy('message.createdAt', sortOrder.toUpperCase() as 'ASC' | 'DESC');

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder = queryBuilder.skip(offset).take(limit);

      const [messages, total] = await queryBuilder.getManyAndCount();

      return {
        messages,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error getting conversation messages:', error);
      throw error;
    }
  }

  async markMessagesAsRead(conversationId: string, userId: string): Promise<number> {
    try {
      const result = await this.messageRepository
        .createQueryBuilder()
        .update(Message)
        .set({ 
          isRead: true, 
          readAt: new Date(),
          updatedAt: new Date()
        })
        .where('conversationId = :conversationId', { conversationId })
        .andWhere('receiverId = :userId', { userId })
        .andWhere('isRead = :isRead', { isRead: false })
        .execute();

      const affectedCount = result.affected || 0;

      // Emit real-time update
      if (this.io && affectedCount > 0) {
        this.io.to(`user_${userId}`).emit('messages:read', {
          conversationId,
          count: affectedCount,
        });
      }

      logger.info('Messages marked as read', { conversationId, userId, count: affectedCount });
      return affectedCount;
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      throw error;
    }
  }

  async updateMessage(messageId: string, senderId: string, updateData: UpdateMessageRequest): Promise<Message> {
    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId, senderId },
      });

      if (!message) {
        throw new Error('Message not found or access denied');
      }

      // Update message fields
      if (updateData.message && updateData.message !== message.message) {
        message.message = updateData.message;
        message.isEdited = true;
        message.editedAt = new Date();
      }

      if (updateData.attachments) {
        message.attachments = updateData.attachments;
      }

      message.updatedAt = new Date();

      const updatedMessage = await this.messageRepository.save(message);

      // Emit real-time update
      if (this.io) {
        this.io.to(`conversation_${message.conversationId}`).emit('message:updated', {
          message: updatedMessage,
        });
      }

      logger.info('Message updated', { messageId, senderId });
      return updatedMessage;
    } catch (error) {
      logger.error('Error updating message:', error);
      throw error;
    }
  }

  async deleteMessage(messageId: string, senderId: string): Promise<void> {
    try {
      const message = await this.messageRepository.findOne({
        where: { id: messageId, senderId },
      });

      if (!message) {
        throw new Error('Message not found or access denied');
      }

      await this.messageRepository.delete(messageId);

      // Emit real-time update
      if (this.io) {
        this.io.to(`conversation_${message.conversationId}`).emit('message:deleted', {
          messageId,
          conversationId: message.conversationId,
        });
      }

      logger.info('Message deleted', { messageId, senderId });
    } catch (error) {
      logger.error('Error deleting message:', error);
      throw error;
    }
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    try {
      const count = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.receiverId = :userId', { userId })
        .andWhere('message.isRead = :isRead', { isRead: false })
        .getCount();

      return count;
    } catch (error) {
      logger.error('Error getting unread message count:', error);
      throw error;
    }
  }

  // Real-time Socket.IO event handlers
  handleUserConnection(userId: string, socketId: string): void {
    if (this.io) {
      this.io.sockets.sockets.get(socketId)?.join(`user_${userId}`);
      logger.info('User connected to messaging', { userId, socketId });
    }
  }

  handleUserDisconnection(userId: string, socketId: string): void {
    if (this.io) {
      this.io.sockets.sockets.get(socketId)?.leave(`user_${userId}`);
      logger.info('User disconnected from messaging', { userId, socketId });
    }
  }

  async joinConversation(userId: string, conversationId: string, socketId: string): Promise<void> {
    try {
      // Verify user is a participant in the conversation
      const conversation = await this.conversationRepository
        .createQueryBuilder('conversation')
        .leftJoin('conversation.participants', 'participants')
        .where('conversation.id = :conversationId', { conversationId })
        .andWhere('participants.id = :userId', { userId })
        .getOne();

      if (!conversation) {
        throw new Error('Conversation not found or access denied');
      }

      if (this.io) {
        this.io.sockets.sockets.get(socketId)?.join(`conversation_${conversationId}`);
        logger.info('User joined conversation', { userId, conversationId, socketId });
      }
    } catch (error) {
      logger.error('Error joining conversation:', error);
      throw error;
    }
  }

  leaveConversation(conversationId: string, socketId: string): void {
    if (this.io) {
      this.io.sockets.sockets.get(socketId)?.leave(`conversation_${conversationId}`);
      logger.info('User left conversation', { conversationId, socketId });
    }
  }
}

export default new MessageService();