import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';
import { initializeProductCache } from './config/shopifyProductCache.js';

const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Initialize Shopify product cache (handle → priceBandName)
    try {
      await initializeProductCache();
      console.log('✅ Shopify product cache initialized');
    } catch (err) {
      console.warn('⚠️  Shopify product cache failed to initialize (will retry on first request):', (err as Error).message);
    }

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Server running on port ${env.PORT}`);
      console.log(`📝 Environment: ${env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${env.PORT}/health`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('HTTP server closed');
        
        await prisma.$disconnect();
        console.log('Database disconnected');
        
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

startServer();

