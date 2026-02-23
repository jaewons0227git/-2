lucide.createIcons();

const sidebar = document.getElementById('sideMenu');
const mainContent = document.getElementById('mainContent');
const overlay = document.getElementById('overlay');
const chatMessages = document.getElementById('chatMessages');
const subMenu = document.getElementById('subMenu');
const textarea = document.querySelector('.input-container textarea');
const sendBtn = document.querySelector('.send-btn');

let currentSessionId = null;
let chatHistory = JSON.parse(localStorage.getItem('quorv_history')) || [];
let isResponding = false;
let abortController = null;

// 백엔드 설정
const BACKEND_URL = "https://jaewondev6.pythonanywhere.com/askfast";

function initLayout() {
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('closed', 'active');
        overlay.classList.remove('active');
        mainContent.classList.remove('blurred');
    } else {
        sidebar.classList.remove('active', 'closed');
        overlay.classList.remove('active', 'blurred');
    }
    renderHistory();
}

// --- 모달 로직 ---
function openSettings() {
    document.getElementById('settingsModal').classList.add('active');
    lucide.createIcons();
}
function openInfo() {
    document.getElementById('infoModal').classList.add('active');
    lucide.createIcons();
}
function openPrivacy() {
    document.getElementById('privacyModal').classList.add('active');
    lucide.createIcons();
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// --- 메뉴 로직 ---
function toggleMenu() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        sidebar.classList.toggle('active');
        const isOpen = sidebar.classList.contains('active');
        overlay.classList.toggle('active', isOpen);
        mainContent.classList.toggle('blurred', isOpen);
    } else {
        sidebar.classList.toggle('closed');
    }
}

function toggleSubMenu() {
    const menu = document.getElementById('subMenu');
    const icon = document.querySelector('.dropdown-icon');
    menu.classList.toggle('open');
    if (icon) icon.style.transform = menu.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
}

function updateGreeting() {
    const hour = new Date().getHours();
    const greetingElement = document.getElementById('timeGreeting');
    let message = '';
    if (hour >= 5 && hour < 12) message = '좋은 아침입니다.';
    else if (hour >= 12 && hour < 18) message = '점심은 맛있게 드셨나요?';
    else if (hour >= 18 && hour < 22) message = '오늘 하루도 수고 많으셨습니다.';
    else message = '편안한 밤 되세요.';
    if (greetingElement) greetingElement.textContent = message;
}

function startNewChat() {
    stopCurrentResponse();
    currentSessionId = null;
    document.body.classList.remove('chat-active');
    chatMessages.innerHTML = `
        <div class="greeting-container">
            <h1 class="main-greeting">무엇을 도와드릴까요?</h1>
            <p id="timeGreeting" class="sub-greeting"></p>
        </div>
    `;
    updateGreeting();
    textarea.value = '';
    textarea.style.height = 'auto';
    setSendButtonState('default');
    if (window.innerWidth <= 768) toggleMenu();
}

function setSendButtonState(state) {
    if (state === 'stop') {
        sendBtn.classList.add('stop-mode');
        sendBtn.classList.remove('active');
        sendBtn.innerHTML = '<i data-lucide="square" fill="currentColor"></i>';
    } else if (state === 'active') {
        sendBtn.classList.add('active');
        sendBtn.classList.remove('stop-mode');
        sendBtn.innerHTML = '<i data-lucide="arrow-up"></i>';
    } else {
        sendBtn.classList.remove('active', 'stop-mode');
        sendBtn.innerHTML = '<i data-lucide="arrow-up"></i>';
    }
    lucide.createIcons();
}

if (textarea) {
    textarea.addEventListener('input', function() {
        if (isResponding) return;
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        this.style.overflowY = this.scrollHeight > 100 ? 'auto' : 'hidden';
        setSendButtonState(this.value.trim().length > 0 ? 'active' : 'default');
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isResponding) sendMessage();
        }
    });
}

if (sendBtn) {
    sendBtn.addEventListener('click', () => {
        if (isResponding) stopCurrentResponse();
        else sendMessage();
    });
}

function stopCurrentResponse() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    
    const wrappers = chatMessages.querySelectorAll('.message-wrapper');
    if (wrappers.length > 0 && isResponding) {
        const lastBotWrapper = Array.from(wrappers).reverse().find(w => w.querySelector('.bot-message'));
        if (lastBotWrapper) {
            const botDiv = lastBotWrapper.querySelector('.bot-message');
            if (!botDiv.textContent.includes('[응답중지됨]')) {
                botDiv.textContent += ' [응답중지됨]';
            }
            const session = chatHistory.find(s => s.id === currentSessionId);
            const msgIdx = session.messages.length - 1;
            const msgObj = session.messages[msgIdx];
            
            updateLastBotVersion(botDiv.textContent);
            
            const existingActions = lastBotWrapper.querySelector('.message-actions');
            if (existingActions) existingActions.remove();
            lastBotWrapper.appendChild(createMessageActions(botDiv.textContent, msgObj.versions, msgObj.currentVersion, lastBotWrapper, msgIdx));
        }
    }
    isResponding = false;
    textarea.disabled = false;
    setSendButtonState(textarea.value.trim().length > 0 ? 'active' : 'default');
}

