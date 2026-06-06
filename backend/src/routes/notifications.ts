import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import notificationService from '@/services/NotificationService';
import { NotificationType } from '@/models/Notification';
import logger from '@/config/logger';

const router = Router();

// GET /api/v1/notifications/unread/count
router.get('/unread/count', authenticate, async (req, res) => {
  try {
    const unreadCount = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: { unreadCount } });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/v1/notifications?type=&page=&limit=
router.get('/', authenticate, async (req, res) => {
  try {
    const { type, page, limit } = req.query;
    const result = await notificationService.getUserNotifications(req.user.id, {
      type: type as NotificationType | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({
      success: true,
      data: result.notifications,
      pagination: {
        page: Number(page ?? 1),
        limit: Number(limit ?? 20),
        total: result.total,
        pages: Math.ceil(result.total / Number(limit ?? 20)),
      },
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/v1/notifications/read-all
router.patch('/read-all', authenticate, async (req, res) => {
  try {
    await notificationService.markAllAsRead(req.user.id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PATCH /api/v1/notifications/read  body: { notificationIds }
router.patch('/read', authenticate, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    await notificationService.markAsRead(req.user.id, notificationIds);
    res.json({ success: true, message: 'Notifications marked as read' });
  } catch (error) {
    logger.error('Error marking notifications as read:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/v1/notifications  body: { notificationIds }
router.delete('/', authenticate, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    await notificationService.deleteNotifications(req.user.id, notificationIds);
    res.json({ success: true, message: 'Notifications deleted' });
  } catch (error) {
    logger.error('Error deleting notifications:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/v1/notifications/preferences
router.get('/preferences', authenticate, async (req, res) => {
  try {
    const preferences = await notificationService.getUserPreferences(req.user.id);
    res.json({ success: true, data: preferences });
  } catch (error) {
    logger.error('Error fetching notification preferences:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /api/v1/notifications/preferences
router.put('/preferences', authenticate, async (req, res) => {
  try {
    await notificationService.updateUserPreferences(req.user.id, req.body);
    res.json({ success: true, message: 'Preferences updated' });
  } catch (error) {
    logger.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
