import { io, Socket } from 'socket.io-client';

interface MessageData {
  id: string;
  conversationId: string;
  senderId: string;
  message: string;
  messageType: 'text' | 'image' | 'file';
  attachments?: string[];
  replyToMessageId?: string;
  createdAt: string;
  isRead: boolean;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    profileImage?: string;
  };
}

interface ConversationData {
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
}

class SocketService {
  private socket: Socket | null = null;
  private baseURL = (() => {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) return window.location.origin;
    try { return new URL(apiUrl).origin; } catch { return window.location.origin; }
  })();
  private messageHandlers: Map<string, (data: MessageData) => void> = new Map();
  private conversationHandlers: Map<string, (data: ConversationData) => void> = new Map();
  private notificationHandlers: Map<string, (data: any) => void> = new Map();
  private connectionHandlers: Set<() => void> = new Set();
  private disconnectionHandlers: Set<() => void> = new Set();

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    // Tear down any existing-but-not-connected socket before creating a new one.
    // Without this, a re-connect while the previous socket is still connecting
    // leaves an orphaned socket joined to the user's room, so the server's single
    // emit is delivered more than once → duplicate live notifications.
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(this.baseURL, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.connectionHandlers.forEach(handler => handler());
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.disconnectionHandlers.forEach(handler => handler());
    });

    this.socket.on('message:new', (data: { message: MessageData; conversationId: string }) => {
      this.messageHandlers.forEach(handler => handler(data.message));
    });

    this.socket.on('message:updated', (data: { message: MessageData }) => {
      this.messageHandlers.forEach(handler => handler(data.message));
    });

    this.socket.on('message:deleted', (data: { messageId: string; conversationId: string }) => {
      this.messageHandlers.forEach(handler => {
        handler({
          id: data.messageId,
          conversationId: data.conversationId,
          senderId: '',
          message: '',
          messageType: 'text',
          createdAt: '',
          isRead: false,
        });
      });
    });

    this.socket.on('conversation:updated', (data: ConversationData) => {
      this.conversationHandlers.forEach(handler => handler(data));
    });

    this.socket.on('user:typing', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      // Handle typing indicators
      console.log('User typing:', data);
    });

    this.socket.on('notification:new', (data: any) => {
      this.notificationHandlers.forEach(handler => handler(data));
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }

  // Join a conversation room
  joinConversation(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('conversation:join', { conversationId });
    }
  }

  // Leave a conversation room
  leaveConversation(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('conversation:leave', { conversationId });
    }
  }

  // Send typing indicator
  sendTyping(conversationId: string, isTyping: boolean): void {
    if (this.socket?.connected) {
      this.socket.emit('user:typing', { conversationId, isTyping });
    }
  }

  // Event handlers
  onMessage(handler: (data: MessageData) => void): () => void {
    const id = Math.random().toString(36);
    this.messageHandlers.set(id, handler);
    return () => this.messageHandlers.delete(id);
  }

  onNotification(handler: (data: any) => void): () => void {
    const id = Math.random().toString(36);
    this.notificationHandlers.set(id, handler);
    return () => this.notificationHandlers.delete(id);
  }

  onConversationUpdate(handler: (data: ConversationData) => void): () => void {
    const id = Math.random().toString(36);
    this.conversationHandlers.set(id, handler);
    return () => this.conversationHandlers.delete(id);
  }

  onConnect(handler: () => void): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  onDisconnect(handler: () => void): () => void {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }
}

export const socketService = new SocketService();
export default socketService;