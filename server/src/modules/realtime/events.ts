/**
 * Typed Socket.IO event names (Design Doc §6, Milestone 6)
 * All events follow the format: <domain>:<action>
 */
export const SocketEvents = {
  // Server → Client
  ORDER_STATUS_CHANGED: 'order:status_changed',
  ORDER_ASSIGNED: 'order:assigned',

  // Client → Server (room management)
  JOIN_ORDER_ROOM: 'join:order',
  JOIN_SHOP_ROOM: 'join:shop',
  LEAVE_ORDER_ROOM: 'leave:order',
  LEAVE_SHOP_ROOM: 'leave:shop',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

