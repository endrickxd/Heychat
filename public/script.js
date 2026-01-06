document.addEventListener('DOMContentLoaded', () => {
    let socket = null;
    let spamCooldown = false;
    let mimeType = 'audio/webm';
    let replyingTo = null; 

    try { if (typeof io !== 'undefined') socket = io(); } catch (e) { console.error(e); }

    const dom = {
        screens: {
            onboarding: document.getElementById('onboarding'),
            login: document.getElementById('login'),
            chat: document.getElementById('chat')
        },
        inputs: {
            nick: document.getElementById('nickname-input'),
            msg: document.getElementById('message-input'),
            file: document.getElementById('file-input')
        },
        btns: {
            start: document.getElementById('btn-start'),
            join: document.getElementById('btn-join'),
            back: document.getElementById('btn-back-home'),
            send: document.getElementById('send-btn'),
            mic: document.getElementById('mic-btn'),
            emoji: document.getElementById('emoji-btn'),
            attach: document.getElementById('attach-btn'),
            settings: document.getElementById('btn-settings'),
            closeSettings: document.getElementById('close-settings'),
            leave: document.getElementById('btn-leave'),
            recSend: document.getElementById('btn-send-rec'),
            recCancel: document.getElementById('btn-cancel-rec'),
            themeDark: document.getElementById('theme-dark'),
            themeLight: document.getElementById('theme-light')
        },
        chat: {
            window: document.getElementById('chat-window'),
            online: document.getElementById('online-count'),
            settingsPanel: document.getElementById('settings-panel'),
            typing: document.getElementById('typing-indicator'),
            roomTrigger: document.getElementById('room-info-trigger'),
            roomModal: document.getElementById('room-modal'),
            closeModal: document.getElementById('close-modal'),
            modalOnline: document.getElementById('modal-online'),
            normalUI: document.getElementById('normal-ui'),
            recUI: document.getElementById('recording-ui'),
            recTimer: document.getElementById('rec-timer'),
            replyBar: document.getElementById('reply-bar'),
            replyText: document.getElementById('reply-text'),
            closeReply: document.getElementById('close-reply')
        },
        audio: document.getElementById('msg-sound'),
        toastContainer: document.getElementById('toast-container'),
        avatars: document.querySelectorAll('.avatar-option')
    };

    let state = { 
        nickname: '', 
        color: localStorage.getItem('chatColor') || '#007AFF', 
        avatar: 'ph-user',
        theme: localStorage.getItem('chatTheme') || 'dark'
    };

    if (document.documentElement) {
        document.documentElement.style.setProperty('--msg-me', state.color);
        updateColorActiveState(state.color);
        applyTheme(state.theme);
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = msg;
        dom.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        state.theme = theme;
        localStorage.setItem('chatTheme', theme);
        if(dom.btns.themeDark) {
            dom.btns.themeDark.classList.toggle('active', theme === 'dark');
            dom.btns.themeLight.classList.toggle('active', theme === 'light');
        }
    }

    function navigate(to) {
        Object.values(dom.screens).forEach(s => {
            if (s) {
                s.classList.remove('active');
                s.classList.add('hidden');
                s.style.display = 'none';
            }
        });
        const target = dom.screens[to];
        if (target) {
            target.style.display = 'flex';
            target.classList.remove('hidden');
            setTimeout(() => target.classList.add('active'), 10);
        }
        if (to === 'chat' && typeof gsap !== 'undefined') {
            gsap.from('.glass-header', { y: -50, opacity: 0, duration: 0.6, delay: 0.2 });
            gsap.from('.input-area-wrapper', { y: 50, opacity: 0, duration: 0.6, delay: 0.3 });
        }
    }

    if (dom.btns.start) dom.btns.start.onclick = (e) => { e.preventDefault(); navigate('login'); };
    if (dom.btns.back) dom.btns.back.onclick = () => navigate('onboarding');

    dom.avatars.forEach(av => {
        av.addEventListener('click', () => {
            dom.avatars.forEach(a => a.classList.remove('active'));
            av.classList.add('active');
            state.avatar = av.dataset.icon;
        });
    });

    if (dom.inputs.nick) dom.inputs.nick.addEventListener('input', (e) => { if (dom.btns.join) dom.btns.join.disabled = e.target.value.trim().length < 3; });
    if (dom.btns.join) dom.btns.join.addEventListener('click', () => {
        state.nickname = dom.inputs.nick.value.trim();
        if (socket) socket.emit('join', { nickname: state.nickname, color: state.color, avatar: state.avatar });
        navigate('chat');
    });

    if (dom.inputs.msg) {
        dom.inputs.msg.addEventListener('input', (e) => {
            const hasText = e.target.value.trim().length > 0;
            if (hasText) {
                if (dom.btns.send) dom.btns.send.classList.remove('hidden');
                if (dom.btns.mic) dom.btns.mic.classList.add('hidden');
                if (socket) socket.emit('typing', true);
            } else {
                if (dom.btns.send) dom.btns.send.classList.add('hidden');
                if (dom.btns.mic) dom.btns.mic.classList.remove('hidden');
            }
        });
        dom.inputs.msg.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });
    }
    if (dom.btns.send) dom.btns.send.addEventListener('click', sendMessage);
    window.initReply = function(id, text) {
        replyingTo = { id, text };
        dom.chat.replyText.innerText = `Respondiendo a: ${text.substring(0, 30)}...`;
        dom.chat.replyBar.classList.remove('hidden');
        dom.inputs.msg.focus();
    };
    
    if(dom.chat.closeReply) {
        dom.chat.closeReply.addEventListener('click', () => {
            replyingTo = null;
            dom.chat.replyBar.classList.add('hidden');
        });
    }

    function sendMessage() {
        if(spamCooldown) { showToast("Espera un momento..."); return; }
        const text = dom.inputs.msg.value.trim();
        if (!text) return;
        
        const payload = { text, color: state.color };
        if(replyingTo) payload.replyTo = replyingTo;

        if (socket) socket.emit('chatMessage', payload);
        dom.inputs.msg.value = '';
        if (dom.btns.send) dom.btns.send.classList.add('hidden');
        if (dom.btns.mic) dom.btns.mic.classList.remove('hidden');
        replyingTo = null;
        dom.chat.replyBar.classList.add('hidden');
        dom.inputs.msg.focus();
        
        spamCooldown = true;
        setTimeout(() => spamCooldown = false, 1500);
    }

    if (dom.btns.mic) {
        dom.btns.mic.addEventListener('click', async () => {
            try {
                if (!navigator.mediaDevices) return alert("Navegador no soporta audio.");
                const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
                mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
                if(!mimeType) return alert("Audio no soportado.");

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, { mimeType });
                audioChunks = [];
                mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
                mediaRecorder.onstop = () => stream.getTracks().forEach(track => track.stop());
                mediaRecorder.start();
                startRecTimer();
                dom.chat.normalUI.classList.add('hidden');
                dom.chat.recUI.classList.remove('hidden');
            } catch (err) { alert("Microfono denegado."); }
        });
    }

    if (dom.btns.recCancel) dom.btns.recCancel.addEventListener('click', () => { if (mediaRecorder) mediaRecorder.stop(); resetRecUI(); });
    if (dom.btns.recSend) dom.btns.recSend.addEventListener('click', () => {
        if(spamCooldown) { showToast("Espera..."); return; }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => { if (socket) socket.emit('chatMessage', { text: '', color: state.color, audio: reader.result }); };
                resetRecUI();
                spamCooldown = true;
                setTimeout(() => spamCooldown = false, 1500);
            };
        }
    });

    function startRecTimer() {
        recStartTime = Date.now();
        recInterval = setInterval(() => {
            const diff = Math.floor((Date.now() - recStartTime) / 1000);
            const m = Math.floor(diff / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            if (dom.chat.recTimer) dom.chat.recTimer.innerText = `${m}:${s}`;
        }, 1000);
    }

    function resetRecUI() {
        clearInterval(recInterval);
        if (dom.chat.recTimer) dom.chat.recTimer.innerText = "00:00";
        dom.chat.recUI.classList.add('hidden');
        dom.chat.normalUI.classList.remove('hidden');
    }

    if (dom.chat.roomTrigger) dom.chat.roomTrigger.onclick = () => { dom.chat.roomModal.classList.add('active'); dom.chat.roomModal.classList.remove('hidden'); };
    if (dom.chat.closeModal) dom.chat.closeModal.onclick = () => { dom.chat.roomModal.classList.remove('active'); setTimeout(() => dom.chat.roomModal.classList.add('hidden'), 300); };
    if (dom.btns.settings) dom.btns.settings.onclick = () => dom.chat.settingsPanel.classList.add('open');
    if (dom.btns.closeSettings) dom.btns.closeSettings.onclick = () => dom.chat.settingsPanel.classList.remove('open');
    if (dom.btns.leave) dom.btns.leave.onclick = () => location.reload();
    
    if(dom.btns.themeDark) dom.btns.themeDark.onclick = () => applyTheme('dark');
    if(dom.btns.themeLight) dom.btns.themeLight.onclick = () => applyTheme('light');

    document.querySelectorAll('.c-opt').forEach(opt => {
        opt.onclick = () => {
            const color = opt.dataset.color;
            state.color = color;
            localStorage.setItem('chatColor', color);
            document.documentElement.style.setProperty('--msg-me', color);
            updateColorActiveState(color);
        };
    });

    function updateColorActiveState(color) {
        document.querySelectorAll('.c-opt').forEach(o => o.classList.remove('active'));
        const active = document.querySelector(`.c-opt[data-color="${color}"]`);
        if (active) active.classList.add('active');
    }

    if (socket) {
        socket.on('spamWarning', (msg) => showToast(msg));
        socket.on('history', msgs => { if (dom.chat.window) { dom.chat.window.innerHTML = '<div class="date-divider">Historial</div>'; if (dom.chat.typing) dom.chat.window.appendChild(dom.chat.typing); msgs.forEach(addMessageToDOM); scrollToBottom(); } });
        socket.on('message', msg => { addMessageToDOM(msg); scrollToBottom(); });
        socket.on('onlineCount', count => { if (dom.chat.online) dom.chat.online.innerText = count; if (dom.chat.modalOnline) dom.chat.modalOnline.innerText = count; });
        socket.on('displayTyping', data => { if (dom.chat.typing) data.isTyping ? dom.chat.typing.classList.remove('hidden') : dom.chat.typing.classList.add('hidden'); scrollToBottom(); });
        socket.on('updateMessage', (updatedMsg) => {
            const msgEl = document.getElementById(`msg-${updatedMsg.id}`);
            if (msgEl) {
                let reactDisplay = msgEl.querySelector('.reaction-display');
                if (!reactDisplay) { reactDisplay = document.createElement('div'); reactDisplay.className = 'reaction-display'; msgEl.appendChild(reactDisplay); }
                reactDisplay.innerHTML = Object.entries(updatedMsg.reactions).map(([e, c]) => `<span>${e}</span>`).join('');
            }
        });
    }

    function addMessageToDOM(msg) {
        if (!dom.chat.window) return;
        if (msg.type === 'system') {
            const div = document.createElement('div');
            div.className = 'date-divider'; div.style.marginTop = '10px'; div.innerText = msg.text;
            dom.chat.window.insertBefore(div, dom.chat.typing);
            return;
        }

        const isMe = socket && msg.senderId === socket.id;
        if (!isMe && !document.getElementById(`msg-${msg.id}`) && dom.audio) { dom.audio.currentTime = 0; dom.audio.play().catch(e => {}); }

        const wrapper = document.createElement('div');
        wrapper.id = `msg-${msg.id}`;
        wrapper.className = `msg-wrapper ${isMe ? 'me' : 'other'}`;
        wrapper.ondblclick = () => { if (socket) socket.emit('react', { messageId: msg.id, emoji: '❤️' }); if (typeof gsap !== 'undefined') gsap.to(wrapper, { scale: 1.1, duration: 0.1, yoyo: true, repeat: 1 }); };

        const replyBtn = document.createElement('div');
        replyBtn.className = 'swipe-reply-btn';
        replyBtn.innerHTML = '<i class="ph-bold ph-arrow-u-up-left"></i>';
        replyBtn.onclick = (e) => {
            e.stopPropagation();
            const txt = msg.text || '(Multimedia)';
            initReply(msg.id, txt);
        };
        wrapper.appendChild(replyBtn);

        let content = '';
        if(msg.replyTo) {
            content += `<span class="reply-context"><i class="ph-bold ph-arrow-bend-up-left"></i> ${msg.replyTo.text.substring(0,20)}...</span>`;
        }

        if (msg.text) content += `<div class="bubble">${content}${msg.text}</div>`; // Nested reply inside bubble logic is simplified here
        else if (content) content = `<div class="bubble">${content}</div>`; // Just reply

        if (msg.image) content += `<img src="${msg.image}" class="msg-image" alt="Imagen">`;
        if (msg.audio) {
            const audioId = `audio-${msg.id}`;
            content += `<div class="bubble"><div class="custom-audio-player"><button class="play-pause-btn" onclick="toggleAudio('${audioId}')"><i class="ph-fill ph-play"></i></button><div class="audio-progress-container"><div class="audio-progress-bar"><div class="audio-progress-fill" id="fill-${audioId}"></div></div><div class="audio-time" id="time-${audioId}">0:00</div></div><audio id="${audioId}" src="${msg.audio}" ontimeupdate="updateAudioUI('${audioId}')" onended="resetAudioUI('${audioId}')"></audio></div></div>`;
        }
        if (msg.linkData) {
            content += `<a href="${msg.linkData.url}" target="_blank" class="link-card">${msg.linkData.image ? `<img src="${msg.linkData.image}" class="link-img">` : ''}<div class="link-info"><div class="link-title">${msg.linkData.title}</div><div class="link-url">${new URL(msg.linkData.url).hostname}</div></div></a>`;
        }

        let nameHtml = '';
        if(!isMe) {
            const avatarIcon = msg.avatar || 'ph-user';
            nameHtml = `<div class="sender-name"><i class="ph-fill ${avatarIcon}" style="margin-right:4px;"></i>${msg.senderName}</div>`;
        }
        
        let reactionsHtml = '';
        if(msg.reactions && Object.keys(msg.reactions).length > 0) {
            reactionsHtml = `<div class="reaction-display">${Object.keys(msg.reactions).map(k => `<span>${k}</span>`).join('')}</div>`;
        }

        wrapper.innerHTML = `${nameHtml}${content}${reactionsHtml}`;
        wrapper.appendChild(replyBtn);
        dom.chat.window.insertBefore(wrapper, dom.chat.typing);
    }

    window.toggleAudio = function(id) {
        const audio = document.getElementById(id);
        const btn = audio.parentElement.querySelector('.play-pause-btn i');
        if(audio.paused) {
            document.querySelectorAll('audio').forEach(a => { if(a.id !== id && !a.paused) { a.pause(); a.currentTime=0; resetAudioUI(a.id); }});
            audio.play();
            btn.classList.replace('ph-play', 'ph-pause');
        } else {
            audio.pause();
            btn.classList.replace('ph-pause', 'ph-play');
        }
    };
    window.updateAudioUI = function(id) {
        const audio = document.getElementById(id);
        const fill = document.getElementById(`fill-${id}`);
        const time = document.getElementById(`time-${id}`);
        if(audio.duration) {
            const pct = (audio.currentTime / audio.duration) * 100;
            fill.style.width = `${pct}%`;
            const m = Math.floor(audio.currentTime / 60);
            const s = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
            time.innerText = `${m}:${s}`;
        }
    };
    window.resetAudioUI = function(id) {
        const audio = document.getElementById(id);
        if(!audio) return;
        const btn = audio.parentElement.querySelector('.play-pause-btn i');
        const fill = document.getElementById(`fill-${id}`);
        if(btn) btn.classList.replace('ph-pause', 'ph-play');
        if(fill) fill.style.width = '0%';
    };

    function scrollToBottom() { setTimeout(() => { if (dom.chat.window) dom.chat.window.scrollTop = dom.chat.window.scrollHeight; }, 10); }

    if (dom.btns.attach) dom.btns.attach.addEventListener('click', () => dom.inputs.file.click());
    if (dom.inputs.file) dom.inputs.file.addEventListener('change', function() {
        if (this.files[0]) {
            const reader = new FileReader();
            reader.onload = e => { if (socket) socket.emit('chatMessage', { text: '', color: state.color, image: e.target.result }); };
            reader.readAsDataURL(this.files[0]);
            this.value = '';
        }
    });

    if (window.EmojiButton && dom.btns.emoji) {
        const picker = new window.EmojiButton({ position: 'bottom-start', theme: state.theme === 'light' ? 'light' : 'dark', autoHide: false, rows: 6, recentsCount: 16, showSearch: true, searchPosition: 'top', emojiSize: '1.8rem', style: 'twemoji' });
        picker.on('emoji', s => { if (dom.inputs.msg) { dom.inputs.msg.value += s.emoji; dom.btns.send.classList.remove('hidden'); dom.btns.mic.classList.add('hidden'); dom.inputs.msg.focus(); } });
        dom.btns.emoji.addEventListener('click', () => picker.togglePicker(dom.btns.emoji));
    }
});