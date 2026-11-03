import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { SocketEvents } from './events.js';
import { config } from '../../config/env.js';

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO on the HTTP server.
 * Call once from server/src/index.ts after createServer().
 */
export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOriginsList,
      credentials: true,
    },
    // Don't log in test env
    ...(config.NODE_ENV === 'test' ? { transports: ['websocket'] } : {}),
  });

  io.on('connection', (socket: Socket) => {
    if (config.NODE_ENV !== 'test') {
      console.log(`[Socket.IO] Client connected: ${socket.id}`);
    }

    // Rooms: clients subscribe to order or shop rooms for targeted updates
    socket.on(SocketEvents.JOIN_ORDER_ROOM, (orderId: string) => {
      socket.join(`order:${orderId}`);
    });

    socket.on(SocketEvents.LEAVE_ORDER_ROOM, (orderId: string) => {
      socket.leave(`order:${orderId}`);
    });

    socket.on(SocketEvents.JOIN_SHOP_ROOM, (shopId: string) => {
      socket.join(`shop:${shopId}`);
    });

    socket.on(SocketEvents.LEAVE_SHOP_ROOM, (shopId: string) => {
      socket.leave(`shop:${shopId}`);
    });

    socket.on('disconnect', () => {
      if (config.NODE_ENV !== 'test') {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
      }
    });
  });

  return io;
}

/**
 * Emit an order status change event to all subscribers of that order and its shop.
 * Call this from any order mutation handler.
 */
export function emitOrderStatusChanged(payload: {
  orderId: string;
  shopId: string;
  status: string;
  updatedAt: Date | string;
}): void {
  if (!io) return; // no-op in tests / before init

  const event = SocketEvents.ORDER_STATUS_CHANGED;
  io.to(`order:${payload.orderId}`).emit(event, payload);
  io.to(`shop:${payload.shopId}`).emit(event, payload);
}

/** Get the Socket.IO instance (null if not initialized yet) */
export function getIO(): SocketIOServer | null {
  return io;
}

