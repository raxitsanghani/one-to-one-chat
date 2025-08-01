const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|mp4|mp3|wav/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// In-memory storage
const users = new Map();
const rooms = new Map();
const messages = new Map();
const onlineUsers = new Map();

const JWT_SECRET = 'your-secret-key-change-in-production';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body;
    
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const userId = uuidv4();
    const user = {
      id: userId,
      username,
      email,
      password: hashedPassword,
      avatar: avatar || '/images/default-avatar.png',
      status: 'online',
      lastSeen: new Date(),
      createdAt: new Date()
    };
    
    users.set(userId, user);
    
    const token = jwt.sign({ userId, username, email }, JWT_SECRET);
    
    res.json({ 
      token, 
      user: { 
        id: userId, 
        username, 
        email, 
        avatar: user.avatar,
        status: user.status 
      } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username, email }, JWT_SECRET);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        email, 
        avatar: user.avatar,
        status: user.status 
      } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify token endpoint
app.post('/api/verify-token', authenticateToken, (req, res) => {
  const user = users.get(req.user.userId);
  if (user) {
    res.json({ 
      user: { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        avatar: user.avatar,
        status: user.status 
      } 
    });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// Get user contacts
app.get('/api/contacts', authenticateToken, (req, res) => {
  const contacts = Array.from(users.values())
    .filter(user => user.id !== req.user.userId)
    .map(user => ({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      status: user.status,
      lastSeen: user.lastSeen
    }));
  
  res.json(contacts);
});

// File upload endpoint
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    url: `/uploads/${req.file.filename}`
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      
      if (users.has(decoded.userId)) {
        const user = users.get(decoded.userId);
        user.status = 'online';
        user.lastSeen = new Date();
        users.set(decoded.userId, user);
      }
      
      onlineUsers.set(decoded.userId, socket.id);
      socket.join(decoded.userId);
      
      socket.broadcast.emit('user-status-change', {
        userId: decoded.userId,
        status: 'online'
      });
      
      socket.emit('authenticated', { userId: decoded.userId });
    } catch (error) {
      socket.emit('authentication-error', 'Invalid token');
    }
  });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.username} joined room: ${roomId}`);
  });

  socket.on('send-message', (data) => {
    const messageId = uuidv4();
    const message = {
      id: messageId,
      senderId: socket.userId,
      senderName: socket.username,
      receiverId: data.receiverId,
      roomId: data.roomId,
      content: data.content,
      type: data.type || 'text',
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      timestamp: new Date(),
      status: 'sent',
      replyTo: data.replyTo || null
    };

    if (!messages.has(data.roomId)) {
      messages.set(data.roomId, []);
    }
    messages.get(data.roomId).push(message);

    io.to(data.roomId).emit('new-message', message);
    
    if (data.receiverId && onlineUsers.has(data.receiverId)) {
      message.status = 'delivered';
      io.to(data.roomId).emit('message-status-update', {
        messageId: messageId,
        status: 'delivered'
      });
    }
  });

  socket.on('message-read', (data) => {
    const { messageId, roomId } = data;
    const roomMessages = messages.get(roomId);
    
    if (roomMessages) {
      const message = roomMessages.find(m => m.id === messageId);
      if (message) {
        message.status = 'read';
        io.to(roomId).emit('message-status-update', {
          messageId: messageId,
          status: 'read'
        });
      }
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.roomId).emit('user-typing', {
      userId: socket.userId,
      username: socket.username,
      isTyping: data.isTyping
    });
  });

  // --- WebRTC Signaling Events ---
  // Relay call offer
  socket.on('call-offer', (data) => {
    const { to, offer, from, isVideo } = data;
    if (onlineUsers.has(to)) {
      io.to(onlineUsers.get(to)).emit('call-offer', { from, offer, isVideo });
    }
  });

  // Relay call answer
  socket.on('call-answer', (data) => {
    const { to, answer, from } = data;
    if (onlineUsers.has(to)) {
      io.to(onlineUsers.get(to)).emit('call-answer', { from, answer });
    }
  });

  // Relay ICE candidates
  socket.on('ice-candidate', (data) => {
    const { to, candidate, from } = data;
    if (onlineUsers.has(to)) {
      io.to(onlineUsers.get(to)).emit('ice-candidate', { from, candidate });
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      
      if (users.has(socket.userId)) {
        const user = users.get(socket.userId);
        user.status = 'offline';
        user.lastSeen = new Date();
        users.set(socket.userId, user);
      }
      
      socket.broadcast.emit('user-status-change', {
        userId: socket.userId,
        status: 'offline'
      });
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
