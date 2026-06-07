import type { TFunction } from 'i18next';

/**
 * Shape of the i18n payload the backend stores in `notification.metadata.i18n`
 * (see NotificationService.createNotification). Keys point into the
 * `notifications` namespace; params are interpolation values.
 */
export interface NotificationI18n {
  titleKey?: string;
  messageKey?: string;
  params?: Record<string, unknown>;
}

interface NotificationLike {
  title?: string;
  message?: string;
  metadata?: ({ i18n?: NotificationI18n } & Record<string, unknown>) | null;
}

/**
 * Resolve a notification's display title/message in the current language.
 *
 * Newer notifications carry translation keys in `metadata.i18n`, so the bell
 * icon and notification center can render in the user's selected language and
 * react to live language switches. Older notifications (or email/SMS fallbacks)
 * only have the stored `title`/`message` strings, which we fall back to.
 *
 * `t` must be bound to the `notifications` namespace.
 */
export function getNotificationText(
  n: NotificationLike,
  t: TFunction
): { title: string; message: string } {
  const i18n = n.metadata?.i18n;
  const params = (i18n?.params || {}) as Record<string, unknown>;
  const title = i18n?.titleKey ? t(i18n.titleKey, params) : n.title || '';
  const message = i18n?.messageKey ? t(i18n.messageKey, params) : n.message || '';
  return { title, message };
}
