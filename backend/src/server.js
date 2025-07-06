const app = require('./app');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { initializeDatabases } = require('./config/database-dev');

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join room for private messaging
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Handle private messages
  socket.on('private-message', (data) => {
    socket.to(data.roomId).emit('private-message', data);
  });

  // Handle location updates for service providers
  socket.on('location-update', (data) => {
    socket.broadcast.emit('provider-location-update', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  
  // Initialize database connections
  await initializeDatabases();
  
  // Seed development data
  if (process.env.NODE_ENV !== 'production') {
    const { seedData } = require('./utils/seedData');
    await seedData();
  }
});