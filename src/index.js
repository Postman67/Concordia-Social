'use strict';
require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const migrate = require('./db/migrate');
const { setupSocket } = require('./socket/index');
const usersRouter = require('./routes/users');
const friendsRouter = require('./routes/friends');
const conversationsRouter = require('./routes/conversations');
const messagesRouter = require('./routes/messages');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.use('/api/users', usersRouter);
app.use('/api/friends', friendsRouter(io));
app.use('/api/conversations', conversationsRouter);
app.use('/api/messages', messagesRouter(io));

setupSocket(io);

const PORT = process.env.PORT || 3001;

migrate()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Concordia-Social running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database migration failed:', err.message);
    process.exit(1);
  });
