import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Chip,
  Menu,
  MenuItem,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Reply as ReplyIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiService from '../../services/api';
import socketService from '../../services/socketService';
import { format, isToday, isYesterday } from 'date-fns';
import { toast } from 'react-hot-toast';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  message: string;
  messageType: 'text' | 'image' | 'file';
  attachments?: string[];
  replyToMessageId?: string;
  timestamp: string;
  isRead: boolean;
  isEdited?: boolean;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    profileImage?: string;
  };
  replyToMessage?: {
    id: string;
    message: string;
    sender: {
      firstName: string;
      lastName: string;
    };
  };
}

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
  metadata?: {
    bookingId?: string;
    quoteRequestId?: string;
    serviceType?: string;
  };
}

interface Props {
  conversationId: string;
  onConversationUpdate?: () => void;
}

const ChatInterface: React.FC<Props> = ({ conversationId, onConversationUpdate }) => {
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const currentUser = apiService.getStoredUser();

  const { data: conversationData } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => apiService.getConversation(conversationId),
    enabled: !!conversationId,
  });

  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => apiService.getMessages(conversationId, {
      limit: 100,
      sortOrder: 'asc',
    }),
    enabled: !!conversationId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: apiService.sendMessage,
    onSuccess: () => {
      setMessageText('');
      setReplyToMessage(null);
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      onConversationUpdate?.();
    },
    onError: (error) => {
      toast.error('Failed to send message');
      console.error('Send message error:', error);
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: ({ messageId, updates }: { messageId: string; updates: any }) =>
      apiService.updateMessage(messageId, updates),
    onSuccess: () => {
      setEditingMessage(null);
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: () => {
      toast.error('Failed to update message');
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: apiService.deleteMessage,
    onSuccess: () => {
      setMenuAnchorEl(null);
      setSelectedMessage(null);
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: () => {
      toast.error('Failed to delete message');
    },
  });

  useEffect(() => {
    if (messagesData?.data) {
      setMessages(messagesData.data);
    }
  }, [messagesData]);

  useEffect(() => {
    if (conversationId) {
      socketService.joinConversation(conversationId);
      
      const unsubscribe = socketService.onMessage((messageData) => {
        if (messageData.conversationId === conversationId) {
          setMessages(prev => {
            const exists = prev.find(m => m.id === messageData.id);
            if (exists) {
              return prev.map(m => m.id === messageData.id ? { ...m, ...messageData } : m);
            } else {
              return [...prev, messageData as Message];
            }
          });
        }
      });

      return () => {
        socketService.leaveConversation(conversationId);
        unsubscribe();
      };
    }
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (conversationId) {
      apiService.markMessagesAsRead(conversationId).catch(console.error);
    }
  }, [conversationId, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) return;

    const messageData = {
      conversationId,
      message: messageText.trim(),
      messageType: 'text' as const,
      replyToMessageId: replyToMessage?.id,
    };

    if (editingMessage) {
      updateMessageMutation.mutate({
        messageId: editingMessage.id,
        updates: { message: messageText.trim() },
      });
    } else {
      sendMessageMutation.mutate(messageData);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleTyping = (value: string) => {
    setMessageText(value);
    
    if (value && !isTyping) {
      setIsTyping(true);
      socketService.sendTyping(conversationId, true);
    } else if (!value && isTyping) {
      setIsTyping(false);
      socketService.sendTyping(conversationId, false);
    }
  };

  const handleMessageMenu = (event: React.MouseEvent<HTMLElement>, message: Message) => {
    setMenuAnchorEl(event.currentTarget);
    setSelectedMessage(message);
  };

  const handleEditMessage = () => {
    if (selectedMessage) {
      setEditingMessage(selectedMessage);
      setMessageText(selectedMessage.message);
      setMenuAnchorEl(null);
    }
  };

  const handleDeleteMessage = () => {
    if (selectedMessage) {
      deleteMessageMutation.mutate(selectedMessage.id);
    }
  };

  const handleReplyToMessage = (message: Message) => {
    setReplyToMessage(message);
    setMenuAnchorEl(null);
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return `Yesterday ${format(date, 'HH:mm')}`;
    } else {
      return format(date, 'MMM d, HH:mm');
    }
  };

  const getConversationTitle = (conversation: Conversation) => {
    if (conversation.title) {
      return conversation.title;
    }
    
    if (conversation.type === 'direct') {
      const otherParticipants = conversation.participants.filter(p => p.id !== currentUser?.id);
      if (otherParticipants.length === 1) {
        const participant = otherParticipants[0];
        return `${participant.firstName} ${participant.lastName}`;
      }
    }
    
    return 'Conversation';
  };

  const canEditOrDelete = (message: Message): boolean => {
    return message.senderId === currentUser?.id;
  };

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      {conversationData && (
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="h6">
              {getConversationTitle(conversationData)}
            </Typography>
            {conversationData.metadata?.serviceType && (
              <Chip 
                label={conversationData.metadata.serviceType} 
                size="small" 
                variant="outlined" 
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {conversationData.participants.length} participants
          </Typography>
        </Box>
      )}

      {/* Messages */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No messages yet. Start the conversation!
            </Typography>
          </Box>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderId === currentUser?.id;
            return (
              <Box
                key={message.id}
                sx={{
                  display: 'flex',
                  justifyContent: isOwn ? 'flex-end' : 'flex-start',
                  mb: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, maxWidth: '70%' }}>
                  {!isOwn && (
                    <Avatar 
                      src={message.sender.profileImage}
                      sx={{ width: 32, height: 32 }}
                    >
                      {message.sender.firstName[0]}{message.sender.lastName[0]}
                    </Avatar>
                  )}
                  
                  <Paper
                    elevation={1}
                    sx={{
                      p: 1.5,
                      backgroundColor: isOwn ? 'primary.main' : 'background.paper',
                      color: isOwn ? 'primary.contrastText' : 'text.primary',
                      borderRadius: 2,
                      position: 'relative',
                    }}
                  >
                    {message.replyToMessage && (
                      <Box
                        sx={{
                          p: 1,
                          mb: 1,
                          backgroundColor: isOwn ? 'primary.dark' : 'action.hover',
                          borderRadius: 1,
                          borderLeft: 3,
                          borderColor: isOwn ? 'primary.light' : 'primary.main',
                        }}
                      >
                        <Typography variant="caption" color="inherit">
                          Replying to {message.replyToMessage.sender.firstName}
                        </Typography>
                        <Typography variant="body2" color="inherit">
                          {message.replyToMessage.message.length > 50
                            ? `${message.replyToMessage.message.substring(0, 50)}...`
                            : message.replyToMessage.message
                          }
                        </Typography>
                      </Box>
                    )}
                    
                    <Typography variant="body2">
                      {message.message}
                    </Typography>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {formatMessageTime(message.timestamp)}
                        {message.isEdited && ' (edited)'}
                      </Typography>
                      
                      <IconButton
                        size="small"
                        sx={{ ml: 1, opacity: 0.7 }}
                        onClick={(e) => handleMessageMenu(e, message)}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Paper>
                </Box>
              </Box>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Reply Banner */}
      {replyToMessage && (
        <Box sx={{ p: 1, backgroundColor: 'action.hover', borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="caption" color="primary">
                Replying to {replyToMessage.sender.firstName}
              </Typography>
              <Typography variant="body2">
                {replyToMessage.message.length > 100
                  ? `${replyToMessage.message.substring(0, 100)}...`
                  : replyToMessage.message
                }
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setReplyToMessage(null)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* Message Input */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton>
            <AttachFileIcon />
          </IconButton>
          
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder={editingMessage ? 'Edit message...' : 'Type a message...'}
            value={messageText}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyPress={handleKeyPress}
            variant="outlined"
            size="small"
          />
          
          <IconButton 
            color="primary" 
            onClick={handleSendMessage}
            disabled={!messageText.trim() || sendMessageMutation.isPending || updateMessageMutation.isPending}
          >
            {sendMessageMutation.isPending || updateMessageMutation.isPending ? (
              <CircularProgress size={24} />
            ) : (
              <SendIcon />
            )}
          </IconButton>
        </Box>
        
        {editingMessage && (
          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Editing message
            </Typography>
            <Typography 
              variant="caption" 
              color="primary" 
              sx={{ cursor: 'pointer' }}
              onClick={() => {
                setEditingMessage(null);
                setMessageText('');
              }}
            >
              Cancel
            </Typography>
          </Box>
        )}
      </Box>

      {/* Message Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={() => setMenuAnchorEl(null)}
      >
        <MenuItem onClick={() => handleReplyToMessage(selectedMessage!)}>
          <ReplyIcon sx={{ mr: 1 }} fontSize="small" />
          Reply
        </MenuItem>
        {selectedMessage && canEditOrDelete(selectedMessage) && (
          <>
            <MenuItem onClick={handleEditMessage}>
              <EditIcon sx={{ mr: 1 }} fontSize="small" />
              Edit
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleDeleteMessage} sx={{ color: 'error.main' }}>
              <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
              Delete
            </MenuItem>
          </>
        )}
      </Menu>
    </Paper>
  );
};

export default ChatInterface;