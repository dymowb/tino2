import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import messageService from '@/services/MessageService';
import { AuthenticatedRequest } from '@/types';
import logger from '@/config/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { t } from '@/i18n';

// Configure multer for message file/image uploads
const messageStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/messages');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error as Error, uploadPath);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, filename);
  },
});

const messageUpload = multer({
  storage: messageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('File type not allowed'));
  },
});

export class MessageController {
  createConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: t(req, 'common.validation_failed'),
          errors: errors.mapped()
        });
        return;
      }

      const userId = req.user!.userId;
      const conversationData = req.body;

      const conversation = await messageService.createConversation(userId, conversationData);

      res.status(201).json({
        success: true,
        data: conversation,
        message: t(req, 'message.conversation_created')
      });
    } catch (error) {
      logger.error('Error creating conversation:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.conversation_create_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getConversationById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;

      const conversation = await messageService.getConversationById(conversationId, userId);

      if (!conversation) {
        res.status(404).json({
          success: false,
          message: t(req, 'message.conversation_not_found')
        });
        return;
      }

      res.json({
        success: true,
        data: conversation,
        message: t(req, 'message.conversation_retrieved')
      });
    } catch (error) {
      logger.error('Error getting conversation:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.conversation_retrieve_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getUserConversations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const query = {
        userId,
        type: req.query.type as 'direct' | 'group' | 'support' | undefined,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: (req.query.sortBy as 'lastMessage' | 'created' | 'title') || 'lastMessage',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      const result = await messageService.getUserConversations(query);

      res.json({
        success: true,
        data: result.conversations,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: Math.ceil(result.total / result.limit)
        },
        message: t(req, 'message.conversations_retrieved')
      });
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.conversations_retrieve_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  sendMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: t(req, 'common.validation_failed'),
          errors: errors.mapped()
        });
        return;
      }

      const senderId = req.user!.userId;
      const messageData = req.body;

      const message = await messageService.sendMessage(senderId, messageData);

      res.status(201).json({
        success: true,
        data: message,
        message: t(req, 'message.sent')
      });
    } catch (error) {
      // Messaging is closed once the booking is finalized — distinct, expected
      // case (not a server fault), so return 403 with a stable code the client
      // can localize.
      if (error instanceof Error && error.message === 'MESSAGING_CLOSED') {
        res.status(403).json({
          success: false,
          message: 'MESSAGING_CLOSED',
          error: t(req, 'message.messaging_closed'),
        });
        return;
      }
      logger.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.send_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getConversationMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;

      // Only conversation participants may read messages — prevents admin eavesdropping
      const isParticipant = await messageService.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        res.status(403).json({ success: false, message: t(req, 'common.access_denied') });
        return;
      }

      const query = {
        conversationId,
        senderId: req.query.senderId as string | undefined,
        receiverId: req.query.receiverId as string | undefined,
        messageType: req.query.messageType as 'text' | 'image' | 'file' | undefined,
        isRead: req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        sortBy: 'created' as const,
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      const result = await messageService.getConversationMessages(query);

      res.json({
        success: true,
        data: result.messages,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: Math.ceil(result.total / result.limit)
        },
        message: t(req, 'message.retrieved')
      });
    } catch (error) {
      logger.error('Error getting conversation messages:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.retrieve_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  markMessagesAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;

      const count = await messageService.markMessagesAsRead(conversationId, userId);

      res.json({
        success: true,
        data: { markedCount: count },
        message: `${count} messages marked as read`
      });
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.mark_read_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  updateMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: t(req, 'common.validation_failed'),
          errors: errors.mapped()
        });
        return;
      }

      const { messageId } = req.params;
      const senderId = req.user!.userId;
      const updateData = req.body;

      const message = await messageService.updateMessage(messageId, senderId, updateData);

      res.json({
        success: true,
        data: message,
        message: t(req, 'message.updated')
      });
    } catch (error) {
      logger.error('Error updating message:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.update_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  deleteMessage = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const senderId = req.user!.userId;

      await messageService.deleteMessage(messageId, senderId);

      res.json({
        success: true,
        message: t(req, 'message.deleted')
      });
    } catch (error) {
      logger.error('Error deleting message:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.delete_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getUnreadMessageCount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const count = await messageService.getUnreadMessageCount(userId);

      res.json({
        success: true,
        data: { unreadCount: count },
        message: t(req, 'message.unread_count_retrieved')
      });
    } catch (error) {
      logger.error('Error getting unread message count:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.unread_count_failed'),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  uploadAttachment = [
    messageUpload.single('file'),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        if (!req.file) {
          res.status(400).json({ success: false, message: t(req, 'message.no_file') });
          return;
        }
        const url = `/uploads/messages/${req.file.filename}`;
        res.json({
          success: true,
          data: {
            url,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
          },
        });
      } catch (error) {
        logger.error('Error uploading message attachment:', error);
        res.status(500).json({ success: false, message: t(req, 'message.upload_failed') });
      }
    },
  ];
}

export default new MessageController();