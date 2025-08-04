// WhatsApp Clone - Real-time Chat Application
class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentChat = null;
        this.token = localStorage.getItem('token');
        this.contacts = [];
        this.messages = new Map();
        
        // Unread message tracking
        this.unreadCounts = new Map(); // senderId -> count
        
        // Call-related properties
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.currentCall = null;
        this.callTimer = null;
        this.callDuration = 0;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        
        // Clear any existing auth data to ensure fresh login
        this.clearAuthData();
        
        // Always show auth modal for fresh login (no auto-login)
        this.showAuthModal();
    }

    setupEventListeners() {
        // Auth form
        document.getElementById('authForm').addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Form submitted!');
            this.handleAuth();
        });

        // Direct login button click handler
        const authSubmitBtn = document.getElementById('authSubmit');
        if (authSubmitBtn) {
            authSubmitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Login button clicked!');
                this.handleAuth();
            });
        } else {
            console.error('Login button not found!');
        }

        // Auth switch
        document.getElementById('authSwitchLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthMode();
        });

        // Message input
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            } else {
                this.handleTyping();
            }
        });

        // Send button
        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        // File attachment
        document.getElementById('attachBtn').addEventListener('click', () => {
            this.showFileModal();
        });

        // File upload
        document.getElementById('uploadFileBtn').addEventListener('click', () => {
            this.uploadFile();
        });

        // Close file modal
        document.getElementById('closeFileModal').addEventListener('click', () => {
            this.hideFileModal();
        });

        // Search contacts
        document.getElementById('searchContacts').addEventListener('input', (e) => {
            this.searchContacts(e.target.value);
        });

        // Emoji button
        document.getElementById('emojiBtn').addEventListener('click', () => {
            this.toggleEmojiPicker();
        });

        // Voice button
        document.getElementById('voiceBtn').addEventListener('click', () => {
            this.toggleVoiceRecording();
        });

        // Voice and video call buttons
        document.getElementById('voiceCallBtn').addEventListener('click', () => {
            this.initiateVoiceCall();
        });

        document.getElementById('videoCallBtn').addEventListener('click', () => {
            this.initiateVideoCall();
        });

        // Logout functionality
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }

        // Password visibility toggle
        const passwordToggle = document.getElementById('passwordToggle');
        if (passwordToggle) {
            passwordToggle.addEventListener('click', () => {
                this.togglePasswordVisibility();
            });
        }

        // Close message options menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.message-options')) {
                const openMenus = document.querySelectorAll('.message-options-menu.show');
                openMenus.forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
    }

    showAuthModal() {
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('chatApp').style.display = 'none';
    }

    hideAuthModal() {
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('chatApp').style.display = 'flex';
    }

    toggleAuthMode() {
        const isLogin = document.getElementById('authTitle').textContent.includes('Login');
        
        if (isLogin) {
            // Switch to register
            document.getElementById('authTitle').textContent = 'Register';
            document.getElementById('authSubmit').textContent = 'Register';
            document.getElementById('authSwitchText').textContent = 'Already have an account?';
            document.getElementById('authSwitchLink').textContent = 'Login';
            document.getElementById('usernameGroup').style.display = 'block';
        } else {
            // Switch to login
            document.getElementById('authTitle').textContent = 'Login';
            document.getElementById('authSubmit').textContent = 'Login';
            document.getElementById('authSwitchText').textContent = 'Don\'t have an account?';
            document.getElementById('authSwitchLink').textContent = 'Register';
            document.getElementById('usernameGroup').style.display = 'none';
        }
    }

    async handleAuth() {
        console.log('handleAuth function called!');
        
        const isLogin = document.getElementById('authTitle').textContent.includes('Login');
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const username = document.getElementById('username').value.trim();

        console.log('Login attempt:', { isLogin, email, hasPassword: !!password });

        // Validate inputs
        if (!email || !password) {
            this.showNotification('Please fill in all required fields.', 'error');
            return;
        }

        const endpoint = isLogin ? '/api/login' : '/api/register';
        const data = isLogin ? { email, password } : { username, email, password };

        try {
            console.log('Sending request to:', endpoint, 'with data:', { email, hasPassword: !!password });
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            console.log('Response status:', response.status);
            const result = await response.json();
            console.log('Response result:', result);

            if (response.ok) {
                console.log('Login successful!');
                this.token = result.token;
                this.currentUser = result.user;
                localStorage.setItem('token', this.token);
                this.hideAuthModal();
                this.initializeSocket();
                this.loadContacts();
                this.updateUserInfo();
                
                // Show success notification
                this.showNotification('ID login successfully', 'success');
            } else {
                console.log('Login failed:', result.error);
                // If registration failed because user exists, switch to login mode and pre-fill
                if (!isLogin && result.error && result.error.toLowerCase().includes('already exists')) {
                    // Switch to login mode
                    this.toggleAuthMode();
                    // Pre-fill email and password
                    document.getElementById('email').value = email;
                    document.getElementById('password').value = password;
                    this.showNotification('ID already exists. Please login.', 'error');
                } else {
                    this.showNotification(result.error || 'Authentication failed', 'error');
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            this.showNotification('Network error. Please try again.', 'error');
        }
    }

    async authenticateUser() {
        try {
            // Verify token with a simple endpoint first
            const response = await fetch('/api/verify-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                this.currentUser = userData.user;
                this.hideAuthModal();
                this.initializeSocket();
                this.loadContacts();
                this.updateUserInfo();
            } else {
                localStorage.removeItem('token');
                this.token = null;
                this.showAuthModal();
            }
        } catch (error) {
            console.error('Auth error:', error);
            localStorage.removeItem('token');
            this.token = null;
            this.showAuthModal();
        }
    }

    initializeSocket() {
        this.socket = io();
        this.socket.emit('authenticate', this.token);
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('authenticated', (data) => {
            console.log('Authenticated:', data);
        });

        this.socket.on('new-message', (message) => {
            this.handleNewMessage(message);
        });

        this.socket.on('user-typing', (data) => {
            this.showTypingIndicator(data);
        });

        this.socket.on('user-status-change', (data) => {
            this.updateUserStatus(data);
        });

        // Call-related socket events
        this.socket.on('call-offer', (data) => {
            this.handleIncomingCall(data);
        });

        this.socket.on('call-answer', (data) => {
            this.handleCallAnswer(data);
        });

        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data);
        });

        this.socket.on('call-end', (data) => {
            this.showNotification('Call ended', 'info');
            this.cleanupCall();
            this.hideCallUI();
        });

        this.socket.on('call-reject', (data) => {
            this.showNotification('Call rejected', 'info');
            this.cleanupCall();
            this.hideCallUI();
        });

        this.socket.on('load-messages', (messages) => {
            console.log('Loading existing messages:', messages.length);
            messages.forEach(message => {
                this.handleNewMessage(message);
            });
        });

        // Unread message events
        this.socket.on('unread-counts', (unreadData) => {
            console.log('Received unread counts:', unreadData);
            Object.keys(unreadData).forEach(senderId => {
                this.unreadCounts.set(senderId, unreadData[senderId]);
            });
            this.updateUnreadCounts();
        });

        this.socket.on('unread-count-update', (data) => {
            console.log('Unread count update:', data);
            this.unreadCounts.set(data.senderId, data.count);
            this.updateUnreadCounts();
        });

        this.socket.on('messages-read-by', (data) => {
            console.log('Messages read by:', data);
            this.showNotification(`${data.readerName} read your messages`, 'info');
        });

        this.socket.on('message-status-update', (data) => {
            this.updateMessageStatus(data.messageId, data.status, data.senderId);
        });

        // Message editing and deletion events
        this.socket.on('messageDeleted', (data) => {
            this.handleMessageDeleted(data.messageId);
        });

        this.socket.on('messageEdited', (data) => {
            this.handleMessageEdited(data.messageId, data.newContent);
        });
    }

    async loadContacts() {
        try {
            const response = await fetch('/api/contacts', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                this.contacts = await response.json();
                this.renderContacts();
            }
        } catch (error) {
            console.error('Error loading contacts:', error);
        }
    }

    renderContacts() {
        const contactsList = document.getElementById('contactsList');
        contactsList.innerHTML = '';
        
        this.contacts.forEach(contact => {
            const contactElement = this.createContactElement(contact);
            contactsList.appendChild(contactElement);
        });
    }

    createContactElement(contact) {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.setAttribute('data-contact-id', contact.id);
        div.onclick = () => this.selectContact(contact);
        
        const statusClass = contact.status === 'online' ? 'online' : 'offline';
        const statusText = contact.status === 'online' ? 'online' : 'offline';
        const unreadCount = this.unreadCounts.get(contact.id) || 0;
        
        div.innerHTML = `
            <img src="${contact.avatar}" alt="${contact.username}" class="avatar">
            <div class="contact-info">
                <div class="contact-name">${contact.username}</div>
                <div class="contact-status ${statusClass}">${statusText}</div>
            </div>
            ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
        `;
        
        return div;
    }

    selectContact(contact) {
        this.currentChat = contact;
        this.updateChatHeader(contact);
        this.clearMessages();
        
        // Join room for this chat
        const roomId = this.generateRoomId(this.currentUser.id, contact.id);
        console.log('Joining room:', roomId, 'for chat with:', contact.username);
        this.socket.emit('join-room', roomId);
        
        // Update active contact
        document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Find the clicked contact item and mark as active
        const contactItems = document.querySelectorAll('.contact-item');
        contactItems.forEach(item => {
            const contactName = item.querySelector('.contact-name').textContent;
            if (contactName === contact.username) {
                item.classList.add('active');
            }
        });
        
        // Hide welcome message and show chat interface
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        // Load messages and mark as read when they become visible
        this.loadMessages(contact.id);
    }

    generateRoomId(userId1, userId2) {
        return [userId1, userId2].sort().join('-');
    }

    updateChatHeader(contact) {
        document.getElementById('chatUserName').textContent = contact.username;
        const statusElement = document.getElementById('chatUserStatus');
        statusElement.textContent = contact.status === 'online' ? 'Online' : 'Offline';
        statusElement.className = contact.status === 'online' ? 'online' : 'offline';
        document.getElementById('chatAvatar').src = contact.avatar;
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (!content || !this.currentChat) return;
        
        const roomId = this.generateRoomId(this.currentUser.id, this.currentChat.id);
        
        // Handle editing existing message
        if (this.editingMessage) {
            this.editExistingMessage(this.editingMessage, content);
            this.editingMessage = null;
            input.placeholder = 'Type a message';
            return;
        }
        
        const messageData = {
            content: content,
            receiverId: this.currentChat.id,
            roomId: roomId,
            type: 'text',
            replyTo: this.replyingTo || null
        };
        
        console.log('Sending message:', messageData);
        this.socket.emit('send-message', messageData);
        input.value = '';
        
        // Clear reply mode
        if (this.replyingTo) {
            this.replyingTo = null;
            input.placeholder = 'Type a message';
        }
    }

    handleNewMessage(message) {
        console.log('Handling new message:', message);
        
        // Check if message already exists to prevent duplicates
        const roomId = message.roomId;
        if (!this.messages.has(roomId)) {
            this.messages.set(roomId, []);
        }
        
        // Check if this message already exists
        const existingMessage = this.messages.get(roomId).find(m => m.id === message.id);
        if (existingMessage) {
            console.log('Message already exists, skipping:', message.id);
            return;
        }
        
        // Hide welcome message if it's still showing
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Store message locally
        this.messages.get(roomId).push(message);
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        const isSent = message.senderId === this.currentUser.id;
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        
        // Convert to 12-hour format with AM/PM
        const time = new Date(message.timestamp).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        let messageContent = '';
        
        if (message.type === 'audio') {
            const duration = message.duration || 0;
            const minutes = Math.floor(duration / 60);
            const seconds = duration % 60;
            const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            messageContent = `
                <div class="voice-message-bubble">
                    <div class="voice-message-content">
                        <button class="voice-play-btn" onclick="app.playVoiceMessage('${message.id}')">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="voice-message-info">
                            <div class="voice-message-duration">${durationText}</div>
                            <div class="voice-message-waveform">
                                <div class="waveform-bar"></div>
                                <div class="waveform-bar"></div>
                                <div class="waveform-bar"></div>
                                <div class="waveform-bar"></div>
                                <div class="waveform-bar"></div>
                                <div class="waveform-bar"></div>
                                <div class="waveform-bar"></div>
                                <div class="waveform-bar"></div>
                            </div>
                        </div>
                    </div>
                    <div class="message-time">${time}</div>
                    ${message.edited ? '<div class="message-edited">edited</div>' : ''}
                    <div class="message-options">
                        <button class="message-options-btn" onclick="app.toggleMessageOptions('${message.id}')">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="message-options-menu" id="options-${message.id}">
                            <button class="message-option" onclick="app.replyToMessage('${message.id}')">
                                <i class="fas fa-reply"></i> Reply
                            </button>
                            ${isSent ? `
                                <button class="message-option" onclick="app.editMessage('${message.id}')">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button class="message-option" onclick="app.deleteMessage('${message.id}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        } else {
            const status = message.status || 'sent';
            let statusText, statusClass;
            
            if (isSent) {
                if (status === 'sent') {
                    statusText = '✓';
                    statusClass = 'sent';
                } else if (status === 'delivered') {
                    statusText = '✓✓';
                    statusClass = 'delivered';
                } else if (status === 'read') {
                    statusText = '✓✓';
                    statusClass = 'read';
                } else {
                    statusText = '✓';
                    statusClass = 'sent';
                }
            }
            
            messageContent = `
                <div class="message-bubble">
                    ${message.content}
                    <div class="message-time">${time}</div>
                    ${isSent ? `<div class="message-status ${statusClass}">${statusText}</div>` : ''}
                    ${message.edited ? '<div class="message-edited">edited</div>' : ''}
                    <div class="message-options">
                        <button class="message-options-btn" onclick="app.toggleMessageOptions('${message.id}')">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="message-options-menu" id="options-${message.id}">
                            <button class="message-option" onclick="app.replyToMessage('${message.id}')">
                                <i class="fas fa-reply"></i> Reply
                            </button>
                            ${isSent ? `
                                <button class="message-option" onclick="app.editMessage('${message.id}')">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button class="message-option" onclick="app.deleteMessage('${message.id}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        div.innerHTML = messageContent;
        div.setAttribute('data-message-id', message.id);
        
        // Store audio data for playback
        if (message.type === 'audio' && message.audio) {
            div.setAttribute('data-audio', message.audio);
            console.log('Audio message created with ID:', message.id, 'Duration:', message.duration);
        }
        
        return div;
    }

    updateUserInfo() {
        if (this.currentUser) {
            document.getElementById('userName').textContent = this.currentUser.username;
            document.getElementById('userAvatar').src = this.currentUser.avatar;
        }
    }

    showFileModal() {
        document.getElementById('fileModal').style.display = 'flex';
    }

    hideFileModal() {
        document.getElementById('fileModal').style.display = 'none';
    }

    handleTyping() {
        if (this.currentChat) {
            const roomId = this.generateRoomId(this.currentUser.id, this.currentChat.id);
            this.socket.emit('typing', { roomId: roomId, isTyping: true });
        }
    }

    clearMessages() {
        const messagesContainer = document.getElementById('messagesContainer');
        // Remove all messages but keep the welcome message
        const messages = messagesContainer.querySelectorAll('.message');
        messages.forEach(message => message.remove());
    }

    loadMessages(contactId) {
        const roomId = this.generateRoomId(this.currentUser.id, contactId);
        if (this.messages.has(roomId)) {
            const roomMessages = this.messages.get(roomId);
            roomMessages.forEach(message => {
                const messageElement = this.createMessageElement(message);
                document.getElementById('messagesContainer').appendChild(messageElement);
            });
            
            // Mark messages as read when they become visible
            this.markMessagesAsRead(contactId);
        }
    }

    showTypingIndicator(data) {
        if (data.isTyping && this.currentChat && data.userId !== this.currentUser.id) {
            const indicator = document.getElementById('typingIndicator');
            indicator.style.display = 'block';
            indicator.innerHTML = `<span>${data.username} is typing...</span>`;
            
            // Hide after 3 seconds
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 3000);
        }
    }

    updateUserStatus(data) {
        // Update contact status in the sidebar
        const contactItems = document.querySelectorAll('.contact-item');
        contactItems.forEach(item => {
            const contactName = item.querySelector('.contact-name').textContent;
            const statusElement = item.querySelector('.contact-status');
            
            // Find the contact by name and update status
            const contact = this.contacts.find(c => c.username === contactName);
            if (contact && contact.id === data.userId) {
                contact.status = data.status;
                if (statusElement) {
                    statusElement.className = `contact-status ${data.status}`;
                    statusElement.textContent = data.status;
                }
            }
        });
    }

    searchContacts(query) {
        const contactItems = document.querySelectorAll('.contact-item');
        contactItems.forEach(item => {
            const contactName = item.querySelector('.contact-name').textContent.toLowerCase();
            if (contactName.includes(query.toLowerCase())) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    async uploadFile() {
        const fileInput = document.getElementById('fileInput');
        const files = fileInput.files;
        
        if (files.length === 0) {
            alert('Please select a file to upload');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', files[0]);
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });
            
            if (response.ok) {
                const fileData = await response.json();
                
                // Send file message
                const roomId = this.generateRoomId(this.currentUser.id, this.currentChat.id);
                const messageData = {
                    content: fileData.originalName,
                    receiverId: this.currentChat.id,
                    roomId: roomId,
                    type: 'file',
                    fileName: fileData.originalName,
                    fileUrl: fileData.url
                };
                
                this.socket.emit('send-message', messageData);
                this.hideFileModal();
                fileInput.value = '';
            } else {
                alert('File upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('File upload failed');
        }
    }

    // --- EMOJI PICKER ---
    toggleEmojiPicker() {
        let picker = document.getElementById('emojiPicker');
        if (!picker) {
            picker = document.createElement('div');
            picker.id = 'emojiPicker';
            picker.style.position = 'absolute';
            picker.style.bottom = '70px';
            picker.style.left = '60px';
            picker.style.background = '#2a3942';
            picker.style.border = '1px solid #3b4a54';
            picker.style.borderRadius = '8px';
            picker.style.padding = '10px';
            picker.style.zIndex = 2000;
            picker.style.display = 'flex';
            picker.style.flexWrap = 'wrap';
            picker.style.width = '240px';
            const emojis = ['😀','😂','😍','😎','😭','😡','👍','🙏','🎉','❤️','🔥','🥳','😅','😇','😜','🤔','😱','😏','😬','😴','🤩','😢','😤','😆','😋','😐','😑','😒','😓','😔','😕','😖','😘','😚','😙','😗','😽','😺','😸','😹','😻','😼','😽','🙀','😿','😾'];
            emojis.forEach(e => {
                const btn = document.createElement('button');
                btn.textContent = e;
                btn.style.fontSize = '22px';
                btn.style.margin = '2px';
                btn.style.background = 'none';
                btn.style.border = 'none';
                btn.style.cursor = 'pointer';
                btn.onclick = () => {
                    document.getElementById('messageInput').value += e;
                    picker.style.display = 'none';
                };
                picker.appendChild(btn);
            });
            document.body.appendChild(picker);
        } else {
            picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
        }
    }

    // --- VOICE MESSAGE ---
    toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopVoiceRecording();
        } else {
            this.startVoiceRecording();
        }
    }

    startVoiceRecording() {
        if (!navigator.mediaDevices || !window.MediaRecorder) {
            this.showNotification('Voice recording not supported in this browser.', 'error');
            return;
        }
        
        if (!this.currentChat) {
            this.showNotification('Select a chat to send voice message.', 'error');
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            this.recordingStartTime = Date.now();
            
            this.mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };
            
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.sendVoiceMessage(audioBlob);
            };
            
            this.mediaRecorder.start();
            this.isRecording = true;
            this.showVoiceRecordingUI();
        }).catch(() => {
            this.showNotification('Microphone access denied.', 'error');
        });
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.hideVoiceRecordingUI();
            
            // Stop all tracks
            if (this.mediaRecorder.stream) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
        }
    }

    showVoiceRecordingUI() {
        let recordingUI = document.getElementById('voiceRecordingUI');
        if (!recordingUI) {
            recordingUI = document.createElement('div');
            recordingUI.id = 'voiceRecordingUI';
            recordingUI.className = 'voice-recording-ui';
            document.body.appendChild(recordingUI);
        }

        recordingUI.innerHTML = `
            <div class="voice-recording-container">
                <div class="recording-header">
                    <i class="fas fa-microphone recording-icon"></i>
                    <span class="recording-text">Recording voice message...</span>
                </div>
                <div class="recording-timer" id="recordingTimer">00:00</div>
                <div class="recording-controls">
                    <button class="recording-btn cancel-btn" id="cancelRecording">
                        <i class="fas fa-times"></i>
                    </button>
                    <button class="recording-btn send-btn" id="sendRecording">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        recordingUI.querySelector('#cancelRecording').addEventListener('click', () => {
            this.cancelVoiceRecording();
        });
        
        recordingUI.querySelector('#sendRecording').addEventListener('click', () => {
            this.stopVoiceRecording();
        });

        recordingUI.style.display = 'flex';
        this.startRecordingTimer();
    }

    hideVoiceRecordingUI() {
        const recordingUI = document.getElementById('voiceRecordingUI');
        if (recordingUI) {
            recordingUI.style.display = 'none';
        }
        this.stopRecordingTimer();
    }

    cancelVoiceRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.hideVoiceRecordingUI();
            
            // Stop all tracks
            if (this.mediaRecorder.stream) {
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
        }
    }

    startRecordingTimer() {
        this.recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timerElement = document.getElementById('recordingTimer');
            if (timerElement) {
                timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }
    
    sendVoiceMessage(audioBlob) {
        if (!this.currentChat) return;
        const roomId = this.generateRoomId(this.currentUser.id, this.currentChat.id);
        const reader = new FileReader();
        reader.onload = () => {
            const base64Audio = reader.result;
            const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const messageData = {
                content: '',
                receiverId: this.currentChat.id,
                roomId: roomId,
                type: 'audio',
                audio: base64Audio,
                duration: duration
            };
            console.log('Sending voice message with duration:', duration);
            this.socket.emit('send-message', messageData);
        };
        reader.readAsDataURL(audioBlob);
    }

    // --- CALL SYSTEM ---
    async initiateVoiceCall() {
        if (!this.currentChat) {
            this.showNotification('Select a chat to start a call', 'error');
            return;
        }
        await this.startCall(false);
    }

    async initiateVideoCall() {
        if (!this.currentChat) {
            this.showNotification('Select a chat to start a call', 'error');
            return;
        }
        await this.startCall(true);
    }

    async startCall(isVideo) {
        try {
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: isVideo
            });

            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // Add local stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                this.updateCallUI();
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        to: this.currentChat.id,
                        candidate: event.candidate,
                        from: this.currentUser.id
                    });
                }
            };

            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.currentCall = {
                type: isVideo ? 'video' : 'voice',
                with: this.currentChat,
                isInitiator: true,
                status: 'calling'
            };

            this.socket.emit('call-offer', {
                to: this.currentChat.id,
                offer: offer,
                from: this.currentUser.id,
                isVideo: isVideo
            });

            this.showCallUI();
            this.startCallTimer();

        } catch (error) {
            console.error('Error starting call:', error);
            this.showNotification('Failed to start call. Please check your camera/microphone permissions.', 'error');
        }
    }

    handleIncomingCall(data) {
        this.currentCall = {
            type: data.isVideo ? 'video' : 'voice',
            with: this.contacts.find(c => c.id === data.from),
            isInitiator: false,
            status: 'incoming',
            offer: data.offer
        };

        this.showIncomingCallUI();
    }

    async acceptCall() {
        try {
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: this.currentCall.type === 'video'
            });

            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // Add local stream to peer connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                this.remoteStream = event.streams[0];
                this.updateCallUI();
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        to: this.currentCall.with.id,
                        candidate: event.candidate,
                        from: this.currentUser.id
                    });
                }
            };

            // Set remote description and create answer
            await this.peerConnection.setRemoteDescription(this.currentCall.offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // Send answer
            this.socket.emit('call-answer', {
                to: this.currentCall.with.id,
                answer: answer,
                from: this.currentUser.id
            });

            this.currentCall.status = 'connected';
            this.showCallUI();
            this.startCallTimer();

        } catch (error) {
            console.error('Error accepting call:', error);
            this.showNotification('Failed to accept call', 'error');
            this.endCall();
        }
    }

    async handleCallAnswer(data) {
        if (this.peerConnection && this.currentCall) {
            await this.peerConnection.setRemoteDescription(data.answer);
            this.currentCall.status = 'connected';
            this.updateCallUI();
        }
    }

    async handleIceCandidate(data) {
        if (this.peerConnection) {
            await this.peerConnection.addIceCandidate(data.candidate);
        }
    }

    endCall() {
        if (this.currentCall) {
            this.socket.emit('call-end', {
                to: this.currentCall.with.id,
                from: this.currentUser.id
            });
        }

        this.cleanupCall();
        this.hideCallUI();
    }

    rejectCall() {
        if (this.currentCall) {
            this.socket.emit('call-reject', {
                to: this.currentCall.with.id,
                from: this.currentUser.id
            });
        }

        this.currentCall = null;
        this.hideCallUI();
    }

    cleanupCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.remoteStream = null;
        this.currentCall = null;
        this.stopCallTimer();
    }

    startCallTimer() {
        this.callDuration = 0;
        this.callTimer = setInterval(() => {
            this.callDuration++;
            this.updateCallTimer();
        }, 1000);
    }

    stopCallTimer() {
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
    }

    updateCallTimer() {
        const timerElement = document.getElementById('callTimer');
        if (timerElement) {
            const minutes = Math.floor(this.callDuration / 60);
            const seconds = this.callDuration % 60;
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    showCallUI() {
        let callUI = document.getElementById('callUI');
        if (!callUI) {
            callUI = this.createCallUI();
            document.body.appendChild(callUI);
        }

        callUI.style.display = 'flex';
        this.updateCallUI();
    }

    showIncomingCallUI() {
        let incomingCallUI = document.getElementById('incomingCallUI');
        if (!incomingCallUI) {
            incomingCallUI = this.createIncomingCallUI();
            document.body.appendChild(incomingCallUI);
        }

        incomingCallUI.style.display = 'flex';
    }

    hideCallUI() {
        const callUI = document.getElementById('callUI');
        const incomingCallUI = document.getElementById('incomingCallUI');
        
        if (callUI) callUI.style.display = 'none';
        if (incomingCallUI) incomingCallUI.style.display = 'none';
    }

    updateCallUI() {
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        const callType = document.getElementById('callType');
        const callStatus = document.getElementById('callStatus');

        if (localVideo && this.localStream) {
            localVideo.srcObject = this.localStream;
        }

        if (remoteVideo && this.remoteStream) {
            remoteVideo.srcObject = this.remoteStream;
        }

        if (callType) {
            callType.textContent = this.currentCall.type === 'video' ? 'Video Call' : 'Voice Call';
        }

        if (callStatus) {
            callStatus.textContent = this.currentCall.status === 'connected' ? 'Connected' : 'Connecting...';
        }
    }

    createCallUI() {
        const callUI = document.createElement('div');
        callUI.id = 'callUI';
        callUI.className = 'call-ui';
        
        callUI.innerHTML = `
            <div class="call-container">
                <div class="call-header">
                    <div class="call-info">
                        <h3 id="callType">${this.currentCall.type === 'video' ? 'Video Call' : 'Voice Call'}</h3>
                        <p id="callStatus">Connecting...</p>
                        <p id="callTimer">00:00</p>
                    </div>
                </div>
                
                <div class="call-video-container">
                    <video id="remoteVideo" autoplay playsinline class="remote-video"></video>
                    <video id="localVideo" autoplay playsinline muted class="local-video"></video>
                </div>
                
                <div class="call-controls">
                    <button class="call-btn mute-btn" id="muteBtn">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <button class="call-btn camera-btn" id="cameraBtn" style="display: ${this.currentCall.type === 'video' ? 'block' : 'none'}">
                        <i class="fas fa-video"></i>
                    </button>
                    <button class="call-btn end-call-btn" id="endCallBtn">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        callUI.querySelector('#endCallBtn').addEventListener('click', () => this.endCall());
        callUI.querySelector('#muteBtn').addEventListener('click', () => this.toggleMute());
        callUI.querySelector('#cameraBtn').addEventListener('click', () => this.toggleCamera());

        return callUI;
    }

    createIncomingCallUI() {
        const incomingCallUI = document.createElement('div');
        incomingCallUI.id = 'incomingCallUI';
        incomingCallUI.className = 'incoming-call-ui';
        
        incomingCallUI.innerHTML = `
            <div class="incoming-call-container">
                <div class="caller-info">
                    <img src="${this.currentCall.with.avatar}" alt="${this.currentCall.with.username}" class="caller-avatar">
                    <h3>${this.currentCall.with.username}</h3>
                    <p>${this.currentCall.type === 'video' ? 'Incoming video call' : 'Incoming voice call'}</p>
                </div>
                
                <div class="incoming-call-controls">
                    <button class="call-btn accept-btn" id="acceptCallBtn">
                        <i class="fas fa-phone"></i>
                    </button>
                    <button class="call-btn reject-btn" id="rejectCallBtn">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        incomingCallUI.querySelector('#acceptCallBtn').addEventListener('click', () => this.acceptCall());
        incomingCallUI.querySelector('#rejectCallBtn').addEventListener('click', () => this.rejectCall());

        return incomingCallUI;
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const muteBtn = document.getElementById('muteBtn');
                if (muteBtn) {
                    muteBtn.classList.toggle('active');
                }
            }
        }
    }

    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const cameraBtn = document.getElementById('cameraBtn');
                if (cameraBtn) {
                    cameraBtn.classList.toggle('active');
                }
            }
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    updateUnreadCounts() {
        this.contacts.forEach(contact => {
            const contactElement = document.querySelector(`[data-contact-id="${contact.id}"]`);
            if (contactElement) {
                const unreadCount = this.unreadCounts.get(contact.id) || 0;
                let unreadBadge = contactElement.querySelector('.unread-badge');
                
                if (unreadCount > 0) {
                    if (!unreadBadge) {
                        unreadBadge = document.createElement('div');
                        unreadBadge.className = 'unread-badge';
                        contactElement.appendChild(unreadBadge);
                    }
                    unreadBadge.textContent = unreadCount;
                } else if (unreadBadge) {
                    unreadBadge.remove();
                }
            }
        });
    }

    updateMessageStatus(messageId, status, senderId = null) {
        if (messageId === 'all' && senderId) {
            // Update all messages from this sender
            const messageElements = document.querySelectorAll('.message');
            messageElements.forEach(element => {
                const isSent = element.classList.contains('sent');
                if (isSent) {
                    const statusElement = element.querySelector('.message-status');
                    if (statusElement) {
                        statusElement.textContent = '✓✓';
                        statusElement.className = 'message-status read';
                    }
                }
            });
        } else {
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                const statusElement = messageElement.querySelector('.message-status');
                if (statusElement) {
                    if (status === 'sent') {
                        statusElement.textContent = '✓';
                        statusElement.className = 'message-status sent';
                    } else if (status === 'delivered') {
                        statusElement.textContent = '✓✓';
                        statusElement.className = 'message-status delivered';
                    } else if (status === 'read') {
                        statusElement.textContent = '✓✓';
                        statusElement.className = 'message-status read';
                    }
                }
            }
        }
    }

    markMessagesAsRead(contactId) {
        if (this.unreadCounts.has(contactId)) {
            this.unreadCounts.delete(contactId);
            this.updateUnreadCounts();
            
            // Notify server that messages have been read
            this.socket.emit('mark-messages-read', { senderId: contactId });
        }
    }

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('password');
        const passwordToggle = document.getElementById('passwordToggle');
        const icon = passwordToggle.querySelector('i');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
            passwordToggle.classList.add('active');
        } else {
            passwordInput.type = 'password';
            icon.className = 'fas fa-eye';
            passwordToggle.classList.remove('active');
        }
    }

    playVoiceMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) {
            console.error('Message element not found for ID:', messageId);
            return;
        }
        
        const audioData = messageElement.getAttribute('data-audio');
        if (!audioData) {
            console.error('No audio data found for message:', messageId);
            return;
        }
        
        // Create audio element
        const audio = new Audio(audioData);
        const playBtn = messageElement.querySelector('.voice-play-btn i');
        
        if (!playBtn) {
            console.error('Play button not found');
            return;
        }
        
        // Update button to show playing state
        playBtn.className = 'fas fa-pause';
        
        audio.addEventListener('ended', () => {
            playBtn.className = 'fas fa-play';
        });
        
        audio.addEventListener('error', (error) => {
            console.error('Audio playback error:', error);
            playBtn.className = 'fas fa-play';
            this.showNotification('Error playing voice message', 'error');
        });
        
        // Play the audio
        audio.play().catch(error => {
            console.error('Error playing audio:', error);
            playBtn.className = 'fas fa-play';
            this.showNotification('Error playing voice message', 'error');
        });
    }

    logout() {
        // Clear token and user data
        localStorage.removeItem('token');
        this.token = null;
        this.currentUser = null;
        
        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        // Clear UI
        this.clearMessages();
        this.contacts = [];
        this.renderContacts();
        
        // Show auth modal
        this.showAuthModal();
        
        this.showNotification('Logged out successfully', 'info');
    }

    clearAuthData() {
        // Clear all authentication data
        localStorage.removeItem('token');
        this.token = null;
        this.currentUser = null;
        
        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // Message options functionality
    toggleMessageOptions(messageId) {
        // Close all other open menus first
        const allMenus = document.querySelectorAll('.message-options-menu.show');
        allMenus.forEach(menu => {
            if (menu.id !== `options-${messageId}`) {
                menu.classList.remove('show');
            }
        });

        const menu = document.getElementById(`options-${messageId}`);
        if (menu) {
            menu.classList.toggle('show');
        }
    }

    replyToMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const messageBubble = messageElement.querySelector('.message-bubble');
        if (!messageBubble) return;

        // Extract only the text content, excluding time, status, and edited indicators
        let messageContent = '';
        const textNodes = messageBubble.childNodes;
        for (const node of textNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                messageContent += node.textContent;
            }
        }
        messageContent = messageContent.trim();

        const messageInput = document.getElementById('messageInput');
        
        // Add reply indicator
        messageInput.placeholder = `Reply to: ${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}`;
        messageInput.focus();
        
        // Store the message being replied to
        this.replyingTo = messageId;
        
        // Close the menu
        this.toggleMessageOptions(messageId);
        
        this.showNotification('Reply mode activated', 'info');
    }

    editMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const messageBubble = messageElement.querySelector('.message-bubble');
        if (!messageBubble) return;

        // Extract only the text content, excluding time, status, and edited indicators
        let messageContent = '';
        const textNodes = messageBubble.childNodes;
        for (const node of textNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                messageContent += node.textContent;
            }
        }
        messageContent = messageContent.trim();

        const messageInput = document.getElementById('messageInput');
        
        // Set the input value to the current message content
        messageInput.value = messageContent;
        messageInput.focus();
        
        // Store the message being edited
        this.editingMessage = messageId;
        
        // Close the menu
        this.toggleMessageOptions(messageId);
        
        this.showNotification('Edit mode activated', 'info');
    }

    async deleteMessage(messageId) {
        if (!this.currentChat) return;

        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                // Remove message from UI
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.remove();
                }

                // Show delete notification
                this.showDeleteNotification();
                
                // Emit delete event to other users
                const roomId = this.generateRoomId(this.currentUser.id, this.currentChat.id);
                this.socket.emit('messageDeleted', { messageId, roomId });
                
                // Close the menu
                this.toggleMessageOptions(messageId);
            } else {
                this.showNotification('Failed to delete message', 'error');
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            this.showNotification('Error deleting message', 'error');
        }
    }

    showDeleteNotification() {
        const notification = document.createElement('div');
        notification.className = 'delete-notification';
        notification.textContent = 'Message deleted';
        document.body.appendChild(notification);

        // Remove after 2 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 2000);
    }

    // Handle message deletion from other users
    handleMessageDeleted(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
            this.showDeleteNotification();
        }
    }

    // Handle message editing from other users
    handleMessageEdited(messageId, newContent) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const contentElement = messageElement.querySelector('.message-bubble');
            if (contentElement) {
                // Update the content while preserving time and status
                const timeElement = contentElement.querySelector('.message-time');
                const statusElement = contentElement.querySelector('.message-status');
                const editedElement = contentElement.querySelector('.message-edited');
                
                contentElement.innerHTML = newContent;
                
                // Restore time and status
                if (timeElement) contentElement.appendChild(timeElement);
                if (statusElement) contentElement.appendChild(statusElement);
                if (editedElement) contentElement.appendChild(editedElement);
                
                // Add edited indicator if not present
                if (!editedElement) {
                    const newEditedElement = document.createElement('div');
                    newEditedElement.className = 'message-edited';
                    newEditedElement.textContent = 'edited';
                    contentElement.appendChild(newEditedElement);
                }
            }
        }
    }

    async editExistingMessage(messageId, newContent) {
        if (!this.currentChat) return;

        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: newContent })
            });

            if (response.ok) {
                // Update message in UI
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    const contentElement = messageElement.querySelector('.message-bubble');
                    if (contentElement) {
                        // Update the content while preserving time and status
                        const timeElement = contentElement.querySelector('.message-time');
                        const statusElement = contentElement.querySelector('.message-status');
                        const optionsElement = contentElement.querySelector('.message-options');
                        
                        contentElement.innerHTML = newContent;
                        
                        // Restore time, status, and options
                        if (timeElement) contentElement.appendChild(timeElement);
                        if (statusElement) contentElement.appendChild(statusElement);
                        if (optionsElement) contentElement.appendChild(optionsElement);
                        
                        // Add edited indicator
                        const editedElement = document.createElement('div');
                        editedElement.className = 'message-edited';
                        editedElement.textContent = 'edited';
                        contentElement.appendChild(editedElement);
                    }
                }

                // Emit edit event to other users
                const roomId = this.generateRoomId(this.currentUser.id, this.currentChat.id);
                this.socket.emit('messageEdited', { messageId, newContent, roomId });
                
                this.showNotification('Message edited successfully', 'success');
            } else {
                this.showNotification('Failed to edit message', 'error');
            }
        } catch (error) {
            console.error('Error editing message:', error);
            this.showNotification('Error editing message', 'error');
        }
    }
}

// Initialize the app
const app = new ChatApp();