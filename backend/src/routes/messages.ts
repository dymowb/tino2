import { Router } from 'express';
import { body, param, query } from 'express-validator';
import messageController from '@/controllers/MessageController';
import { authenticate } from '@/middleware/auth';

const router = Router();

// All message routes require authentication
router.use(authenticate);

// Conversation Management Routes

// Create a new conversation
router.post(
  '/conversations',
  [
    body('participantIds')
      .isArray({ min: 1 })
      .withMessage('Participant IDs must be an array with at least one participant'),
    body('participantIds.*')
      .isUUID()
      .withMessage('Each participant ID must be a valid UUID'),
    body('title')
      .optional()
      .isString()
      .isLength({ max: 255 })
      .withMessage('Title must be a string with maximum 255 characters'),
    body('description')
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage('Description must be a string with maximum 1000 characters'),
    body('type')
      .optional()
      .isIn(['direct', 'group', 'support'])
      .withMessage('Type must be either direct, group, or support'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    body('metadata.bookingId')
      .optional()
      .isUUID()
      .withMessage('Booking ID must be a valid UUID'),
    body('metadata.quoteRequestId')
      .optional()
      .isUUID()
      .withMessage('Quote request ID must be a valid UUID'),
    body('metadata.serviceType')
      .optional()
      .isString()
      .withMessage('Service type must be a string'),
  ],
  messageController.createConversation
);

// Get user's conversations with pagination and filtering
router.get(
  '/conversations',
  [
    query('type')
      .optional()
      .isIn(['direct', 'group', 'support'])
      .withMessage('Type must be either direct, group, or support'),
    query('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be an integer between 1 and 100'),
    query('sortBy')
      .optional()
      .isIn(['lastMessage', 'created', 'title'])
      .withMessage('sortBy must be either lastMessage, created, or title'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('sortOrder must be either asc or desc'),
  ],
  messageController.getUserConversations
);

// Get conversation by ID
router.get(
  '/conversations/:conversationId',
  [
    param('conversationId')
      .isUUID()
      .withMessage('Conversation ID must be a valid UUID'),
  ],
  messageController.getConversationById
);

// Message Management Routes

// Send a message
router.post(
  '/messages',
  [
    body('conversationId')
      .isUUID()
      .withMessage('Conversation ID must be a valid UUID'),
    body('message')
      .isString()
      .notEmpty()
      .isLength({ max: 5000 })
      .withMessage('Message must be a non-empty string with maximum 5000 characters'),
    body('messageType')
      .optional()
      .isIn(['text', 'image', 'file'])
      .withMessage('Message type must be text, image, or file'),
    body('attachments')
      .optional()
      .isArray()
      .withMessage('Attachments must be an array'),
    body('attachments.*')
      .optional()
      .isString()
      .withMessage('Each attachment must be a string'),
    body('replyToMessageId')
      .optional()
      .isUUID()
      .withMessage('Reply to message ID must be a valid UUID'),
  ],
  messageController.sendMessage
);

// Get messages in a conversation
router.get(
  '/conversations/:conversationId/messages',
  [
    param('conversationId')
      .isUUID()
      .withMessage('Conversation ID must be a valid UUID'),
    query('senderId')
      .optional()
      .isUUID()
      .withMessage('Sender ID must be a valid UUID'),
    query('receiverId')
      .optional()
      .isUUID()
      .withMessage('Receiver ID must be a valid UUID'),
    query('messageType')
      .optional()
      .isIn(['text', 'image', 'file'])
      .withMessage('Message type must be text, image, or file'),
    query('isRead')
      .optional()
      .isBoolean()
      .withMessage('isRead must be a boolean'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('Limit must be an integer between 1 and 200'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('sortOrder must be either asc or desc'),
  ],
  messageController.getConversationMessages
);

// Mark messages as read in a conversation
router.patch(
  '/conversations/:conversationId/messages/read',
  [
    param('conversationId')
      .isUUID()
      .withMessage('Conversation ID must be a valid UUID'),
  ],
  messageController.markMessagesAsRead
);

// Update a message
router.patch(
  '/messages/:messageId',
  [
    param('messageId')
      .isUUID()
      .withMessage('Message ID must be a valid UUID'),
    body('message')
      .optional()
      .isString()
      .notEmpty()
      .isLength({ max: 5000 })
      .withMessage('Message must be a non-empty string with maximum 5000 characters'),
    body('attachments')
      .optional()
      .isArray()
      .withMessage('Attachments must be an array'),
    body('attachments.*')
      .optional()
      .isString()
      .withMessage('Each attachment must be a string'),
  ],
  messageController.updateMessage
);

// Delete a message
router.delete(
  '/messages/:messageId',
  [
    param('messageId')
      .isUUID()
      .withMessage('Message ID must be a valid UUID'),
  ],
  messageController.deleteMessage
);

// Get unread message count for current user
router.get('/messages/unread/count', messageController.getUnreadMessageCount);

export default router;