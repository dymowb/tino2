import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import messageService from '@/services/MessageService';
import { AuthenticatedRequest } from '@/types';
import logger from '@/config/logger';
import multer from 'multer';
import { t } from '@/i18n';
import messageAttachmentService, {
  AttachmentAccessError,
  AttachmentValidationError,
} from '@/services/MessageAttachmentService';

/**
 * Uploads are buffered in memory (bounded to 10MB) rather than written straight to
 * disk, so nothing is persisted until its content has been validated. The previous
 * configuration wrote the file first and decided whether it was allowed by looking
 * at the filename extension.
 */
const messageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

/**
 * Build the filename part of a Content-Disposition header (RFC 6266 / RFC 5987).
 *
 * Node refuses to set a header containing bytes outside Latin-1, so interpolating a
 * filename directly means any upload named in CJK, Cyrillic or with an emoji uploads
 * fine and then 500s on every download. The ASCII `filename` is a lossy fallback for
 * old clients; `filename*` carries the real UTF-8 name.
 */
function contentDispositionFilename(originalName: string): string {
  const stripped = originalName.replace(/[\r\n"\\]/g, '_');
  // eslint-disable-next-line no-control-regex
  const asciiFallback = stripped.replace(/[^\x20-\x7e]/g, '_') || 'attachment';
  const encoded = encodeURIComponent(stripped);
  return `filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export class MessageController {
  createConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: t(req, 'common.validation_failed'),
          errors: errors.mapped(),
        });
        return;
      }

      const userId = req.user!.userId;
      const conversationData = req.body;

      const conversation = await messageService.createConversation(userId, conversationData);

      res.status(201).json({
        success: true,
        data: conversation,
        message: t(req, 'message.conversation_created'),
      });
    } catch (error) {
      logger.error('Error creating conversation:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.conversation_create_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
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
          message: t(req, 'message.conversation_not_found'),
        });
        return;
      }

      res.json({
        success: true,
        data: conversation,
        message: t(req, 'message.conversation_retrieved'),
      });
    } catch (error) {
      logger.error('Error getting conversation:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.conversation_retrieve_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
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
          pages: Math.ceil(result.total / result.limit),
        },
        message: t(req, 'message.conversations_retrieved'),
      });
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.conversations_retrieve_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
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
          errors: errors.mapped(),
        });
        return;
      }

      const senderId = req.user!.userId;
      const messageData = req.body;

      const message = await messageService.sendMessage(senderId, messageData);

      res.status(201).json({
        success: true,
        data: message,
        message: t(req, 'message.sent'),
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
      // Attaching a file the sender does not own is a bad request, not a server fault.
      if (error instanceof AttachmentValidationError) {
        res.status(400).json({
          success: false,
          message: t(req, 'message.attachment_not_owned'),
        });
        return;
      }
      logger.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.send_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
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
          pages: Math.ceil(result.total / result.limit),
        },
        message: t(req, 'message.retrieved'),
      });
    } catch (error) {
      logger.error('Error getting conversation messages:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.retrieve_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
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
        message: `${count} messages marked as read`,
      });
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.mark_read_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
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
          errors: errors.mapped(),
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
        message: t(req, 'message.updated'),
      });
    } catch (error) {
      if (error instanceof AttachmentValidationError) {
        res.status(400).json({
          success: false,
          message: t(req, 'message.attachment_not_owned'),
        });
        return;
      }
      logger.error('Error updating message:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.update_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
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
        message: t(req, 'message.deleted'),
      });
    } catch (error) {
      logger.error('Error deleting message:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.delete_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
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
        message: t(req, 'message.unread_count_retrieved'),
      });
    } catch (error) {
      logger.error('Error getting unread message count:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'message.unread_count_failed'),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // GET /messages/contacts — people the caller shares a booking or quote with
  getContacts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const contacts = await messageService.getContacts(req.user!.userId, search);

      res.json({ success: true, data: contacts });
    } catch (error) {
      logger.error('Error getting conversation contacts:', error);
      res.status(500).json({
        success: false,
        message: t(req, 'common.internal_error'),
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

        const stored = await messageAttachmentService.store(
          req.user!.userId,
          // busboy hands back multipart filenames as UTF-8 bytes read as latin1, so a
          // name like "写真.png" arrives mojibake'd. Reinterpret before storing —
          // otherwise the corruption is persisted and every later render shows it.
          Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
          req.file.buffer
        );

        res.json({
          success: true,
          data: {
            // An API path, not a static file path. Reading it requires authentication
            // and conversation membership.
            url: `/api/v1/messages/attachments/${stored.id}`,
            originalName: stored.originalName,
            mimeType: stored.mimeType,
            size: stored.sizeBytes,
          },
        });
      } catch (error) {
        if (error instanceof AttachmentValidationError) {
          res
            .status(400)
            .json({ success: false, message: t(req, 'message.file_type_not_allowed') });
          return;
        }
        logger.error('Error uploading message attachment:', error);
        res.status(500).json({ success: false, message: t(req, 'message.upload_failed') });
      }
    },
  ];

  // GET /messages/attachments/:id — authenticated, membership-checked file read
  downloadAttachment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { attachment } = await messageAttachmentService.resolveForReader(
        req.params.id,
        req.user!.userId
      );
      const contents = await messageAttachmentService.readFile(attachment);

      // The stored MIME type was derived from the file's own signature, so it is safe
      // to send. nosniff stops the browser second-guessing it, and the quoted filename
      // keeps a crafted originalName from breaking out of the header.
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=0, no-store');
      const disposition = attachment.mimeType.startsWith('image/') ? 'inline' : 'attachment';
      res.setHeader(
        'Content-Disposition',
        `${disposition}; ${contentDispositionFilename(attachment.originalName)}`
      );
      // The client reads the filename from this header to label the attachment, so
      // it has to survive a cross-origin deployment (VITE_API_URL on another host).
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

      res.send(contents);
    } catch (error) {
      if (error instanceof AttachmentAccessError) {
        // 404 rather than 403: an outsider should not learn that the id is real.
        res.status(404).json({ success: false, message: t(req, 'message.attachment_not_found') });
        return;
      }
      logger.error('Error reading message attachment:', error);
      res.status(500).json({ success: false, message: t(req, 'common.internal_error') });
    }
  };
}

export default new MessageController();
