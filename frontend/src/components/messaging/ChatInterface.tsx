import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  CircularProgress,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Reply as ReplyIcon,
  Close as CloseIcon,
  InsertDriveFile as FileIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import apiService from '../../services/api';
import socketService from '../../services/socketService';
import { tokens } from '../../theme/theme';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  message: string;
  messageType: 'text' | 'image' | 'file';
  attachments?: string[];
  replyToMessageId?: string;
  createdAt: string;
  isRead: boolean;
  isEdited?: boolean;
  sender: { id: string; firstName: string; lastName: string; profileImage?: string };
  replyToMessage?: { id: string; message: string; sender: { firstName: string; lastName: string } };
}

interface Participant {
  id: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  userType: 'customer' | 'provider';
}

interface Conversation {
  id: string;
  title?: string;
  type: 'direct' | 'group' | 'support';
  participants: Participant[];
  metadata?: { bookingId?: string; quoteRequestId?: string; serviceType?: string };
}

interface Props {
  conversationId: string;
  onConversationUpdate?: () => void;
  onBack?: () => void;
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api/v1', '') || '';

const ChatInterface: React.FC<Props> = ({ conversationId, onConversationUpdate, onBack }) => {
  const { t } = useTranslation('messages');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ url: string; originalName: string; mimeType: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastReadMarkerRef = useRef<string>('');
  const queryClient = useQueryClient();
  const currentUser = apiService.getStoredUser();

  const { data: conversationData } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => apiService.getConversation(conversationId),
    enabled: !!conversationId,
  });

  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => apiService.getMessages(conversationId, { limit: 100, sortOrder: 'asc' }),
    enabled: !!conversationId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (data: Parameters<typeof apiService.sendMessage>[0]) => apiService.sendMessage(data),
    onSuccess: () => {
      setMessageText('');
      setReplyToMessage(null);
      setPendingAttachments([]);
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      onConversationUpdate?.();
    },
    onError: (error) => {
      toast.error(t('errors.send_failed'));
      console.error('Send message error:', error);
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: ({ messageId, updates }: { messageId: string; updates: any }) =>
      apiService.updateMessage(messageId, updates),
    onSuccess: () => {
      setEditingMessage(null);
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: () => toast.error(t('errors.update_failed')),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: apiService.deleteMessage,
    onSuccess: () => {
      setMenuAnchorEl(null);
      setSelectedMessage(null);
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      onConversationUpdate?.();
    },
    onError: () => toast.error(t('errors.delete_failed')),
  });

  useEffect(() => {
    if (messagesData?.data) setMessages(messagesData.data);
  }, [messagesData]);

  // Reset the read-marker + composer when switching conversations
  useEffect(() => {
    lastReadMarkerRef.current = '';
    setReplyToMessage(null);
    setEditingMessage(null);
    setMessageText('');
  }, [conversationId]);

  // Live append via socket
  useEffect(() => {
    if (!conversationId) return;
    socketService.joinConversation(conversationId);
    const unsubscribe = socketService.onMessage((messageData) => {
      if (messageData.conversationId === conversationId) {
        setMessages(prev => {
          const exists = prev.find(m => m.id === messageData.id);
          if (exists) return prev.map(m => (m.id === messageData.id ? { ...m, ...messageData } : m));
          return [...prev, messageData as Message];
        });
      }
    });
    return () => { socketService.leaveConversation(conversationId); unsubscribe(); };
  }, [conversationId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Mark inbound messages read — only when the latest message id changes (not every render),
  // and only if there is actually something unread addressed to us. Then refresh the
  // conversation list so its unread badge clears.
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    const latestId = messages[messages.length - 1]?.id ?? '';
    if (latestId === lastReadMarkerRef.current) return;
    const hasUnreadInbound = messages.some(m => m.senderId !== currentUser?.id && !m.isRead);
    lastReadMarkerRef.current = latestId;
    if (hasUnreadInbound) {
      apiService.markMessagesAsRead(conversationId)
        .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))
        .catch(console.error);
    }
  }, [messages, conversationId, currentUser?.id, queryClient]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const handleSendMessage = () => {
    if (!messageText.trim() && pendingAttachments.length === 0) return;
    const attachmentUrls = pendingAttachments.map(a => a.url);
    const hasAttachments = attachmentUrls.length > 0;
    if (editingMessage) {
      updateMessageMutation.mutate({ messageId: editingMessage.id, updates: { message: messageText.trim() } });
      return;
    }
    sendMessageMutation.mutate({
      conversationId,
      message: messageText.trim() || '',
      messageType: hasAttachments ? (pendingAttachments[0].mimeType.startsWith('image/') ? 'image' : 'file') : 'text',
      attachments: hasAttachments ? attachmentUrls : undefined,
      replyToMessageId: replyToMessage?.id,
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const uploads = await Promise.all(Array.from(files).map(file => apiService.uploadMessageAttachment(file)));
      setPendingAttachments(prev => [...prev, ...uploads]);
    } catch {
      toast.error(t('errors.upload_failed'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePendingAttachment = (index: number) => setPendingAttachments(prev => prev.filter((_, i) => i !== index));

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (messageText.trim() || pendingAttachments.length > 0) handleSendMessage();
    }
  };

  const formatBubbleTime = (timestamp: string) => format(new Date(timestamp), 'HH:mm');

  const dateSeparatorLabel = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) return t('today');
    if (isYesterday(date)) return t('yesterday');
    return format(date, 'dd/MM/yyyy');
  };

  const conversationTitle = (c: Conversation) => {
    // Prefer the other person's name for direct chats (consistent with the list); the service
    // chip carries the service context. Stored titles are only for group/support chats.
    const others = c.participants.filter(p => p.id !== currentUser?.id);
    if (c.type === 'direct' && others.length >= 1) return `${others[0].firstName} ${others[0].lastName}`.trim();
    return c.title || t('conversation.conversation_fallback');
  };

  const headerOther = conversationData?.participants?.find((p: Participant) => p.id !== currentUser?.id);
  const canEditOrDelete = (m: Message) => m.senderId === currentUser?.id;

  const borderCol = isDark ? tokens.color.nightBorder : tokens.color.paperDark;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: isDark ? tokens.color.night : tokens.color.cream }}>
      {/* Header */}
      {conversationData && (
        <Box sx={{
          px: 2.5, py: 1.75,
          borderBottom: `1px solid ${borderCol}`,
          bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
          display: 'flex', alignItems: 'center', gap: 1.5,
        }}>
          {onBack && (
            <IconButton onClick={onBack} size="small" sx={{ mr: -0.5 }}><ArrowBackIcon /></IconButton>
          )}
          {headerOther?.profileImage ? (
            <Avatar src={headerOther.profileImage} sx={{ width: 40, height: 40 }} />
          ) : (
            <Avatar sx={{
              width: 40, height: 40,
              bgcolor: alpha(tokens.color.earth, isDark ? 0.25 : 0.14),
              color: isDark ? tokens.color.cream : tokens.color.earth,
              fontFamily: tokens.font.display, fontWeight: 600,
            }}>
              {headerOther ? `${headerOther.firstName?.[0] ?? ''}${headerOther.lastName?.[0] ?? ''}`.toUpperCase() : '?'}
            </Avatar>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{
              fontFamily: tokens.font.display, fontWeight: 500, fontSize: '1.05rem',
              color: 'text.primary', lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {conversationTitle(conversationData)}
            </Typography>
            {conversationData.metadata?.serviceType && (
              <Typography sx={{ fontFamily: tokens.font.body, fontSize: '0.72rem', color: tokens.color.terra, fontWeight: 600 }}>
                {conversationData.metadata.serviceType}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', px: { xs: 1.5, md: 3 }, py: 2 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress sx={{ color: tokens.color.terra }} /></Box>
        ) : messages.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 6 }}>
            <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1.1rem', color: 'text.secondary', mb: 0.5 }}>
              {t('conversation.no_messages')}
            </Typography>
            <Typography variant="body2" color="text.disabled">{t('conversation.start_conversation_text')}</Typography>
          </Box>
        ) : (
          messages.map((message, idx) => {
            const isOwn = message.senderId === currentUser?.id;
            const prev = messages[idx - 1];
            const showDate = !prev || new Date(prev.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
            const accent = isOwn ? tokens.color.terra : (isDark ? tokens.color.nightCard : tokens.color.paper);

            return (
              <React.Fragment key={message.id}>
                {showDate && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                    <Box sx={{
                      px: 1.5, py: 0.4, borderRadius: tokens.radius.full,
                      bgcolor: isDark ? alpha('#fff', 0.06) : alpha(tokens.color.stone, 0.1),
                    }}>
                      <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.68rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {dateSeparatorLabel(message.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: 8 }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, maxWidth: { xs: '85%', md: '70%' } }}>
                    {!isOwn && (
                      <Avatar src={message.sender.profileImage} sx={{
                        width: 28, height: 28, fontSize: '0.7rem',
                        bgcolor: alpha(tokens.color.earth, isDark ? 0.25 : 0.14),
                        color: isDark ? tokens.color.cream : tokens.color.earth,
                        fontFamily: tokens.font.body, fontWeight: 600,
                      }}>
                        {message.sender.firstName?.[0]}{message.sender.lastName?.[0]}
                      </Avatar>
                    )}

                    <Box sx={{
                      position: 'relative',
                      p: 1.5,
                      bgcolor: accent,
                      color: isOwn ? '#fff' : 'text.primary',
                      border: isOwn ? 'none' : `1px solid ${borderCol}`,
                      borderRadius: tokens.radius.md,
                      borderBottomRightRadius: isOwn ? tokens.radius.sm : tokens.radius.md,
                      borderBottomLeftRadius: isOwn ? tokens.radius.md : tokens.radius.sm,
                      '&:hover .msg-menu': { opacity: 1 },
                    }}>
                      {message.replyToMessage && (
                        <Box sx={{
                          p: 1, mb: 1, borderRadius: tokens.radius.sm,
                          bgcolor: isOwn ? alpha('#000', 0.15) : (isDark ? alpha('#fff', 0.05) : alpha(tokens.color.stone, 0.08)),
                          borderLeft: `3px solid ${isOwn ? alpha('#fff', 0.5) : tokens.color.terra}`,
                        }}>
                          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.85 }}>
                            {t('conversation.replying_to', { name: message.replyToMessage.sender.firstName })}
                          </Typography>
                          <Typography sx={{ fontSize: '0.78rem', opacity: 0.8 }}>
                            {message.replyToMessage.message.length > 60 ? `${message.replyToMessage.message.slice(0, 60)}…` : message.replyToMessage.message}
                          </Typography>
                        </Box>
                      )}

                      {message.message?.trim() && (
                        <Typography sx={{ fontFamily: tokens.font.body, fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {message.message}
                        </Typography>
                      )}

                      {message.attachments && message.attachments.length > 0 && (
                        <Box sx={{ mt: message.message?.trim() ? 1 : 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {message.attachments.map((url, i) => {
                            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                            const fullUrl = `${API_BASE}${url}`;
                            const fileName = url.split('/').pop() || 'attachment';
                            return isImage ? (
                              <Box key={i} component="img" src={fullUrl} alt="attachment"
                                onClick={() => window.open(fullUrl, '_blank')}
                                sx={{ maxWidth: 220, maxHeight: 220, borderRadius: tokens.radius.sm, cursor: 'pointer', display: 'block' }} />
                            ) : (
                              <Box key={i} component="a" href={fullUrl} target="_blank" rel="noopener noreferrer"
                                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                                <FileIcon fontSize="small" />
                                <Typography sx={{ fontSize: '0.78rem' }}>{fileName}</Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, mt: 0.5 }}>
                        <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.62rem', opacity: 0.7 }}>
                          {formatBubbleTime(message.createdAt)}{message.isEdited ? ` · ${t('conversation.edited')}` : ''}
                        </Typography>
                        <IconButton
                          className="msg-menu"
                          size="small"
                          onClick={(e) => { setMenuAnchorEl(e.currentTarget); setSelectedMessage(message); }}
                          sx={{ p: 0.25, opacity: { xs: 0.6, md: 0 }, transition: 'opacity 0.15s', color: 'inherit' }}
                        >
                          <MoreVertIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Box>
                    </Box>
                  </Box>
                </motion.div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Reply banner */}
      <AnimatePresence>
        {replyToMessage && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <Box sx={{
              px: 2.5, py: 1, borderTop: `1px solid ${borderCol}`,
              bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Box sx={{ borderLeft: `3px solid ${tokens.color.terra}`, pl: 1.5 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: tokens.color.terra }}>
                  {t('conversation.replying_to', { name: replyToMessage.sender.firstName })}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {replyToMessage.message}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setReplyToMessage(null)}><CloseIcon fontSize="small" /></IconButton>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <Box sx={{ px: 2, py: 1.5, borderTop: `1px solid ${borderCol}`, bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper }}>
        {pendingAttachments.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            {pendingAttachments.map((att, idx) => {
              const isImage = att.mimeType.startsWith('image/');
              const fullUrl = `${API_BASE}${att.url}`;
              return (
                <Box key={idx} sx={{ position: 'relative' }}>
                  {isImage ? (
                    <Box component="img" src={fullUrl} alt={att.originalName} sx={{ width: 60, height: 60, objectFit: 'cover', borderRadius: tokens.radius.sm }} />
                  ) : (
                    <Box sx={{ width: 60, height: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1px solid ${borderCol}`, borderRadius: tokens.radius.sm }}>
                      <FileIcon fontSize="small" />
                      <Typography sx={{ fontSize: 8, px: 0.5, textAlign: 'center', wordBreak: 'break-all' }}>
                        {att.originalName.length > 10 ? att.originalName.slice(0, 9) + '…' : att.originalName}
                      </Typography>
                    </Box>
                  )}
                  <IconButton size="small" onClick={() => removePendingAttachment(idx)}
                    sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', p: 0.25, border: `1px solid ${borderCol}`, '&:hover': { bgcolor: 'background.paper' } }}>
                    <CloseIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                </Box>
              );
            })}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple accept="image/*,.pdf,.doc,.docx,.txt,.zip" onChange={handleFileSelect} />
          <Tooltip title={t('conversation.attach_file')}>
            <IconButton onClick={() => fileInputRef.current?.click()} disabled={isUploading} sx={{ color: tokens.color.stone }}>
              {isUploading ? <CircularProgress size={20} /> : <AttachFileIcon />}
            </IconButton>
          </Tooltip>

          <TextField
            fullWidth multiline maxRows={4} size="small"
            placeholder={editingMessage ? t('conversation.edit_message_placeholder') : t('conversation.type_message')}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            InputProps={{ sx: { borderRadius: tokens.radius.lg, bgcolor: isDark ? alpha('#fff', 0.04) : tokens.color.cream, fontFamily: tokens.font.body, fontSize: '0.9rem' } }}
          />

          <IconButton
            onClick={handleSendMessage}
            disabled={(!messageText.trim() && pendingAttachments.length === 0) || sendMessageMutation.isPending || updateMessageMutation.isPending}
            sx={{
              bgcolor: tokens.color.terra, color: '#fff', width: 40, height: 40,
              '&:hover': { bgcolor: tokens.color.terraDark },
              '&.Mui-disabled': { bgcolor: alpha(tokens.color.terra, 0.4), color: '#fff' },
            }}
          >
            {sendMessageMutation.isPending || updateMessageMutation.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : <SendIcon fontSize="small" />}
          </IconButton>
        </Box>

        {editingMessage && (
          <Box sx={{ mt: 0.75, display: 'flex', gap: 1, alignItems: 'center', pl: 6 }}>
            <Typography variant="caption" color="text.secondary">{t('conversation.editing')}</Typography>
            <Typography variant="caption" sx={{ cursor: 'pointer', color: tokens.color.terra }} onClick={() => { setEditingMessage(null); setMessageText(''); }}>
              {t('conversation.cancel_edit')}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Message menu */}
      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={() => setMenuAnchorEl(null)}>
        <MenuItem onClick={() => { if (selectedMessage) { setReplyToMessage(selectedMessage); setMenuAnchorEl(null); } }}>
          <ReplyIcon sx={{ mr: 1 }} fontSize="small" /> {t('conversation.reply')}
        </MenuItem>
        {selectedMessage && canEditOrDelete(selectedMessage) && (
          <>
            <MenuItem onClick={() => { if (selectedMessage) { setEditingMessage(selectedMessage); setMessageText(selectedMessage.message); setMenuAnchorEl(null); } }}>
              <EditIcon sx={{ mr: 1 }} fontSize="small" /> {t('conversation.edit')}
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { if (selectedMessage) deleteMessageMutation.mutate(selectedMessage.id); }} sx={{ color: 'error.main' }}>
              <DeleteIcon sx={{ mr: 1 }} fontSize="small" /> {t('conversation.delete')}
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
};

export default ChatInterface;
