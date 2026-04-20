import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import messageService from '@/services/MessageService';
import { AuthenticatedRequest } from '@/types';
import logger from '@/config/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

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
          message: 'Validation failed',
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
        message: 'Conversation created successfully'
      });
    } catch (error) {
      logger.error('Error creating conversation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create conversation',
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
          message: 'Conversation not found or access denied'
        });
        return;
      }

      res.json({
        success: true,
        data: conversation,
        message: 'Conversation retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting conversation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve conversation',
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
        message: 'Conversations retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve conversations',
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
          message: 'Validation failed',
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
        message: 'Message sent successfully'
      });
    } catch (error) {
      logger.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getConversationMessages = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
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
        message: 'Messages retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting conversation messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve messages',
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
        message: 'Failed to mark messages as read',
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
          message: 'Validation failed',
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
        message: 'Message updated successfully'
      });
    } catch (error) {
      logger.error('Error updating message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update message',
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
        message: 'Message deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete message',
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
        message: 'Unread message count retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting unread message count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread message count',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  uploadAttachment = [
    messageUpload.single('file'),
    async (req: AuthenticatedRequest, res: Response): Promise<void> => {
      try {
        if (!req.file) {
          res.status(400).json({ success: false, message: 'No file uploaded' });
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
        res.status(500).json({ success: false, message: 'Failed to upload file' });
      }
    },
  ];
}

export default new MessageController();