async function sendMessage() {
    const text = textarea.value.trim();
    if (text.length === 0 || isResponding) return;

    isResponding = true;
    textarea.disabled = true;
    setSendButtonState('stop');

    const greeting = document.querySelector('.greeting-container');
    if (greeting) {
        greeting.remove();
        document.body.classList.add('chat-active');
    }

    if (!currentSessionId) {
        currentSessionId = Date.now().toString();
        const title = text.length > 15 ? text.substring(0, 15) + '...' : text;
        chatHistory.push({ id: currentSessionId, title: title, messages: [] });
    }

    const session = chatHistory.find(s => s.id === currentSessionId);
    session.messages.push({ sender: 'user', text: text });
    localStorage.setItem('quorv_history', JSON.stringify(chatHistory));
    renderHistory();
    appendMessageToUI(session.messages[session.messages.length - 1], session.messages.length - 1);
    
    textarea.value = '';
    textarea.style.height = 'auto';

    const loader = showLoader();
    
    abortController = new AbortController();
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history: session.messages.slice(0, -1).map(m => ({
                    role: m.sender === 'user' ? 'user' : 'model',
                    content: m.sender === 'user' ? m.text : m.versions[m.currentVersion]
                }))
            }),
            signal: abortController.signal
        });

        loader.remove();
        if (!response.ok) throw new Error('서버 응답 오류');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        session.messages.push({ sender: 'bot', versions: [""], currentVersion: 0 });
        const msgIdx = session.messages.length - 1;
        const msgObj = session.messages[msgIdx];

        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper latest-bot-message';
        document.querySelectorAll('.latest-bot-message').forEach(el => el.classList.remove('latest-bot-message'));
        const div = document.createElement('div');
        div.className = `message bot-message`;
        wrapper.appendChild(div);
        chatMessages.appendChild(wrapper);

        let fullContent = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk === "[DONE]") break;
            fullContent += chunk;
            div.textContent = fullContent;
            scrollToBottom();
        }

        isResponding = false;
        textarea.disabled = false;
        setSendButtonState('default');
        
        msgObj.versions[0] = fullContent;
        localStorage.setItem('quorv_history', JSON.stringify(chatHistory));
        wrapper.appendChild(createMessageActions(fullContent, msgObj.versions, 0, wrapper, msgIdx));

    } catch (err) {
        if (err.name === 'AbortError') return;
        loader.remove();
        isResponding = false;
        textarea.disabled = false;
        setSendButtonState('default');
    }
}

function appendMessageToUI(msg, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';
    if (msg.sender === 'bot') {
        document.querySelectorAll('.latest-bot-message').forEach(el => el.classList.remove('latest-bot-message'));
        wrapper.classList.add('latest-bot-message');
    }
    const div = document.createElement('div');
    div.className = `message ${msg.sender}-message`;
    const text = msg.sender === 'user' ? msg.text : (msg.versions ? msg.versions[msg.currentVersion] : "");
    div.textContent = text;
    wrapper.appendChild(div);
    if (msg.sender === 'bot' && text !== "") {
        const actions = createMessageActions(text, msg.versions || [text], msg.currentVersion || 0, wrapper, idx);
        wrapper.appendChild(actions);
    }
    chatMessages.appendChild(wrapper);
    scrollToBottom();
}

function createMessageActions(text, versions, currentIdx, wrapper, msgIdx) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-actions';
    if (versions && versions.length > 1) {
        const pagination = document.createElement('div');
        pagination.className = 'pagination';
        pagination.innerHTML = `
            <i data-lucide="chevron-left" class="page-arrow" onclick="switchVersion(${msgIdx}, -1, this)"></i>
            <span>${currentIdx + 1}/${versions.length}</span>
            <i data-lucide="chevron-right" class="page-arrow" onclick="switchVersion(${msgIdx}, 1, this)"></i>
        `;
        actionsDiv.appendChild(pagination);
    }
    actionsDiv.appendChild(createActionBtn('copy', () => navigator.clipboard.writeText(text)));
    const regenBtn = createActionBtn('rotate-ccw', () => {
        if (wrapper.classList.contains('latest-bot-message')) regenerateResponse();
    });
    actionsDiv.appendChild(regenBtn);
    actionsDiv.appendChild(createActionBtn('thumbs-up', () => {}));
    actionsDiv.appendChild(createActionBtn('thumbs-down', () => {}));
    setTimeout(() => lucide.createIcons({ scope: actionsDiv }), 0);
    return actionsDiv;
}

