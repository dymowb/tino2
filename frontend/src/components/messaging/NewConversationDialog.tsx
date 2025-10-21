import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import apiService from '../../services/api';
import { toast } from 'react-hot-toast';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userType: 'customer' | 'provider';
  profileImage?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConversationCreated: (conversationId: string) => void;
  preselectedUsers?: string[];
  metadata?: {
    bookingId?: string;
    quoteRequestId?: string;
    serviceType?: string;
  };
}

const NewConversationDialog: React.FC<Props> = ({
  open,
  onClose,
  onConversationCreated,
  preselectedUsers = [],
  metadata,
}) => {
  const { t } = useTranslation('messages');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>(preselectedUsers);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [conversationType, setConversationType] = useState<'direct' | 'group' | 'support'>('direct');
  const [users, setUsers] = useState<User[]>([]);

  // Mock users query - replace with actual API call
  const { isLoading: usersLoading } = useQuery({
    queryKey: ['users', searchTerm],
    queryFn: async () => {
      // This would be replaced with actual user search API
      const mockUsers: User[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          userType: 'provider',
        },
        {
          id: '2',
          firstName: 'Sarah',
          lastName: 'Johnson',
          email: 'sarah@example.com',
          userType: 'customer',
        },
        {
          id: '3',
          firstName: 'Mike',
          lastName: 'Wilson',
          email: 'mike@example.com',
          userType: 'provider',
        },
      ];
      
      const filtered = mockUsers.filter(user =>
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      setUsers(filtered);
      return filtered;
    },
    enabled: open,
  });

  const createConversationMutation = useMutation({
    mutationFn: apiService.createConversation,
    onSuccess: (data) => {
      toast.success(t('new.success'));
      onConversationCreated(data.id);
      handleClose();
    },
    onError: (error) => {
      toast.error(t('new.error'));
      console.error('Create conversation error:', error);
    },
  });

  const handleClose = () => {
    setSearchTerm('');
    setSelectedUsers(preselectedUsers);
    setTitle('');
    setDescription('');
    setConversationType('direct');
    onClose();
  };

  const handleUserToggle = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreateConversation = () => {
    if (selectedUsers.length === 0) {
      toast.error(t('new.select_participant'));
      return;
    }

    const conversationData = {
      participantIds: selectedUsers,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      type: conversationType,
      metadata,
    };

    createConversationMutation.mutate(conversationData);
  };

  const getSelectedUserNames = () => {
    const selectedUserObjects = users.filter(user => selectedUsers.includes(user.id));
    return selectedUserObjects.map(user => `${user.firstName} ${user.lastName}`).join(', ');
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('new.title')}</DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <FormControl fullWidth margin="normal">
            <InputLabel>{t('new.conversation_type')}</InputLabel>
            <Select
              value={conversationType}
              onChange={(e) => setConversationType(e.target.value as any)}
              label={t('new.conversation_type')}
            >
              <MenuItem value="direct">{t('new.direct_message')}</MenuItem>
              <MenuItem value="group">{t('new.group_chat')}</MenuItem>
              <MenuItem value="support">{t('new.support')}</MenuItem>
            </Select>
          </FormControl>

          {conversationType !== 'direct' && (
            <>
              <TextField
                fullWidth
                margin="normal"
                label={t('new.conversation_title')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('new.title_placeholder')}
              />

              <TextField
                fullWidth
                margin="normal"
                label={t('new.description')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('new.description_placeholder')}
                multiline
                rows={2}
              />
            </>
          )}

          <TextField
            fullWidth
            margin="normal"
            label={t('new.search_users_label')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('new.search_placeholder')}
            InputProps={{
              endAdornment: <SearchIcon />,
            }}
          />
        </Box>

        {selectedUsers.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('new.selected_participants')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {getSelectedUserNames().split(', ').map((name, index) => (
                <Chip
                  key={index}
                  label={name}
                  onDelete={() => {
                    const userToRemove = users.find(user =>
                      `${user.firstName} ${user.lastName}` === name
                    );
                    if (userToRemove) {
                      handleUserToggle(userToRemove.id);
                    }
                  }}
                  size="small"
                />
              ))}
            </Box>
          </Box>
        )}

        <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
          {usersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress />
            </Box>
          ) : users.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
              {searchTerm ? t('new.no_users_found') : t('new.start_typing')}
            </Typography>
          ) : (
            <List>
              {users.map((user) => (
                <ListItem key={user.id}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleUserToggle(user.id)}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                        <ListItemAvatar sx={{ minWidth: 48 }}>
                          <Avatar src={user.profileImage}>
                            {user.firstName[0]}{user.lastName[0]}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={`${user.firstName} ${user.lastName}`}
                          secondary={
                            <Box>
                              <Typography variant="body2" color="text.secondary">
                                {user.email}
                              </Typography>
                              <Chip 
                                label={user.userType} 
                                size="small" 
                                variant="outlined"
                                sx={{ mt: 0.5 }}
                              />
                            </Box>
                          }
                        />
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        {metadata && (
          <Box sx={{ mt: 2, p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('new.context_title')}
            </Typography>
            {metadata.serviceType && (
              <Chip label={t('new.service_label', { service: metadata.serviceType })} size="small" sx={{ mr: 1 }} />
            )}
            {metadata.bookingId && (
              <Chip label={t('new.related_booking')} size="small" sx={{ mr: 1 }} />
            )}
            {metadata.quoteRequestId && (
              <Chip label={t('new.related_quote')} size="small" />
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          {t('actions.cancel')}
        </Button>
        <Button
          onClick={handleCreateConversation}
          variant="contained"
          disabled={selectedUsers.length === 0 || createConversationMutation.isPending}
        >
          {createConversationMutation.isPending ? (
            <CircularProgress size={20} />
          ) : (
            t('new.create')
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewConversationDialog;