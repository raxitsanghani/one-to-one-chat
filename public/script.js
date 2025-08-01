// WhatsApp Clone - Real-time Chat Application
class ChatApp {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentChat = null;
        this.token = localStorage.getItem('token');
        this.contacts = [];
        this.messages = new Map();
        this.init();
    }

    init() {
        this.setupEventListeners();
        // Always show auth modal for fresh login (no auto-login)
        this.showAuthModal();
    }

    setupEventListeners() {
        // Auth form
        document.getElementById('authForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAuth();
        });

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
        const isLogin = document.getElementById('authTitle').textContent.includes('Login');
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const username = document.getElementById('username').value;

        const endpoint = isLogin ? '/api/login' : '/api/register';
        const data = isLogin ? { email, password } : { username, email, password };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                this.token = result.token;
                this.currentUser = result.user;
                localStorage.setItem('token', this.token);
                this.hideAuthModal();
                this.initializeSocket();
                this.loadContacts();
                this.updateUserInfo();
            } else {
                alert(result.error || 'Authentication failed');
            }
        } catch (error) {
            console.error('Auth error:', error);
            alert('Network error. Please try again.');
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
        div.onclick = () => this.selectContact(contact);
        
        div.innerHTML = `
            <img src="${contact.avatar}" alt="${contact.username}" class="avatar">
            <div class="contact-info">
                <div class="contact-name">${contact.username}</div>
                <div class="contact-last-message">Click to start chatting</div>
            </div>
        `;
        
        return div;
    }

    selectContact(contact) {
        this.currentChat = contact;
        this.updateChatHeader(contact);
        this.clearMessages();
        this.loadMessages(contact.id);
        
        // Join room for this chat
        const roomId = this.generateRoomId(this.currentUser.id, contact.id);
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
    }

    generateRoomId(userId1, userId2) {
        return [userId1, userId2].sort().join('-');
    }

    updateChatHeader(contact) {
        document.getElementById('chatUserName').textContent = contact.username;
        document.getElementById('chatUserStatus').textContent = contact.status === 'online' ? 'Online' : 'Offline';
        document.getElementById('chatAvatar').src = contact.avatar;
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const content = input.value.trim();
        
        if (!content || !this.currentChat) return;
        
        const roomId = this.generateRoomId(this.currentUser.id, this.currentChat.id);
        
        const messageData = {
            content: content,
            receiverId: this.currentChat.id,
            roomId: roomId,
            type: 'text'
        };
        
        this.socket.emit('send-message', messageData);
        input.value = '';
    }

    handleNewMessage(message) {
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
        const roomId = message.roomId;
        if (!this.messages.has(roomId)) {
            this.messages.set(roomId, []);
        }
        this.messages.get(roomId).push(message);
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        const isSent = message.senderId === this.currentUser.id;
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        div.innerHTML = `
            <div class="message-bubble">
                ${message.content}
                <div class="message-time">${time}</div>
            </div>
        `;
        
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
            // Find the contact and update status (you'd need to match by ID in a real app)
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
            alert('Voice recording not supported in this browser.');
            return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.sendVoiceMessage(audioBlob);
            };
            this.mediaRecorder.start();
            this.isRecording = true;
            this.showRecordingIndicator();
        }).catch(() => {
            alert('Microphone access denied.');
        });
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.hideRecordingIndicator();
        }
    }

    showRecordingIndicator() {
        let indicator = document.getElementById('recordingIndicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'recordingIndicator';
            indicator.textContent = 'Recording... Click mic again to stop.';
            indicator.style.position = 'fixed';
            indicator.style.bottom = '120px';
            indicator.style.left = '50%';
            indicator.style.transform = 'translateX(-50%)';
            indicator.style.background = '#d32f2f';
            indicator.style.color = '#fff';
            indicator.style.padding = '10px 20px';
            indicator.style.borderRadius = '8px';
            indicator.style.zIndex = 3000;
            document.body.appendChild(indicator);
        } else {
            indicator.style.display = 'block';
        }
    }
    hideRecordingIndicator() {
        const indicator = document.getElementById('recordingIndicator');
        if (indicator) indicator.style.display = 'none';
    }
    sendVoiceMessage(audioBlob) {
        if (!this.currentChat) return;
        const roomId = this.generateRoomId(this.currentUser.id, this.currentChat.id);
        const reader = new FileReader();
        reader.onload = () => {
            const base64Audio = reader.result;
            const messageData = {
                content: '',
                receiverId: this.currentChat.id,
                roomId: roomId,
                type: 'audio',
                audio: base64Audio
            };
            this.socket.emit('send-message', messageData);
        };
        reader.readAsDataURL(audioBlob);
    }

    // --- VOICE/VIDEO CALL ---
    initiateVoiceCall() {
        this.startCall(false);
    }
    initiateVideoCall() {
        this.startCall(true);
    }
    startCall(isVideo) {
        if (!navigator.mediaDevices || !window.RTCPeerConnection) {
            alert('WebRTC not supported in this browser.');
            return;
        }
        if (!this.currentChat) {
            alert('Select a chat to start a call.');
            return;
        }
        // Minimal peer-to-peer setup (no signaling server, demo only)
        alert('This is a demo: Real call requires signaling server. UI overlay will show.');
        this.showCallOverlay(isVideo);
    }
    showCallOverlay(isVideo) {
        let overlay = document.getElementById('callOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'callOverlay';
            overlay.style.position = 'fixed';
            overlay.style.top = 0;
            overlay.style.left = 0;
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = 'rgba(0,0,0,0.85)';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.zIndex = 4000;
            const video = document.createElement('video');
            video.autoplay = true;
            video.muted = true;
            video.style.width = '320px';
            video.style.height = '240px';
            video.style.background = '#222';
            video.style.borderRadius = '12px';
            video.style.marginBottom = '20px';
            overlay.appendChild(video);
            const text = document.createElement('div');
            text.textContent = isVideo ? 'Video Call (Demo)' : 'Voice Call (Demo)';
            text.style.color = '#fff';
            text.style.fontSize = '22px';
            text.style.marginBottom = '20px';
            overlay.appendChild(text);
            const endBtn = document.createElement('button');
            endBtn.textContent = 'End Call';
            endBtn.style.padding = '10px 30px';
            endBtn.style.fontSize = '18px';
            endBtn.style.background = '#d32f2f';
            endBtn.style.color = '#fff';
            endBtn.style.border = 'none';
            endBtn.style.borderRadius = '8px';
            endBtn.style.cursor = 'pointer';
            endBtn.onclick = () => {
                if (video.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }
                overlay.remove();
            };
            overlay.appendChild(endBtn);
            document.body.appendChild(overlay);
            // Get user media
            navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo }).then(stream => {
                video.srcObject = stream;
            });
        } else {
            overlay.style.display = 'flex';
        }
    }
}

// Initialize the app
const app = new ChatApp();