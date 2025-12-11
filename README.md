# Blinds Backend

A Node.js/Express backend API for a blinds e-commerce platform, built with TypeScript, Prisma, and PostgreSQL.

## Features

- 🚀 Express.js server with TypeScript
- 🗄️ Prisma ORM with PostgreSQL
- 🔒 Type-safe database queries
- 🛡️ Error handling middleware
- 📝 Request logging
- 🔄 Graceful shutdown
- 🏥 Health check endpoints

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/blinds_db?schema=public"
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

### 3. Database Setup

Generate Prisma Client:
```bash
npm run prisma:generate
```

Run migrations:
```bash
npm run prisma:migrate
```

(Optional) Open Prisma Studio to view your database:
```bash
npm run prisma:studio
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server (requires build first)
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio GUI

## Project Structure

```
src/
├── index.ts              # Main server entry point
├── app.ts                # Express app configuration
├── config/
│   ├── database.ts       # Prisma client setup
│   └── env.ts            # Environment variables
├── middleware/
│   ├── errorHandler.ts   # Error handling middleware
│   └── notFound.ts       # 404 handler
└── api/
    └── routes/
        └── index.ts      # API routes
```

## API Endpoints

### Health Check
- `GET /health` - Server health status
- `GET /api/health` - API health status

## Database Schema

The Prisma schema includes models for:
- Users & Authentication
- Products & Variants
- Categories & Product Types
- Shopping Cart
- Orders & Payments
- Reviews
- Sample Requests
- Blind Configurations

See `prisma/schema.prisma` for full schema details.

## Development

The server runs in development mode with:
- Hot reload on file changes
- Detailed error messages
- Query logging
- CORS enabled

## Production

1. Build the project:
   ```bash
   npm run build
   ```

2. Set `NODE_ENV=production` in your `.env` file

3. Start the server:
   ```bash
   npm start
   ```

## License

ISC
.
