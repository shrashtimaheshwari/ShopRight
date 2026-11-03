import { createServer } from 'http';
import { app } from './app.js';
import { config } from './config/env.js';
import { initSocketIO } from './modules/realtime/index.js';

const httpServer = createServer(app);

// Attach Socket.IO for real-time order status events (Milestone 6)
initSocketIO(httpServer);

httpServer.listen(config.PORT, () => {
  console.log(`🚀 ShopRight API server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
  console.log(`📡 Healthcheck available at http://localhost:${config.PORT}/api/v1/health`);
  console.log(`🔌 Socket.IO attached for real-time events`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
