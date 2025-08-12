const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let io;

const setupSocketIO = (server) => {
  io = socketIo(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-frontend-domain.com'] 
        : ['http://localhost:3000', 'http://localhost:3001'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('Authentication error: Token not provided'));
      }

      const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.user = decoded;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User ${socket.userId} connected to socket`);

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Handle user joining game rooms
    socket.on('join_game', (gameId) => {
      socket.join(`game_${gameId}`);
      logger.info(`User ${socket.userId} joined game ${gameId}`);
    });

    // Handle user leaving game rooms
    socket.on('leave_game', (gameId) => {
      socket.leave(`game_${gameId}`);
      logger.info(`User ${socket.userId} left game ${gameId}`);
    });

    // Handle challenge completion notifications
    socket.on('challenge_completed', (data) => {
      socket.broadcast.to(`user_${socket.userId}`).emit('challenge_completed', data);
    });

    // Handle reward earned notifications
    socket.on('reward_earned', (data) => {
      socket.broadcast.to(`user_${socket.userId}`).emit('reward_earned', data);
    });

    // Handle wallet transaction notifications
    socket.on('wallet_transaction', (data) => {
      socket.broadcast.to(`user_${socket.userId}`).emit('wallet_transaction', data);
    });

    // Handle receipt scan notifications
    socket.on('receipt_scanned', (data) => {
      socket.broadcast.to(`user_${socket.userId}`).emit('receipt_scanned', data);
    });

    // Handle VIP upgrade notifications
    socket.on('vip_upgraded', (data) => {
      socket.broadcast.to(`user_${socket.userId}`).emit('vip_upgraded', data);
    });

    socket.on('disconnect', () => {
      logger.info(`User ${socket.userId} disconnected from socket`);
    });
  });

  return io;
};

// Helper functions for sending notifications
const sendNotification = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

const sendGameNotification = (gameId, event, data) => {
  if (io) {
    io.to(`game_${gameId}`).emit(event, data);
  }
};

const sendBroadcastNotification = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

module.exports = {
  setupSocketIO,
  sendNotification,
  sendGameNotification,
  sendBroadcastNotification,
}; 