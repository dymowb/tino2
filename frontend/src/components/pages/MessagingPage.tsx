import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Grid,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Badge,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Message as MessageIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import apiService from '../../services/api';
import socketService from '../../services/socketService';
import ChatInterface from '../messaging/ChatInterface';
import NewConversationDialog from '../messaging/NewConversationDialog';
import { format, isToday, isYesterday } from 'date-fns';

interface Conversation {
  id: string;
  title?: string;
  type: 'direct' | 'group' | 'support';
  participants: Array<{
    id: string;
    firstName: string;
    lastName: string;
    profileImage?: string;
    userType: 'customer' | 'provider';
  }>;
  lastMessage?: {
    id: string;
    message: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
  isActive: boolean;
  updatedAt: string;
  metadata?: {
    bookingId?: string;
    quoteRequestId?: string;
    serviceType?: string;
  };
}

const MessagingPage: React.FC = () => {
  const { t } = useTranslation(['messages']);
  const [searchParams] = useSearchParams();
  const withUserId = searchParams.get('with');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const { data: conversationsData, isLoading, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiService.getConversations({
      limit: 50,
      sortBy: 'lastMessage',
      sortOrder: 'desc',
    }),
  });

  useEffect(() => {
    if (conversationsData?.data) {
      setConversations(conversationsData.data);
      // Auto-select conversation when navigated with ?with=userId
      if (withUserId && !selectedConversation) {
        const match = conversationsData.data.find((c: Conversation) =>
          c.participants.some(p => p.id === withUserId)
        );
        if (match) setSelectedConversation(match.id);
      }
    }
  }, [conversationsData, withUserId]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      socketService.connect(token);

      const unsubscribeMessage = socketService.onMessage(() => {
        refetch();
      });

      const unsubscribeConversation = socketService.onConversationUpdate((data) => {
        setConversations(prev => 
          prev.map(conv => 
            conv.id === data.id 
              ? { ...conv, ...data }
              : conv
          )
        );
      });

      return () => {
        unsubscribeMessage();
        unsubscribeConversation();
      };
    }
  }, [refetch]);

  const filteredConversations = conversations.filter(conversation => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const title = conversation.title?.toLowerCase() || '';
    const participantNames = conversation.participants
      .map(p => `${p.firstName} ${p.lastName}`.toLowerCase())
      .join(' ');
    const lastMessage = conversation.lastMessage?.message.toLowerCase() || '';
    
    return title.includes(searchLower) || 
           participantNames.includes(searchLower) || 
           lastMessage.includes(searchLower);
  });

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return t('messages:yesterday');
    } else {
      return format(date, 'MMM d');
    }
  };

  const getConversationTitle = (conversation: Conversation) => {
    if (conversation.title) {
      return conversation.title;
    }

    if (conversation.type === 'direct') {
      const otherParticipants = conversation.participants.filter(p => {
        const currentUser = apiService.getStoredUser();
        return p.id !== currentUser?.id;
      });

      if (otherParticipants.length === 1) {
        const participant = otherParticipants[0];
        return `${participant.firstName} ${participant.lastName}`;
      }
    }

    return t('messages:conversation_label');
  };

  const getConversationAvatar = (conversation: Conversation) => {
    if (conversation.type === 'group' || conversation.participants.length > 2) {
      return <MessageIcon />;
    }
    
    const currentUser = apiService.getStoredUser();
    const otherParticipant = conversation.participants.find(p => p.id !== currentUser?.id);
    
    if (otherParticipant?.profileImage) {
      return <Avatar src={otherParticipant.profileImage} />;
    }
    
    return (
      <Avatar>
        {otherParticipant ? 
          `${otherParticipant.firstName[0]}${otherParticipant.lastName[0]}` : 
          '?'
        }
      </Avatar>
    );
  };

  const handleConversationCreated = (conversationId: string) => {
    setNewConversationOpen(false);
    setSelectedConversation(conversationId);
    refetch();
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    // Refetch to ensure we have the full conversations list
    refetch();
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h4" gutterBottom>
          {t('messages:title')}
        </Typography>
      </Box>

      <Grid container sx={{ flexGrow: 1, height: 'calc(100vh - 120px)' }}>
        {/* Conversations List */}
        <Grid item xs={12} md={4} lg={3}>
          <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <TextField
                fullWidth
                size="small"
                placeholder={t('messages:search_conversations')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      {searchTerm && (
                        <IconButton
                          size="small"
                          onClick={handleClearSearch}
                          title={t('messages:clear_search')}
                        >
                          <ClearIcon />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => setNewConversationOpen(true)}
                        title={t('messages:new_conversation_tooltip')}
                      >
                        <AddIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <List sx={{ flexGrow: 1, overflow: 'auto', p: 0 }}>
              {isLoading ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('messages:loading')}
                  </Typography>
                </Box>
              ) : filteredConversations.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {searchTerm ? t('messages:no_results') : t('messages:no_conversations')}
                  </Typography>
                </Box>
              ) : (
                filteredConversations.map((conversation) => (
                  <React.Fragment key={conversation.id}>
                    <ListItem
                      button
                      selected={selectedConversation === conversation.id}
                      onClick={() => setSelectedConversation(conversation.id)}
                      sx={{ 
                        py: 2,
                        backgroundColor: selectedConversation === conversation.id ? 'action.selected' : 'transparent'
                      }}
                    >
                      <ListItemAvatar>
                        <Badge 
                          badgeContent={conversation.unreadCount} 
                          color="primary"
                          max={99}
                        >
                          {getConversationAvatar(conversation)}
                        </Badge>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography 
                              variant="subtitle2" 
                              sx={{ 
                                fontWeight: conversation.unreadCount > 0 ? 600 : 400,
                                flexGrow: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {getConversationTitle(conversation)}
                            </Typography>
                            {conversation.metadata?.serviceType && (
                              <Chip 
                                label={conversation.metadata.serviceType} 
                                size="small" 
                                variant="outlined"
                                sx={{ fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '70%',
                                fontWeight: conversation.unreadCount > 0 ? 500 : 400
                              }}
                            >
                              {conversation.lastMessage?.message || t('messages:conversation.no_messages')}
                            </Typography>
                            {conversation.lastMessage && (
                              <Typography variant="caption" color="text.secondary">
                                {formatMessageTime(conversation.lastMessage.createdAt)}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                    <Divider variant="inset" component="li" />
                  </React.Fragment>
                ))
              )}
            </List>
          </Paper>
        </Grid>

        {/* Chat Interface */}
        <Grid item xs={12} md={8} lg={9}>
          {selectedConversation ? (
            <ChatInterface 
              conversationId={selectedConversation}
              onConversationUpdate={() => refetch()}
            />
          ) : (
            <Paper sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Box sx={{ textAlign: 'center', p: 4 }}>
                <MessageIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  {t('messages:select_conversation')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('messages:select_conversation_desc')}
                </Typography>
              </Box>
            </Paper>
          )}
        </Grid>
      </Grid>

      <NewConversationDialog
        open={newConversationOpen}
        onClose={() => setNewConversationOpen(false)}
        onConversationCreated={handleConversationCreated}
      />
    </Box>
  );
};

export default MessagingPage;