function createActionBtn(iconName, onClick) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
    btn.onclick = (e) => { e.stopPropagation(); onClick(); };
    return btn;
}

async function regenerateResponse() {
    if (isResponding || !currentSessionId) return;
    const session = chatHistory.find(s => s.id === currentSessionId);
    const lastUserIdx = Array.from(session.messages).reverse().findIndex(m => m.sender === 'user');
    if (lastUserIdx === -1) return;
    const realUserIdx = session.messages.length - 1 - lastUserIdx;
    const text = session.messages[realUserIdx].text;

    isResponding = true;
    textarea.disabled = true;
    setSendButtonState('stop');

    const lastBotMsg = session.messages[session.messages.length - 1];
    lastBotMsg.versions.push("");
    lastBotMsg.currentVersion = lastBotMsg.versions.length - 1;

    const latestWrapper = document.querySelector('.latest-bot-message');
    const botDiv = latestWrapper.querySelector('.bot-message');
    botDiv.textContent = "";
    const oldActions = latestWrapper.querySelector('.message-actions');
    if (oldActions) oldActions.remove();

    const loader = showLoader();
    abortController = new AbortController();
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history: session.messages.slice(0, realUserIdx).map(m => ({
                    role: m.sender === 'user' ? 'user' : 'model',
                    content: m.sender === 'user' ? m.text : m.versions[m.currentVersion]
                }))
            }),
            signal: abortController.signal
        });
        loader.remove();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk === "[DONE]") break;
            fullContent += chunk;
            botDiv.textContent = fullContent;
            scrollToBottom();
        }
        isResponding = false;
        textarea.disabled = false;
        setSendButtonState('default');
        lastBotMsg.versions[lastBotMsg.currentVersion] = fullContent;
        localStorage.setItem('quorv_history', JSON.stringify(chatHistory));
        latestWrapper.appendChild(createMessageActions(fullContent, lastBotMsg.versions, lastBotMsg.currentVersion, latestWrapper, session.messages.length - 1));
    } catch (err) {
        if (err.name === 'AbortError') return;
        loader.remove();
        isResponding = false;
        textarea.disabled = false;
        setSendButtonState('default');
    }
}

function switchVersion(msgIdx, delta, btnEl) {
    if (isResponding) return;
    const session = chatHistory.find(s => s.id === currentSessionId);
    const msg = session.messages[msgIdx];
    const nextIdx = msg.currentVersion + delta;
    if (nextIdx < 0 || nextIdx >= msg.versions.length) return;
    msg.currentVersion = nextIdx;
    localStorage.setItem('quorv_history', JSON.stringify(chatHistory));
    const wrapper = btnEl.closest('.message-wrapper');
    const text = msg.versions[nextIdx];
    wrapper.querySelector('.bot-message').textContent = text;
    const actions = wrapper.querySelector('.message-actions');
    const newActions = createMessageActions(text, msg.versions, nextIdx, wrapper, msgIdx);
    wrapper.replaceChild(newActions, actions);
}

function updateLastBotVersion(text) {
    const session = chatHistory.find(s => s.id === currentSessionId);
    if (session && session.messages.length > 0) {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.sender === 'bot') {
            lastMsg.versions[lastMsg.currentVersion] = text;
            localStorage.setItem('quorv_history', JSON.stringify(chatHistory));
        }
    }
}

function showLoader() {
    const div = document.createElement('div');
    div.className = 'message-wrapper';
    div.innerHTML = '<div class="thinking-text">답변을 생각하는 중</div>';
    chatMessages.appendChild(div);
    scrollToBottom();
    return div;
}

function scrollToBottom() {
    const contentBody = document.getElementById('contentBody');
    contentBody.scrollTop = contentBody.scrollHeight;
}

function renderHistory() {
    subMenu.innerHTML = '';
    [...chatHistory].reverse().forEach(session => {
        const div = document.createElement('div');
        div.className = 'sub-item';
        div.textContent = session.title;
        div.onclick = (e) => { e.stopPropagation(); loadSession(session.id); };
        subMenu.appendChild(div);
    });
}

function loadSession(id) {
    if (isResponding) return;
    const session = chatHistory.find(s => s.id === id);
    if (!session) return;
    currentSessionId = id;
    document.body.classList.add('chat-active');
    chatMessages.innerHTML = '';
    session.messages.forEach((msg, idx) => appendMessageToUI(msg, idx));
    if (window.innerWidth <= 768) toggleMenu();
}

initLayout();
updateGreeting();
window.addEventListener('resize', initLayout);