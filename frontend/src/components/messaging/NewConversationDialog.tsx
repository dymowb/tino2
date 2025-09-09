import React, { useState } from 'react';
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
      toast.success('Conversation created successfully');
      onConversationCreated(data.id);
      handleClose();
    },
    onError: (error) => {
      toast.error('Failed to create conversation');
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
      toast.error('Please select at least one participant');
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
      <DialogTitle>Start New Conversation</DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <FormControl fullWidth margin="normal">
            <InputLabel>Conversation Type</InputLabel>
            <Select
              value={conversationType}
              onChange={(e) => setConversationType(e.target.value as any)}
              label="Conversation Type"
            >
              <MenuItem value="direct">Direct Message</MenuItem>
              <MenuItem value="group">Group Chat</MenuItem>
              <MenuItem value="support">Support</MenuItem>
            </Select>
          </FormControl>

          {conversationType !== 'direct' && (
            <>
              <TextField
                fullWidth
                margin="normal"
                label="Conversation Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a title for this conversation"
              />
              
              <TextField
                fullWidth
                margin="normal"
                label="Description (Optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the conversation"
                multiline
                rows={2}
              />
            </>
          )}

          <TextField
            fullWidth
            margin="normal"
            label="Search Users"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or email"
            InputProps={{
              endAdornment: <SearchIcon />,
            }}
          />
        </Box>

        {selectedUsers.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Selected Participants:
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
              {searchTerm ? 'No users found' : 'Start typing to search for users'}
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
              Conversation Context:
            </Typography>
            {metadata.serviceType && (
              <Chip label={`Service: ${metadata.serviceType}`} size="small" sx={{ mr: 1 }} />
            )}
            {metadata.bookingId && (
              <Chip label="Related to Booking" size="small" sx={{ mr: 1 }} />
            )}
            {metadata.quoteRequestId && (
              <Chip label="Related to Quote Request" size="small" />
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          Cancel
        </Button>
        <Button
          onClick={handleCreateConversation}
          variant="contained"
          disabled={selectedUsers.length === 0 || createConversationMutation.isPending}
        >
          {createConversationMutation.isPending ? (
            <CircularProgress size={20} />
          ) : (
            'Create Conversation'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewConversationDialog;