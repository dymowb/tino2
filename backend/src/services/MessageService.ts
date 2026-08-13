import { Repository, In } from 'typeorm';
import { Server } from 'socket.io';
import { AppDataSource } from '@/config/database';
import { Message, MessageType } from '@/models/Message';
import { Conversation, ConversationType } from '@/models/Conversation';
import { User } from '@/models/User';
import { Booking, BookingStatus } from '@/models/Booking';
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
import { toPublicUser, PublicUser } from '@/utils/serializers';
import messageAttachmentService from '@/services/MessageAttachmentService';

// Sanitize a message: strip sensitive fields from embedded sender/receiver/replyTo.sender
function toPublicMessage(message: Message | null | undefined): any {
  if (!message) return message;
  return {
    ...message,
    sender: toPublicUser((message as any).sender),
    receiver: toPublicUser((message as any).receiver),
    replyToMessage: (message as any).replyToMessage
      ? {
          ...(message as any).replyToMessage,
          sender: toPublicUser((message as any).replyToMessage.sender),
        }
      : (message as any).replyToMessage,
  };
}

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
  async createConversation(
    userId: string,
    conversationData: CreateConversationRequest
  ): Promise<any> {
    try {
      // Resolve the participant set. For a booking-scoped conversation, the participants are
      // ALWAYS exactly the two booking parties (the customer and the provider's user). We never
      // trust client-supplied participantIds here, and we verify the requester is one of those
      // parties — this prevents IDOR / squatting on bookings the requester is not part of.
      const bookingId = conversationData.metadata?.bookingId;
      let allParticipantIds: string[];

      if (bookingId) {
        const booking = await AppDataSource.getRepository(Booking).findOne({
          where: { id: bookingId },
          relations: ['provider'],
        });
        if (!booking) {
          throw new Error('Booking not found');
        }
        const providerUserId = booking.provider?.userId;
        const isParty = booking.customerId === userId || providerUserId === userId;
        if (!isParty) {
          throw new Error('Access denied: you are not a party to this booking');
        }
        allParticipantIds = Array.from(
          new Set([booking.customerId, providerUserId].filter(Boolean) as string[])
        );
      } else {
        // Ensure the requesting user is included in participants
        allParticipantIds = Array.from(new Set([userId, ...conversationData.participantIds]));
      }

      // Verify all participants exist — findByIds is deprecated; use findBy+In
      const participants = await this.userRepository.findBy({ id: In(allParticipantIds) });
      if (participants.length !== allParticipantIds.length) {
        throw new Error('One or more participants not found');
      }

      // If a bookingId is provided, find or create a conversation specific to that booking
      if (bookingId) {
        const existing = await this.conversationRepository
          .createQueryBuilder('conversation')
          .leftJoinAndSelect('conversation.participants', 'participants')
          .where("conversation.metadata->>'bookingId' = :bookingId", { bookingId })
          .andWhere('conversation.isActive = :isActive', { isActive: true })
          .getOne();
        if (existing) {
          // Only reuse the existing conversation when its participants are EXACTLY the two
          // booking parties. A record with any other participant set was squatted/poisoned
          // (e.g. created before this check existed) — deactivate it and create a clean one.
          const existingIds = new Set((existing.participants || []).map((p) => p.id));
          const sameParties =
            existingIds.size === allParticipantIds.length &&
            allParticipantIds.every((id) => existingIds.has(id));
          if (sameParties) {
            return this.shapeConversation(existing);
          }
          await this.conversationRepository.update(existing.id, { isActive: false });
          logger.warn('Deactivated mis-scoped booking conversation', {
            conversationId: existing.id,
            bookingId,
          });
        }
        // No valid booking-specific conversation yet — fall through to create one
      } else if (conversationData.type === 'direct' || !conversationData.type) {
        // Dedup by participant pair — use raw SQL to avoid TypeORM M2M hydration bug
        // where getMany() can mix up participant arrays across conversations.
        if (allParticipantIds.length === 2) {
          const [id1, id2] = [...allParticipantIds].sort();
          const rows = await AppDataSource.query(
            `SELECT cp."conversationId"
             FROM conversation_participants cp
             INNER JOIN conversations c ON c.id = cp."conversationId"
             WHERE c.type = 'direct' AND c."isActive" = true
               AND (c.metadata->>'bookingId') IS NULL
               AND cp."userId" IN ($1, $2)
             GROUP BY cp."conversationId"
             HAVING COUNT(DISTINCT cp."userId") = 2
             LIMIT 1`,
            [id1, id2]
          );
          if (rows.length > 0) {
            const existing = await this.conversationRepository.findOne({
              where: { id: rows[0].conversationId },
              relations: ['participants'],
            });
            if (existing) return this.shapeConversation(existing);
          }
        }
      }

      // Create new conversation — save without participants first, then insert junction rows
      // explicitly to avoid TypeORM M2M cascade unreliability with upsert patterns.
      const conversation = this.conversationRepository.create({
        type: (conversationData.type as ConversationType) || ConversationType.DIRECT,
        title: conversationData.title,
        description: conversationData.description,
        metadata: conversationData.metadata,
      });

      const savedConversation = (await this.conversationRepository.save(
        conversation
      )) as Conversation;

      // Explicitly insert all participants into the junction table
      for (const participantId of allParticipantIds) {
        try {
          await AppDataSource.query(
            `INSERT INTO conversation_participants ("conversationId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [savedConversation.id, participantId]
          );
        } catch (insertErr) {
          logger.error('[createConversation] junction INSERT failed', {
            conversationId: savedConversation.id,
            participantId,
            insertErr,
          });
          throw insertErr;
        }
      }
      savedConversation.participants = participants;
      const shaped = this.shapeConversation(savedConversation);

      // Emit to all participants (sanitized — never leak user PII)
      if (this.io) {
        allParticipantIds.forEach((participantId) => {
          this.io!.to(`user_${participantId}`).emit('conversation:new', {
            conversation: shaped,
          });
        });
      }

      logger.info('Conversation created', {
        conversationId: savedConversation.id,
        participantCount: allParticipantIds.length,
      });

      return shaped;
    } catch (error) {
      logger.error('Error creating conversation:', error);
      throw error;
    }
  }

  // Shape a conversation entity into a public-safe DTO (sanitized participants).
  private shapeConversation(conversation: Conversation): any {
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      description: conversation.description,
      participants: (conversation.participants || []).map(toPublicUser),
      metadata: conversation.metadata,
      isActive: conversation.isActive,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * Messaging is closed once the linked booking reaches a final state
   * (completed or cancelled). Direct (non-booking) conversations are never
   * closed. Returns the booking status so the UI can explain why.
   */
  private async getBookingMessagingState(
    metadata: any
  ): Promise<{ bookingStatus?: string; messagingClosed: boolean }> {
    const bookingId = metadata?.bookingId;
    if (!bookingId) return { messagingClosed: false };
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
      select: ['id', 'status'],
    });
    const bookingStatus = booking?.status;
    const messagingClosed =
      bookingStatus === BookingStatus.COMPLETED || bookingStatus === BookingStatus.CANCELLED;
    return { bookingStatus, messagingClosed };
  }

  /**
   * People this user is allowed to start a conversation with.
   *
   * Scoped to actual commercial relationships — anyone they share a booking or a
   * quote with — rather than every account on the platform. A free-form directory
   * of all users would leak the customer base to any provider who opened the
   * dialog, and there is no product reason to message a stranger: every
   * conversation in this product exists because of a booking or a quote.
   *
   * The join hops through providers.userId on purpose. `booking.providerId` and
   * `quote.providerId` hold a Provider entity id, not a User id; comparing either
   * to a user id directly is the single most repeated authorization bug in this
   * codebase and would silently return nobody for providers.
   */
  async getContacts(userId: string, search?: string): Promise<PublicUser[]> {
    const term = (search || '').trim();
    const like = `%${term.toLowerCase()}%`;

    const rows = await AppDataSource.query(
      `WITH counterparties AS (
         SELECT CASE WHEN b."customerId" = $1 THEN p."userId" ELSE b."customerId" END AS "userId"
           FROM bookings b
           JOIN providers p ON p.id = b."providerId"
          WHERE b."customerId" = $1 OR p."userId" = $1
         UNION
         SELECT CASE WHEN q."customerId" = $1 THEN p."userId" ELSE q."customerId" END AS "userId"
           FROM quotes q
           JOIN providers p ON p.id = q."providerId"
          WHERE q."customerId" = $1 OR p."userId" = $1
       )
       -- Email is matched against but never returned: PublicUser deliberately omits
       -- it, and a counterparty's address is not needed to start a conversation.
       SELECT DISTINCT u.id, u."firstName", u."lastName", u."userType", u."profileImage"
         FROM counterparties c
         JOIN users u ON u.id = c."userId"
        WHERE u.id <> $1
          AND u."isActive" = true
          AND ($2 = '' OR lower(u."firstName" || ' ' || u."lastName") LIKE $3 OR lower(u.email) LIKE $3)
        ORDER BY u."firstName", u."lastName"
        LIMIT 50`,
      [userId, term, like]
    );

    return rows;
  }

  async isConversationParticipant(conversationId: string, userId: string): Promise<boolean> {
    const conv = await this.conversationRepository
      .createQueryBuilder('conversation')
      .innerJoin('conversation.participants', 'member')
      .where('conversation.id = :conversationId', { conversationId })
      .andWhere('member.id = :userId', { userId })
      .getCount();
    return conv > 0;
  }

  async getConversationById(conversationId: string, userId: string): Promise<any | null> {
    try {
      // Access check first; then load full participants (not filtered by the WHERE) so all
      // members are returned, and sanitize every embedded user.
      const isMember = await this.isConversationParticipant(conversationId, userId);
      if (!isMember) return null;

      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
        relations: ['participants', 'messages', 'messages.sender'],
        order: { messages: { createdAt: 'ASC' } },
      });

      if (!conversation) return null;

      // Surface whether messaging is closed (booking finalized) so the chat UI
      // can disable the composer and explain why.
      const { bookingStatus, messagingClosed } = await this.getBookingMessagingState(
        conversation.metadata
      );

      return {
        ...conversation,
        participants: (conversation.participants || []).map(toPublicUser),
        messages: (conversation.messages || []).map(toPublicMessage),
        bookingStatus,
        messagingClosed,
      };
    } catch (error) {
      logger.error('Error fetching conversation:', error);
      throw error;
    }
  }

  async getUserConversations(query: ConversationSearchQuery): Promise<{
    conversations: any[];
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

      const order = sortOrder.toUpperCase() as 'ASC' | 'DESC';
      const offset = (page - 1) * limit;

      // Step 1: paginate conversation IDs in a lean query (no M2M select), so the COALESCE
      // sort expression works — TypeORM can't order by a raw expression when a ManyToMany
      // join + skip/take pagination are combined.
      const idQuery = this.conversationRepository
        .createQueryBuilder('conversation')
        .select('conversation.id', 'id')
        .innerJoin('conversation.participants', 'memberFilter')
        .where('memberFilter.id = :userId', { userId });

      if (type) idQuery.andWhere('conversation.type = :type', { type });
      if (isActive !== undefined)
        idQuery.andWhere('conversation.isActive = :isActive', { isActive });

      if (sortBy === 'title') {
        idQuery.orderBy('conversation.title', order);
      } else if (sortBy === 'created') {
        idQuery.orderBy('conversation.createdAt', order);
      } else {
        // Empty conversations (null lastMessageAt) fall back to createdAt so they don't
        // dominate the top via PostgreSQL's NULLS FIRST default on DESC.
        idQuery.orderBy('COALESCE(conversation.lastMessageAt, conversation.createdAt)', order);
      }

      const total = await idQuery.getCount();
      const idRows = await idQuery.offset(offset).limit(limit).getRawMany();
      const orderedIds: string[] = idRows.map((r) => r.id);

      // Step 2: hydrate the page of conversations with ALL participants.
      const hydrated = orderedIds.length
        ? await this.conversationRepository.find({
            where: { id: In(orderedIds) },
            relations: ['participants'],
          })
        : [];

      // Preserve the SQL ordering (find() does not guarantee it)
      const byId = new Map(hydrated.map((c) => [c.id, c]));
      const conversations = orderedIds.map((id) => byId.get(id)!).filter(Boolean);

      // Drop orphaned conversations that somehow lost a participant (defensive — never render
      // a one-sided "?" conversation).
      const valid = conversations.filter(
        (c) => (c.participants?.length ?? 0) >= 2 || c.type !== ConversationType.DIRECT
      );

      const conversationIds = valid.map((c) => c.id);

      // Batch-load last message per conversation + unread counts for this user — avoids N+1.
      const lastMessageMap = new Map<string, any>();
      const unreadMap = new Map<string, number>();

      if (conversationIds.length > 0) {
        // Latest message per conversation (DISTINCT ON is PostgreSQL-specific and efficient)
        const lastMessages = await this.messageRepository
          .createQueryBuilder('message')
          .leftJoin('message.sender', 'sender')
          .addSelect(['sender.id', 'sender.firstName', 'sender.lastName'])
          .where('message.conversationId IN (:...ids)', { ids: conversationIds })
          .orderBy('message.conversationId')
          .addOrderBy('message.createdAt', 'DESC')
          .distinctOn(['message.conversationId'])
          .getMany();

        for (const m of lastMessages) {
          lastMessageMap.set(m.conversationId, {
            id: m.id,
            message: m.message,
            messageType: m.messageType,
            attachments: m.attachments,
            senderId: m.senderId,
            createdAt: m.createdAt,
          });
        }

        // Unread counts: messages addressed to this user, not yet read, grouped by conversation
        const unreadRows = await this.messageRepository
          .createQueryBuilder('message')
          .select('message.conversationId', 'conversationId')
          .addSelect('COUNT(*)', 'count')
          .where('message.conversationId IN (:...ids)', { ids: conversationIds })
          .andWhere('message.receiverId = :userId', { userId })
          .andWhere('message.isRead = false')
          .groupBy('message.conversationId')
          .getRawMany();

        for (const row of unreadRows) {
          unreadMap.set(row.conversationId, parseInt(row.count, 10) || 0);
        }
      }

      // Shape the public DTO: sanitized participants + lastMessage + unreadCount
      const shaped = valid.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        description: c.description,
        participants: (c.participants || []).map(toPublicUser),
        metadata: c.metadata,
        isActive: c.isActive,
        lastMessageAt: c.lastMessageAt,
        lastMessage: lastMessageMap.get(c.id) || null,
        unreadCount: unreadMap.get(c.id) || 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));

      logger.info('User conversations retrieved', { userId, total, page, limit });

      return { conversations: shaped, total, page, limit };
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

      // Verify conversation exists and user is a participant — use junction table check
      // to avoid TypeORM M2M hydration issues.
      const isMember = await this.isConversationParticipant(messageData.conversationId, senderId);
      if (!isMember) {
        throw new Error('Conversation not found or access denied');
      }

      // Load conversation WITHOUT participant filter so the full participants list is available
      const conversation = await this.conversationRepository.findOne({
        where: { id: messageData.conversationId },
        relations: ['participants'],
      });
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Block sending once the linked booking is finalized (completed/cancelled).
      const { messagingClosed } = await this.getBookingMessagingState(conversation.metadata);
      if (messagingClosed) {
        throw new Error('MESSAGING_CLOSED');
      }

      // You may only attach files you uploaded. Without this, anyone who learned an
      // attachment id could reference it from a conversation they belong to and thereby
      // grant themselves read access to someone else's private file.
      await messageAttachmentService.assertAttachmentsOwnedBy(senderId, messageData.attachments);

      // Find the receiver (for direct conversations; undefined for group/support chats)
      const receiverId = conversation.participants.find(
        (participant) => participant.id !== senderId
      )?.id;

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

      const savedMessage = (await this.messageRepository.save(message)) as Message;

      // Notify recipient of new message
      if (receiverId) {
        notificationService
          .createNotification(receiverId, {
            type: NotificationType.MESSAGE,
            title: 'New Message',
            message: messageData.message.substring(0, 100),
            titleKey: 'titles.new_message',
            // body is the user's message text — left as-is (not translated).
            // MessagingPage selects the conversation from the ?conversationId query param;
            // a path like /messages/<id> matches no route and falls through to home.
            actionUrl: `/messages?conversationId=${messageData.conversationId}`,
            metadata: { conversationId: messageData.conversationId },
          })
          .catch((err) => logger.error('Failed to send message notification:', err));
      }

      // Update lastMessageId/At using update() — avoids TypeORM M2M cascade that would
      // wipe junction table participants if the loaded participants array is incomplete.
      await this.conversationRepository.update(conversation.id, {
        lastMessageId: savedMessage.id,
        lastMessageAt: new Date(),
      });

      // Load sender details
      const messageWithSender = await this.messageRepository
        .createQueryBuilder('message')
        .leftJoinAndSelect('message.sender', 'sender')
        .leftJoinAndSelect('message.receiver', 'receiver')
        .where('message.id = :messageId', { messageId: savedMessage.id })
        .getOne();

      const publicMessage = toPublicMessage(messageWithSender || savedMessage);

      // Emit real-time message to all conversation participants (sanitized — never leak user PII)
      if (this.io && messageWithSender) {
        conversation.participants.forEach((participant) => {
          this.io!.to(`user_${participant.id}`).emit('message:new', {
            message: publicMessage,
            conversationId: messageData.conversationId,
          });
        });
      }

      logger.info('Message sent', {
        messageId: savedMessage.id,
        senderId,
        conversationId: messageData.conversationId,
      });

      return publicMessage;
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  async getConversationMessages(query: MessageSearchQuery): Promise<{
    messages: any[];
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
      queryBuilder = queryBuilder.orderBy(
        'message.createdAt',
        sortOrder.toUpperCase() as 'ASC' | 'DESC'
      );

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder = queryBuilder.skip(offset).take(limit);

      const [messages, total] = await queryBuilder.getManyAndCount();

      return {
        messages: messages.map(toPublicMessage),
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
          updatedAt: new Date(),
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

  async updateMessage(
    messageId: string,
    senderId: string,
    updateData: UpdateMessageRequest
  ): Promise<Message> {
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
        // Same ownership rule as sending — editing a message must not become a way to
        // attach a file someone else uploaded.
        await messageAttachmentService.assertAttachmentsOwnedBy(senderId, updateData.attachments);
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
