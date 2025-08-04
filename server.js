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
const fs = require('fs');

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

// Persistent storage with JSON files
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load data from files
const loadUsers = () => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const usersArray = JSON.parse(data);
      const usersMap = new Map();
      usersArray.forEach(user => {
        usersMap.set(user.id, user);
      });
      return usersMap;
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return new Map();
};

const saveUsers = (users) => {
  try {
    const usersArray = Array.from(users.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersArray, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
};

const loadMessages = () => {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
      const messagesObj = JSON.parse(data);
      const messagesMap = new Map();
      Object.keys(messagesObj).forEach(key => {
        messagesMap.set(key, messagesObj[key]);
      });
      return messagesMap;
    }
  } catch (error) {
    console.error('Error loading messages:', error);
  }
  return new Map();
};

const saveMessages = (messages) => {
  try {
    const messagesObj = {};
    messages.forEach((value, key) => {
      messagesObj[key] = value;
    });
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesObj, null, 2));
  } catch (error) {
    console.error('Error saving messages:', error);
  }
};

// Initialize storage
const users = loadUsers();
const messages = loadMessages();
const rooms = new Map();
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
    
    // Check if user already exists
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const userId = uuidv4();
    const user = {
      id: userId,
      username,
      email,
      password: hashedPassword,
      avatar: avatar || '/images/default-avatar.png',
      status: 'offline',
      lastSeen: new Date(),
      createdAt: new Date()
    };
    
    users.set(userId, user);
    saveUsers(users);
    
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
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for email:', email);
    console.log('Total users in system:', users.size);
    
    // Find user by email
    const user = Array.from(users.values()).find(u => u.email === email);
    console.log('User found:', !!user);
    
    if (!user) {
      console.log('User not found for email:', email);
      return res.status(400).json({ error: 'No such ID, please register first' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch);
    
    if (!isMatch) {
      console.log('Invalid password for user:', email);
      return res.status(400).json({ error: 'Invalid password' });
    }

    console.log('Login successful for user:', user.username);
    
    // Update user status to online
    user.status = 'online';
    user.lastSeen = new Date();
    users.set(user.id, user);
    saveUsers(users);

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
    console.error('Login error:', error);
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

// Edit message endpoint
app.put('/api/messages/:messageId', authenticateToken, (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    
    // Find the message in all rooms
    let messageFound = false;
    for (const [roomId, roomMessages] of messages) {
      const message = roomMessages.find(m => m.id === messageId);
      if (message && message.senderId === req.user.userId) {
        message.content = content;
        message.edited = true;
        message.editedAt = new Date();
        messageFound = true;
        saveMessages(messages);
        break;
      }
    }
    
    if (messageFound) {
      res.json({ success: true, message: 'Message updated successfully' });
    } else {
      res.status(404).json({ error: 'Message not found or unauthorized' });
    }
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete message endpoint
app.delete('/api/messages/:messageId', authenticateToken, (req, res) => {
  try {
    const { messageId } = req.params;
    
    // Find and remove the message from all rooms
    let messageFound = false;
    for (const [roomId, roomMessages] of messages) {
      const messageIndex = roomMessages.findIndex(m => m.id === messageId);
      if (messageIndex !== -1 && roomMessages[messageIndex].senderId === req.user.userId) {
        roomMessages.splice(messageIndex, 1);
        messageFound = true;
        saveMessages(messages);
        break;
      }
    }
    
    if (messageFound) {
      res.json({ success: true, message: 'Message deleted successfully' });
    } else {
      res.status(404).json({ error: 'Message not found or unauthorized' });
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Track unread messages for each user
const unreadMessages = new Map(); // userId -> Map<senderId, count>

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
        saveUsers(users);
      }
      
      onlineUsers.set(decoded.userId, socket.id);
      socket.join(decoded.userId);
      
      socket.broadcast.emit('user-status-change', {
        userId: decoded.userId,
        status: 'online'
      });
      
      // Send unread counts to the user
      if (unreadMessages.has(decoded.userId)) {
        const userUnread = unreadMessages.get(decoded.userId);
        const unreadData = {};
        userUnread.forEach((count, senderId) => {
          unreadData[senderId] = count;
        });
        socket.emit('unread-counts', unreadData);
      }
      
      socket.emit('authenticated', { userId: decoded.userId });
    } catch (error) {
      socket.emit('authentication-error', 'Invalid token');
    }
  });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.username} joined room: ${roomId}`);
    
    // Send existing messages for this room
    if (messages.has(roomId)) {
      const roomMessages = messages.get(roomId);
      socket.emit('load-messages', roomMessages);
    }
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
      audio: data.audio,
      duration: data.duration,
      timestamp: new Date(),
      status: 'sent',
      replyTo: data.replyTo || null
    };

    if (!messages.has(data.roomId)) {
      messages.set(data.roomId, []);
    }
    messages.get(data.roomId).push(message);
    saveMessages(messages);

    // Track unread message for receiver
    if (data.receiverId && data.receiverId !== socket.userId) {
      if (!unreadMessages.has(data.receiverId)) {
        unreadMessages.set(data.receiverId, new Map());
      }
      const userUnread = unreadMessages.get(data.receiverId);
      const currentCount = userUnread.get(socket.userId) || 0;
      userUnread.set(socket.userId, currentCount + 1);
      
      // Send unread count update to receiver if online
      if (onlineUsers.has(data.receiverId)) {
        io.to(onlineUsers.get(data.receiverId)).emit('unread-count-update', {
          senderId: socket.userId,
          count: currentCount + 1
        });
      }
    }

    // Emit to all users in the room (this will reach both sender and receiver)
    io.to(data.roomId).emit('new-message', message);
    
    // Update message status if receiver is online
    if (data.receiverId && onlineUsers.has(data.receiverId)) {
      message.status = 'delivered';
      saveMessages(messages);
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
        saveMessages(messages);
        io.to(roomId).emit('message-status-update', {
          messageId: messageId,
          status: 'read'
        });
      }
    }
  });

  // Mark messages as read when user joins a room
  socket.on('mark-messages-read', (data) => {
    const { senderId } = data;
    
    // Clear unread count for this sender
    if (unreadMessages.has(socket.userId)) {
      const userUnread = unreadMessages.get(socket.userId);
      if (userUnread.has(senderId)) {
        userUnread.delete(senderId);
        
        // Update all messages from this sender to 'read' status
        const roomId = [socket.userId, senderId].sort().join('-');
        if (messages.has(roomId)) {
          const roomMessages = messages.get(roomId);
          roomMessages.forEach(message => {
            if (message.senderId === senderId && message.status !== 'read') {
              message.status = 'read';
            }
          });
          saveMessages(messages);
          
          // Notify all users in the room about status updates
          io.to(roomId).emit('message-status-update', {
            messageId: 'all',
            status: 'read',
            senderId: senderId
          });
        }
        
        // Notify sender that their messages have been read
        if (onlineUsers.has(senderId)) {
          io.to(onlineUsers.get(senderId)).emit('messages-read-by', {
            readerId: socket.userId,
            readerName: socket.username
          });
        }
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

  // Handle message editing
  socket.on('messageEdited', (data) => {
    const { messageId, newContent, roomId } = data;
    
    // Find and update the message
    if (messages.has(roomId)) {
      const roomMessages = messages.get(roomId);
      const message = roomMessages.find(m => m.id === messageId);
      if (message && message.senderId === socket.userId) {
        message.content = newContent;
        message.edited = true;
        message.editedAt = new Date();
        saveMessages(messages);
        
        // Notify all users in the room
        io.to(roomId).emit('messageEdited', { messageId, newContent });
      }
    }
  });

  // Handle message deletion
  socket.on('messageDeleted', (data) => {
    const { messageId, roomId } = data;
    
    // Find and remove the message
    if (messages.has(roomId)) {
      const roomMessages = messages.get(roomId);
      const messageIndex = roomMessages.findIndex(m => m.id === messageId);
      if (messageIndex !== -1 && roomMessages[messageIndex].senderId === socket.userId) {
        roomMessages.splice(messageIndex, 1);
        saveMessages(messages);
        
        // Notify all users in the room
        io.to(roomId).emit('messageDeleted', { messageId });
      }
    }
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

  // Handle call end
  socket.on('call-end', (data) => {
    const { to, from } = data;
    if (onlineUsers.has(to)) {
      io.to(onlineUsers.get(to)).emit('call-end', { from });
    }
  });

  // Handle call reject
  socket.on('call-reject', (data) => {
    const { to, from } = data;
    if (onlineUsers.has(to)) {
      io.to(onlineUsers.get(to)).emit('call-reject', { from });
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
        saveUsers(users);
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
  console.log(`Users loaded: ${users.size}`);
  console.log(`Messages loaded: ${messages.size}`);
});