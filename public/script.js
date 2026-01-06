document.addEventListener('DOMContentLoaded', () => {
    let socket = null;
    let spamCooldown = false;
    let mimeType = 'audio/webm';
    let replyingTo = null; 
    let contextMenuTargetId = null;

    function vibrate(pattern = 10) {
        if ("vibrate" in navigator) navigator.vibrate(pattern);
    }

    try {
        if (typeof io !== 'undefined') {
            socket = io();
        }
    } catch (e) {
        console.error(e);
    }

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
            replyName: document.getElementById('reply-name'),
            closeReply: document.getElementById('close-reply')
        },
        audio: document.getElementById('msg-sound'),
        toastContainer: document.getElementById('toast-container'),
        avatars: document.querySelectorAll('.avatar-option'),
        ctxMenu: document.getElementById('context-menu'),
        ctxCopy: document.getElementById('ctx-copy'),
        ctxReply: document.getElementById('ctx-reply'), // NEW
        ctxDelete: document.getElementById('ctx-delete'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.getElementById('lightbox-img'),
        closeLightbox: document.getElementById('close-lightbox')
    };

    let state = {
        nickname: '',
        color: localStorage.getItem('chatColor') || '#007AFF',
        avatar: 'ph-user',
        theme: localStorage.getItem('chatTheme') || 'dark'
    };

    let mediaRecorder = null;
    let audioChunks = [];
    let recStartTime = null;
    let recInterval = null;

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
        if (dom.btns.themeDark) {
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
            setTimeout(() => {
                target.classList.add('active');
            }, 10);
        }

        if (to === 'chat' && typeof gsap !== 'undefined') {
            gsap.from('.glass-header', { y: -50, opacity: 0, duration: 0.6, delay: 0.2 });
            gsap.from('.input-area-wrapper', { y: 50, opacity: 0, duration: 0.6, delay: 0.3 });
        }
    }

    if (dom.btns.start) {
        dom.btns.start.onclick = (e) => {
            e.preventDefault();
            vibrate(10);
            navigate('login');
        };
    }

    if (dom.btns.back) dom.btns.back.onclick = () => navigate('onboarding');

    dom.avatars.forEach(av => {
        av.addEventListener('click', () => {
            vibrate(10);
            dom.avatars.forEach(a => a.classList.remove('active'));
            av.classList.add('active');
            state.avatar = av.dataset.icon;
        });
    });

    if (dom.inputs.nick) {
        dom.inputs.nick.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (dom.btns.join) dom.btns.join.disabled = val.length < 3;
        });
    }

    if (dom.btns.join) {
        dom.btns.join.addEventListener('click', () => {
            vibrate(20);
            state.nickname = dom.inputs.nick.value.trim();
            if (socket) socket.emit('join', { nickname: state.nickname, color: state.color, avatar: state.avatar });
            navigate('chat');
        });
    }

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

        dom.inputs.msg.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    if (dom.btns.send) dom.btns.send.addEventListener('click', sendMessage);

    window.initReply = function(id, text, name) {
        vibrate(10);
        replyingTo = { id, text, name };
        
        dom.chat.replyName.innerText = name;
        dom.chat.replyText.innerText = text.substring(0, 40) + (text.length > 40 ? '...' : '');
        
        dom.chat.replyBar.classList.remove('hidden');
        dom.inputs.msg.focus();
    };

    if (dom.chat.closeReply) {
        dom.chat.closeReply.addEventListener('click', () => {
            replyingTo = null;
            dom.chat.replyBar.classList.add('hidden');
        });
    }

    function sendMessage() {
        if (spamCooldown) {
            showToast("Espera un momento antes de enviar otro mensaje.");
            return;
        }
        const text = dom.inputs.msg.value.trim();
        if (!text) return;

        vibrate(30);
        const payload = { text, color: state.color };
        if (replyingTo) payload.replyTo = replyingTo;

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
            vibrate(50);
            try {
                if (!navigator.mediaDevices) return alert("Navegador no soporta audio.");
                
                const types = [
                    'audio/webm;codecs=opus',
                    'audio/webm',
                    'audio/mp4',
                    'audio/ogg'
                ];
                
                mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
                if(!mimeType) {
                    alert("Tu navegador no soporta grabación de audio compatible.");
                    return;
                }

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
                audioChunks = [];

                mediaRecorder.ondataavailable = event => {
                    if (event.data.size > 0) audioChunks.push(event.data);
                };
                
                mediaRecorder.onstop = () => stream.getTracks().forEach(track => track.stop());

                mediaRecorder.start();
                startRecTimer();

                dom.chat.normalUI.classList.add('hidden');
                dom.chat.recUI.classList.remove('hidden');
            } catch (err) {
                console.error(err);
                alert("Microfono denegado o error de hardware.");
            }
        });
    }

    if (dom.btns.recCancel) {
        dom.btns.recCancel.addEventListener('click', () => {
            vibrate(20);
            if (mediaRecorder) mediaRecorder.stop();
            resetRecUI();
        });
    }

    if (dom.btns.recSend) {
        dom.btns.recSend.addEventListener('click', () => {
            vibrate(50);
            if(spamCooldown) {
                showToast("Espera un momento...");
                return;
            }
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: mimeType });
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = () => {
                        if (socket) socket.emit('chatMessage', { text: '', color: state.color, audio: reader.result });
                    };
                    resetRecUI();
                    spamCooldown = true;
                    setTimeout(() => spamCooldown = false, 1500);
                };
            }
        });
    }

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

    if (dom.chat.roomTrigger) dom.chat.roomTrigger.addEventListener('click', () => {
        dom.chat.roomModal.classList.add('active');
        dom.chat.roomModal.classList.remove('hidden');
    });

    if (dom.chat.closeModal) dom.chat.closeModal.addEventListener('click', () => {
        dom.chat.roomModal.classList.remove('active');
        setTimeout(() => dom.chat.roomModal.classList.add('hidden'), 300);
    });

    if (dom.btns.settings) dom.btns.settings.addEventListener('click', () => dom.chat.settingsPanel.classList.add('open'));
    if (dom.btns.closeSettings) dom.btns.closeSettings.addEventListener('click', () => dom.chat.settingsPanel.classList.remove('open'));
    if (dom.btns.leave) dom.btns.leave.addEventListener('click', () => location.reload());

    if(dom.btns.themeDark) dom.btns.themeDark.onclick = () => applyTheme('dark');
    if(dom.btns.themeLight) dom.btns.themeLight.onclick = () => applyTheme('light');

    document.querySelectorAll('.c-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            vibrate(10);
            const color = opt.dataset.color;
            state.color = color;
            localStorage.setItem('chatColor', color);
            document.documentElement.style.setProperty('--msg-me', color);
            updateColorActiveState(color);
        });
    });

    function updateColorActiveState(color) {
        document.querySelectorAll('.c-opt').forEach(o => o.classList.remove('active'));
        const active = document.querySelector(`.c-opt[data-color="${color}"]`);
        if (active) active.classList.add('active');
    }

    document.addEventListener('click', (e) => {
        if (dom.ctxMenu && !dom.ctxMenu.contains(e.target)) {
            dom.ctxMenu.classList.add('hidden');
        }
    });

    if (dom.ctxCopy) {
        dom.ctxCopy.addEventListener('click', () => {
            if (contextMenuTargetId) {
                const el = document.getElementById(`msg-${contextMenuTargetId}`);
                if (el) {
                    const text = el.querySelector('.bubble').innerText;
                    navigator.clipboard.writeText(text).then(() => showToast("Texto copiado"));
                }
            }
            dom.ctxMenu.classList.add('hidden');
        });
    }

    if (dom.ctxDelete) {
        dom.ctxDelete.addEventListener('click', () => {
            if (contextMenuTargetId) {
                socket.emit('deleteMessage', contextMenuTargetId);
                vibrate(20);
            }
            dom.ctxMenu.classList.add('hidden');
        });
    }

    if (dom.ctxReply) {
        dom.ctxReply.addEventListener('click', () => {
            if (contextMenuTargetId) {
                const el = document.getElementById(`msg-${contextMenuTargetId}`);
                if (el) {
                    let text = '(Multimedia)';
                    const bubble = el.querySelector('.bubble');
                    if(bubble && !bubble.querySelector('audio') && !bubble.querySelector('.custom-audio-player')) {
                         text = bubble.innerText;
                    }
                    
                    const name = el.querySelector('.sender-name') ? el.querySelector('.sender-name').innerText : 'Tú';
                    initReply(contextMenuTargetId, text, name);
                }
            }
            dom.ctxMenu.classList.add('hidden');
        });
    }

    if (dom.lightbox) {
        dom.lightbox.addEventListener('click', (e) => {
            if(e.target === dom.lightbox || e.target === dom.closeLightbox || e.target.parentElement === dom.closeLightbox) {
                dom.lightbox.classList.add('hidden');
                dom.lightboxImg.src = '';
            }
        });
    }
    
    function openLightbox(src) {
        dom.lightboxImg.src = src;
        dom.lightbox.classList.remove('hidden');
    }

    if (socket) {
        socket.on('spamWarning', (msg) => showToast(msg));
        
        socket.on('history', msgs => {
            if (dom.chat.window) {
                dom.chat.window.innerHTML = '<div class="date-divider">Historial</div>';
                if (dom.chat.typing) dom.chat.window.appendChild(dom.chat.typing);
                msgs.forEach(addMessageToDOM);
                scrollToBottom();
            }
        });
        socket.on('message', msg => {
            vibrate(10);
            addMessageToDOM(msg);
            scrollToBottom();
        });
        socket.on('onlineCount', count => {
            if (dom.chat.online) dom.chat.online.innerText = count;
            if (dom.chat.modalOnline) dom.chat.modalOnline.innerText = count;
        });
        socket.on('displayTyping', data => {
            if (dom.chat.typing) data.isTyping ? dom.chat.typing.classList.remove('hidden') : dom.chat.typing.classList.add('hidden');
            scrollToBottom();
        });
        socket.on('updateMessage', (updatedMsg) => {
            const msgEl = document.getElementById(`msg-${updatedMsg.id}`);
            if (msgEl) {
                let reactDisplay = msgEl.querySelector('.reaction-display');
                if (!reactDisplay) {
                    reactDisplay = document.createElement('div');
                    reactDisplay.className = 'reaction-display';
                    msgEl.appendChild(reactDisplay);
                }
                reactDisplay.innerHTML = Object.entries(updatedMsg.reactions).map(([e, c]) => `<span>${e}</span>`).join('');
            }
        });
        socket.on('messageDeleted', (msgId) => {
            const el = document.getElementById(`msg-${msgId}`);
            if (el) {
                el.classList.add('deleting');
                setTimeout(() => el.remove(), 300);
            }
        });
    }

    function addMessageToDOM(msg) {
        if (!dom.chat.window) return;
        if (msg.type === 'system') {
            const div = document.createElement('div');
            div.className = 'date-divider';
            div.style.marginTop = '10px';
            div.innerText = msg.text;
            dom.chat.window.insertBefore(div, dom.chat.typing);
            return;
        }

        const isMe = socket && msg.senderId === socket.id;
        if (!isMe && !document.getElementById(`msg-${msg.id}`) && dom.audio) {
            dom.audio.currentTime = 0;
            dom.audio.play().catch(e => {});
        }

        const wrapper = document.createElement('div');
        wrapper.id = `msg-${msg.id}`;
        wrapper.className = `msg-wrapper ${isMe ? 'me' : 'other'}`;

        wrapper.addEventListener('dblclick', () => {
            vibrate(30);
            if (socket) socket.emit('react', { messageId: msg.id, emoji: '❤️' });
            if (typeof gsap !== 'undefined') gsap.to(wrapper, { scale: 1.1, duration: 0.1, yoyo: true, repeat: 1 });
        });

        const openContext = (e) => {
            e.preventDefault();
            vibrate(50);
            contextMenuTargetId = msg.id;
            
            if(window.innerWidth > 800) {
                dom.ctxMenu.style.top = `${e.pageY}px`;
                dom.ctxMenu.style.left = `${e.pageX}px`;
            } else {
                dom.ctxMenu.style.top = ''; 
                dom.ctxMenu.style.left = '';
            }
            
            if(isMe) dom.ctxDelete.style.display = 'flex';
            else dom.ctxDelete.style.display = 'none';

            dom.ctxMenu.classList.remove('hidden');
        };

        wrapper.addEventListener('contextmenu', openContext);
        
        let pressTimer;
        wrapper.addEventListener('touchstart', (e) => {
            pressTimer = setTimeout(() => { openContext(e); }, 500);
        });
        wrapper.addEventListener('touchend', () => clearTimeout(pressTimer));
        wrapper.addEventListener('touchmove', () => clearTimeout(pressTimer));

        const replyBtn = document.createElement('div');
        replyBtn.className = 'swipe-reply-btn';
        replyBtn.innerHTML = '<i class="ph-bold ph-arrow-u-up-left"></i>';
        replyBtn.onclick = (e) => {
            e.stopPropagation();
            const txt = msg.text || '(Multimedia)';
            initReply(msg.id, txt, msg.senderName);
        };
        wrapper.appendChild(replyBtn);

        let content = '';
        if(msg.replyTo) {
            content += `<div class="reply-context" onclick="document.getElementById('msg-${msg.replyTo.id}').scrollIntoView({behavior:'smooth', block:'center'})">
                <span class="reply-context-name">${msg.replyTo.name}</span>
                <span class="reply-context-text">${msg.replyTo.text}</span>
            </div>`;
        }

        if (msg.text) content += `<div class="bubble">${content}${msg.text}</div>`;
        else if (content) content = `<div class="bubble">${content}</div>`;

        if (msg.image) {
            const imgId = `img-${msg.id}`;
            content += `<img src="${msg.image}" id="${imgId}" class="msg-image" alt="Imagen">`;
            setTimeout(() => {
                const el = document.getElementById(imgId);
                if(el) el.onclick = () => openLightbox(msg.image);
            }, 0);
        }
        
        if (msg.audio) {
            const audioId = `audio-${msg.id}`;
            content += `<div class="bubble">
                <div class="custom-audio-player">
                    <button class="play-pause-btn" onclick="toggleAudio('${audioId}')"><i class="ph-fill ph-play"></i></button>
                    <div class="audio-progress-container">
                        <div class="audio-progress-bar"><div class="audio-progress-fill" id="fill-${audioId}"></div></div>
                        <div class="audio-time" id="time-${audioId}">0:00</div>
                    </div>
                    <audio id="${audioId}" src="${msg.audio}" ontimeupdate="updateAudioUI('${audioId}')" onended="resetAudioUI('${audioId}')"></audio>
                </div>
            </div>`;
        }
        
        if (msg.linkData) {
            content += `<a href="${msg.linkData.url}" target="_blank" class="link-card">
                ${msg.linkData.image ? `<img src="${msg.linkData.image}" class="link-img">` : ''}
                <div class="link-info">
                    <div class="link-title">${msg.linkData.title}</div>
                    <div class="link-url">${new URL(msg.linkData.url).hostname}</div>
                </div>
            </a>`;
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
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(_ => { btn.classList.replace('ph-play', 'ph-pause'); }).catch(console.error);
            }
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
            reader.onload = e => {
                if (socket) socket.emit('chatMessage', { text: '', color: state.color, image: e.target.result });
            };
            reader.readAsDataURL(this.files[0]);
            this.value = '';
        }
    });

    if (window.EmojiButton && dom.btns.emoji) {
        const picker = new window.EmojiButton({
            position: 'bottom-start',
            theme: 'dark',
            autoHide: false,
            rows: 6,
            recentsCount: 16,
            showSearch: true,
            searchPosition: 'top',
            emojiSize: '1.8rem',
            style: 'twemoji'
        });
        picker.on('emoji', s => {
            if (dom.inputs.msg) {
                dom.inputs.msg.value += s.emoji;
                dom.btns.send.classList.remove('hidden');
                dom.btns.mic.classList.add('hidden');
                dom.inputs.msg.focus();
            }
        });
        dom.btns.emoji.addEventListener('click', () => picker.togglePicker(dom.btns.emoji));
    }
});