import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Avatar,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  ChatBubbleOutline as ChatIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, isYesterday } from 'date-fns';
import apiService from '../../services/api';
import socketService from '../../services/socketService';
import ChatInterface from '../messaging/ChatInterface';
import NewConversationDialog from '../messaging/NewConversationDialog';
import { tokens } from '../../theme/theme';

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
  lastMessage?: {
    id: string;
    message: string;
    messageType?: 'text' | 'image' | 'file';
    attachments?: string[];
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  isActive: boolean;
  lastMessageAt?: string | null;
  updatedAt: string;
  metadata?: {
    bookingId?: string;
    quoteRequestId?: string;
    serviceType?: string;
  };
}

// Deterministic warm accent per conversation — same palette logic used on provider cards.
const ACCENTS = [tokens.color.earth, tokens.color.terra, tokens.color.gold, tokens.color.stone, tokens.color.earthLight];
function accentFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

const MessagingPage: React.FC = () => {
  const { t } = useTranslation(['messages']);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams] = useSearchParams();
  const withUserId = searchParams.get('with');
  const bookingId = searchParams.get('bookingId');
  const directConversationId = searchParams.get('conversationId');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const currentUser = apiService.getStoredUser();

  const { data: conversationsData, isLoading, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiService.getConversations({ limit: 50, sortBy: 'lastMessage', sortOrder: 'desc' }),
  });

  useEffect(() => {
    if (conversationsData?.data) {
      setConversations(conversationsData.data);
      if (selectedConversation) return;

      if (directConversationId) {
        setSelectedConversation(directConversationId);
        return;
      }
      if (withUserId) {
        const withProvider = (c: Conversation) => c.participants.some(p => p.id === withUserId);
        const byBooking = bookingId
          ? conversationsData.data.find((c: Conversation) => c.metadata?.bookingId === bookingId)
          : null;
        const match = byBooking ?? conversationsData.data.find(withProvider);
        if (match) setSelectedConversation(match.id);
      }
    }
  }, [conversationsData, withUserId, directConversationId, bookingId, selectedConversation]);

  // When a conversation is selected (notably via a deep link, e.g. the "Message"
  // button on My Bookings), scroll its row into view in the left list. Without
  // this the row is highlighted but may sit far below the fold, so it looks
  // unselected. Guarded by a ref so we only scroll once per selection — not on
  // every list refetch/new-message render.
  const scrolledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedConversation) return;
    if (scrolledForRef.current === selectedConversation) return;
    const el = document.querySelector(`[data-conv-id="${selectedConversation}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
      scrolledForRef.current = selectedConversation;
    }
  }, [selectedConversation, conversations]);

  // Live updates: refetch the list whenever a message arrives or a conversation changes.
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    socketService.connect(token);
    const unsubMsg = socketService.onMessage(() => refetch());
    const unsubConv = socketService.onConversationUpdate(() => refetch());
    return () => { unsubMsg(); unsubConv(); };
  }, [refetch]);

  const otherParticipant = (c: Conversation): Participant | undefined =>
    c.participants.find(p => p.id !== currentUser?.id) ?? c.participants[0];

  const conversationTitle = (c: Conversation): string => {
    // For direct chats the other person's name is the clearest, most consistent label —
    // the service context is already shown via the chip. Stored titles are only used for
    // group/support conversations.
    const other = otherParticipant(c);
    if (c.type === 'direct' && other) return `${other.firstName} ${other.lastName}`.trim();
    return c.title || (other ? `${other.firstName} ${other.lastName}`.trim() : t('messages:conversation_label'));
  };

  const previewText = (c: Conversation): string => {
    const lm = c.lastMessage;
    if (!lm) return t('messages:conversation.no_messages');
    let body = lm.message?.trim();
    if (!body) {
      body = lm.messageType === 'image' ? `🖼 ${t('messages:attachment_image')}` : `📎 ${t('messages:attachment_file')}`;
    }
    const mine = lm.senderId === currentUser?.id;
    return mine ? `${t('messages:you_prefix')}${body}` : body;
  };

  const formatTime = (timestamp?: string | null): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return t('messages:yesterday');
    return format(date, 'dd/MM');
  };

  const filtered = conversations.filter(c => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const names = c.participants.map(p => `${p.firstName} ${p.lastName}`.toLowerCase()).join(' ');
    return conversationTitle(c).toLowerCase().includes(q)
      || names.includes(q)
      || (c.lastMessage?.message || '').toLowerCase().includes(q);
  });

  const handleConversationCreated = (conversationId: string) => {
    setNewConversationOpen(false);
    setSelectedConversation(conversationId);
    refetch();
  };

  const borderCol = isDark ? tokens.color.nightBorder : tokens.color.paperDark;
  const showList = !isMobile || !selectedConversation;
  const showChat = !isMobile || !!selectedConversation;

  // ---- Conversation row ----
  const ConversationRow: React.FC<{ c: Conversation; index: number }> = ({ c, index }) => {
    const other = otherParticipant(c);
    const accent = accentFor(c.id);
    const selected = selectedConversation === c.id;
    const unread = c.unreadCount > 0;
    const initials = other ? `${other.firstName?.[0] ?? ''}${other.lastName?.[0] ?? ''}`.toUpperCase() : '?';

    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, delay: Math.min(index * 0.025, 0.3), ease: [0.16, 1, 0.3, 1] }}
      >
        <Box
          data-conv-id={c.id}
          onClick={() => setSelectedConversation(c.id)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 2, py: 1.5, cursor: 'pointer',
            borderLeft: `3px solid ${selected ? tokens.color.terra : 'transparent'}`,
            bgcolor: selected ? (isDark ? alpha(tokens.color.terra, 0.1) : alpha(tokens.color.terra, 0.06)) : 'transparent',
            transition: 'background-color 0.15s ease',
            '&:hover': { bgcolor: selected ? undefined : (isDark ? alpha('#fff', 0.03) : alpha(tokens.color.stone, 0.06)) },
          }}
        >
          {/* Avatar */}
          {other?.profileImage ? (
            <Avatar src={other.profileImage} sx={{ width: 46, height: 46 }} />
          ) : (
            <Avatar sx={{
              width: 46, height: 46,
              bgcolor: alpha(accent, isDark ? 0.25 : 0.16),
              color: accent,
              fontFamily: tokens.font.display, fontWeight: 600, fontSize: '1.05rem',
            }}>
              {initials}
            </Avatar>
          )}

          {/* Body */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography sx={{
                flex: 1, minWidth: 0,
                fontFamily: tokens.font.body,
                fontWeight: unread ? 700 : 500,
                fontSize: '0.9rem',
                color: 'text.primary',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {conversationTitle(c)}
              </Typography>
              <Typography sx={{
                fontFamily: tokens.font.mono, fontSize: '0.68rem',
                color: unread ? tokens.color.terra : 'text.disabled',
                flexShrink: 0,
              }}>
                {formatTime(c.lastMessageAt || c.lastMessage?.createdAt)}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
              <Typography sx={{
                flex: 1, minWidth: 0,
                fontFamily: tokens.font.body, fontSize: '0.8rem',
                color: unread ? 'text.primary' : 'text.secondary',
                fontWeight: unread ? 600 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {previewText(c)}
              </Typography>

              {unread && (
                <Box sx={{
                  minWidth: 18, height: 18, px: 0.5,
                  borderRadius: tokens.radius.full,
                  bgcolor: tokens.color.terra, color: '#fff',
                  fontFamily: tokens.font.mono, fontSize: '0.65rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {c.unreadCount > 99 ? '99+' : c.unreadCount}
                </Box>
              )}
            </Box>

            {c.metadata?.serviceType && (
              <Box sx={{
                display: 'inline-flex', alignItems: 'center', mt: 0.5,
                px: 1, py: 0.1,
                borderRadius: tokens.radius.full,
                border: `1px solid ${alpha(accent, 0.35)}`,
                bgcolor: alpha(accent, isDark ? 0.16 : 0.08),
              }}>
                <Typography sx={{ fontFamily: tokens.font.body, fontSize: '0.65rem', fontWeight: 600, color: accent }}>
                  {c.metadata.serviceType}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </motion.div>
    );
  };

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', overflow: 'hidden' }}>
      {/* Conversation list pane */}
      {showList && (
        <Box sx={{
          width: isMobile ? '100%' : { md: 340, lg: 380 },
          flexShrink: 0,
          borderRight: isMobile ? 'none' : `1px solid ${borderCol}`,
          display: 'flex', flexDirection: 'column',
          bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
        }}>
          {/* Header */}
          <Box sx={{ px: 2.5, pt: 3, pb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography sx={{
                fontFamily: tokens.font.display, fontWeight: 500,
                fontSize: '1.75rem', color: 'text.primary', lineHeight: 1,
              }}>
                {t('messages:title')}
              </Typography>
              <Tooltip title={t('messages:new_conversation_tooltip')}>
                <IconButton
                  onClick={() => setNewConversationOpen(true)}
                  sx={{
                    bgcolor: tokens.color.earth, color: '#fff',
                    '&:hover': { bgcolor: tokens.color.earthLight },
                    width: 38, height: 38,
                  }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            <TextField
              fullWidth size="small"
              placeholder={t('messages:search_conversations')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                sx: { borderRadius: tokens.radius.full, bgcolor: isDark ? alpha('#fff', 0.04) : tokens.color.cream, fontFamily: tokens.font.body },
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm('')}><ClearIcon sx={{ fontSize: 16 }} /></IconButton>
                  </InputAdornment>
                ) : undefined,
              }}
            />
          </Box>

          {/* List */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {isLoading ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">{t('messages:loading')}</Typography>
              </Box>
            ) : filtered.length === 0 ? (
              <Box sx={{ p: 5, textAlign: 'center' }}>
                <ChatIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1.5 }} />
                <Typography variant="body2" color="text.secondary">
                  {searchTerm ? t('messages:no_results') : t('messages:no_conversations')}
                </Typography>
                {!searchTerm && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                    {t('messages:start_conversation')}
                  </Typography>
                )}
              </Box>
            ) : (
              filtered.map((c, i) => (
                <React.Fragment key={c.id}>
                  <ConversationRow c={c} index={i} />
                  <Box sx={{ height: '1px', bgcolor: borderCol, ml: 8.5, opacity: 0.6 }} />
                </React.Fragment>
              ))
            )}
          </Box>
        </Box>
      )}

      {/* Chat pane */}
      {showChat && (
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {selectedConversation ? (
            <ChatInterface
              conversationId={selectedConversation}
              onConversationUpdate={() => refetch()}
              onBack={isMobile ? () => setSelectedConversation(null) : undefined}
            />
          ) : (
            <Box sx={{
              height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: isDark ? tokens.color.night : tokens.color.cream,
            }}>
              <Box sx={{ textAlign: 'center', p: 4, maxWidth: 360 }}>
                <Box sx={{
                  width: 72, height: 72, borderRadius: tokens.radius.full,
                  bgcolor: isDark ? alpha(tokens.color.terra, 0.14) : alpha(tokens.color.terra, 0.08),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  mx: 'auto', mb: 2.5,
                }}>
                  <ChatIcon sx={{ fontSize: 34, color: tokens.color.terra }} />
                </Box>
                <Typography sx={{ fontFamily: tokens.font.display, fontWeight: 500, fontSize: '1.35rem', color: 'text.primary', mb: 1 }}>
                  {t('messages:select_conversation')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('messages:select_conversation_desc')}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      )}

      <NewConversationDialog
        open={newConversationOpen}
        onClose={() => setNewConversationOpen(false)}
        onConversationCreated={handleConversationCreated}
      />
    </Box>
  );
};

export default MessagingPage;
