// PIP-BOY 4000 — Chat Logic & Streaming

const chatScreen = document.getElementById('chatScreen');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const modelIndicator = document.getElementById('modelIndicator');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

const SPINNER_FRAMES = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
let spinnerInterval = null;
let spinnerIndex = 0;
let isProcessing = false;
let thinkMode = true;

// --- Spinner ---
function startSpinner(element) {
    spinnerIndex = 0;
    spinnerInterval = setInterval(() => {
        element.textContent = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
        spinnerIndex++;
    }, 100);
}

function stopSpinner() {
    if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
    }
}

// --- Status Updates ---
function setStatus(stage, model = '', reason = '') {
    const dot = modelIndicator.querySelector('.indicator-dot');

    switch (stage) {
        case 'routing':
            statusText.className = 'status-text routing';
            statusText.innerHTML = `<span class="spinner-char"></span> ROUTING QUERY...`;
            startSpinner(statusText.querySelector('.spinner-char'));
            dot.classList.add('active');
            modelIndicator.querySelector('.indicator-dot').nextSibling.textContent = ' ROUTING';
            progressBar.classList.add('active');
            progressFill.className = 'progress-fill indeterminate';
            break;

        case 'generating':
            stopSpinner();
            const modelShort = 'QWEN-3.5 35B';
            statusText.className = 'status-text generating';
            statusText.innerHTML = `<span class="spinner-char"></span> ${modelShort} [GENERATING...]`;
            startSpinner(statusText.querySelector('.spinner-char'));
            modelIndicator.innerHTML = `<span class="indicator-dot active"></span> ${modelShort}`;
            progressFill.className = 'progress-fill indeterminate';
            break;

        case 'reviewing':
            stopSpinner();
            statusText.className = 'status-text reviewing';
            statusText.innerHTML = `<span class="spinner-char"></span> QWEN-3.5 35B [VERIFYING SAFETY...]`;
            startSpinner(statusText.querySelector('.spinner-char'));
            modelIndicator.innerHTML = '<span class="indicator-dot active"></span> QWEN-3.5 35B';
            break;

        case 'complete':
            stopSpinner();
            statusText.className = 'status-text complete';
            statusText.textContent = '✓ TRANSMISSION COMPLETE';
            modelIndicator.innerHTML = '<span class="indicator-dot"></span> STANDBY';
            progressBar.classList.remove('active');
            progressFill.className = 'progress-fill';
            progressFill.style.width = '0%';
            // Reset after 3 seconds
            setTimeout(() => {
                if (!isProcessing) {
                    statusText.className = 'status-text';
                    statusText.textContent = 'READY';
                }
            }, 3000);
            break;

        case 'error':
            stopSpinner();
            statusText.className = 'status-text error';
            statusText.textContent = '✗ ERROR — ' + reason;
            modelIndicator.innerHTML = '<span class="indicator-dot"></span> ERROR';
            progressBar.classList.remove('active');
            break;

        default:
            statusText.className = 'status-text';
            statusText.textContent = 'READY';
    }
}

// --- Message Rendering ---
function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message message-user';
    div.innerHTML = `
        <div class="message-label">USER</div>
        <div class="message-content">${escapeHtml(text)}</div>
    `;
    chatScreen.appendChild(div);
    scrollToBottom();
}

function createAssistantMessage(model, isCode) {
    const div = document.createElement('div');
    div.className = 'message message-assistant';

    const modelName = 'QWEN-3.5 35B';
    const tag = isCode ? 'URGENT' : 'GENERAL';

    div.innerHTML = `
        <div class="message-label">
            AGENT
            <span class="message-model-tag">${modelName}</span>
            <span class="message-model-tag">${tag}</span>
        </div>
        <div class="message-content" id="currentResponse"></div>
    `;
    chatScreen.appendChild(div);
    scrollToBottom();
    return div;
}

function addReviewSection(messageDiv) {
    const reviewDiv = document.createElement('div');
    reviewDiv.innerHTML = `
        <div class="review-divider">SAFETY CHECK — QWEN-3.5 35B</div>
        <div class="review-content" id="currentReview"></div>
    `;
    messageDiv.appendChild(reviewDiv);
    scrollToBottom();
}

// --- Markdown-lite rendering ---
function renderMarkdown(text) {
    // Very basic markdown: code blocks, inline code, bold, headers
    let html = escapeHtml(text);

    // Code blocks: ```lang\n...\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    chatScreen.scrollTop = chatScreen.scrollHeight;
}

// --- Send Message ---
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || isProcessing) return;

    isProcessing = true;
    sendBtn.disabled = true;
    userInput.value = '';
    userInput.style.height = 'auto';

    addUserMessage(text);

    let messageDiv = null;
    let currentStage = '';
    let responseText = '';
    let reviewText = '';

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, think: thinkMode }),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
                let data;
                try {
                    data = JSON.parse(line);
                } catch {
                    continue;
                }

                if (data.type === 'status') {
                    setStatus(data.stage, data.model || '', data.reason || '');

                    if (data.stage === 'generating' && !messageDiv) {
                        messageDiv = createAssistantMessage(data.model, data.is_code);
                        currentStage = 'generating';
                    }

                    if (data.stage === 'reviewing' && messageDiv) {
                        // Finalize the generation content with markdown
                        const responseEl = messageDiv.querySelector('#currentResponse');
                        if (responseEl) {
                            responseEl.innerHTML = renderMarkdown(responseText);
                            responseEl.removeAttribute('id');
                        }
                        addReviewSection(messageDiv);
                        currentStage = 'reviewing';
                    }

                    if (data.stage === 'complete') {
                        // Finalize any remaining content
                        const responseEl = messageDiv?.querySelector('#currentResponse');
                        if (responseEl) {
                            responseEl.innerHTML = renderMarkdown(responseText);
                            responseEl.removeAttribute('id');
                        }
                        const reviewEl = messageDiv?.querySelector('#currentReview');
                        if (reviewEl) {
                            reviewEl.innerHTML = renderMarkdown(reviewText);
                            reviewEl.removeAttribute('id');
                        }
                    }
                }

                if (data.type === 'token') {
                    if (data.stage === 'generating') {
                        responseText += data.content;
                        const el = messageDiv?.querySelector('#currentResponse');
                        if (el) {
                            el.textContent = responseText;
                            // Add typing cursor
                            const cursor = document.createElement('span');
                            cursor.className = 'typing-cursor';
                            el.appendChild(cursor);
                        }
                    }

                    if (data.stage === 'reviewing') {
                        reviewText += data.content;
                        const el = messageDiv?.querySelector('#currentReview');
                        if (el) {
                            el.textContent = reviewText;
                            const cursor = document.createElement('span');
                            cursor.className = 'typing-cursor';
                            el.appendChild(cursor);
                        }
                    }

                    scrollToBottom();
                }
            }
        }
    } catch (err) {
        setStatus('error', '', err.message || 'Connection failed');
        console.error('Chat error:', err);
    }

    isProcessing = false;
    sendBtn.disabled = false;
    userInput.focus();
}

// --- Clear History ---
async function clearHistory() {
    try {
        await fetch('/api/clear', { method: 'POST' });
        // Keep only the welcome message
        const welcome = chatScreen.querySelector('.welcome-message');
        chatScreen.innerHTML = '';
        if (welcome) chatScreen.appendChild(welcome);
        setStatus('complete');
        statusText.textContent = 'MEMORY CLEARED';
    } catch (err) {
        console.error('Clear error:', err);
    }
}

// --- Auto-resize textarea ---
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

// --- Key bindings ---
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);
clearBtn.addEventListener('click', clearHistory);

// --- Think Mode Toggle ---
const thinkBtn = document.getElementById('thinkBtn');
thinkBtn.addEventListener('click', () => {
    thinkMode = !thinkMode;
    thinkBtn.classList.toggle('active', thinkMode);
});

// --- Settings Modal ---
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const promptEditor = document.getElementById('promptEditor');
const promptSaveBtn = document.getElementById('promptSaveBtn');
const promptResetBtn = document.getElementById('promptResetBtn');
const settingsStatus = document.getElementById('settingsStatus');

async function openSettings() {
    settingsStatus.textContent = 'LOADING...';
    settingsStatus.className = 'settings-status';
    settingsOverlay.classList.add('open');
    try {
        const resp = await fetch('/api/prompt');
        const data = await resp.json();
        promptEditor.value = data.prompt || '';
        settingsStatus.textContent = `${data.prompt.length} CHARS`;
    } catch (err) {
        settingsStatus.textContent = 'LOAD FAILED';
        settingsStatus.className = 'settings-status error';
    }
    promptEditor.focus();
}

function closeSettings() {
    settingsOverlay.classList.remove('open');
    userInput.focus();
}

async function savePrompt() {
    const text = promptEditor.value.trim();
    if (!text) {
        settingsStatus.textContent = 'ERROR: EMPTY PROMPT';
        settingsStatus.className = 'settings-status error';
        return;
    }
    settingsStatus.textContent = 'SAVING...';
    settingsStatus.className = 'settings-status';
    try {
        const resp = await fetch('/api/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text }),
        });
        const data = await resp.json();
        if (data.status === 'ok') {
            settingsStatus.textContent = `SAVED — ${data.length} CHARS`;
            settingsStatus.className = 'settings-status saved';
            setTimeout(() => {
                settingsStatus.className = 'settings-status';
            }, 3000);
        } else {
            settingsStatus.textContent = 'ERROR: ' + (data.error || 'UNKNOWN');
            settingsStatus.className = 'settings-status error';
        }
    } catch (err) {
        settingsStatus.textContent = 'SAVE FAILED';
        settingsStatus.className = 'settings-status error';
    }
}

async function reloadPrompt() {
    settingsStatus.textContent = 'RELOADING...';
    try {
        const resp = await fetch('/api/prompt');
        const data = await resp.json();
        promptEditor.value = data.prompt || '';
        settingsStatus.textContent = `RELOADED — ${data.prompt.length} CHARS`;
        settingsStatus.className = 'settings-status saved';
        setTimeout(() => { settingsStatus.className = 'settings-status'; }, 2000);
    } catch (err) {
        settingsStatus.textContent = 'RELOAD FAILED';
        settingsStatus.className = 'settings-status error';
    }
}

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
promptSaveBtn.addEventListener('click', savePrompt);
promptResetBtn.addEventListener('click', reloadPrompt);

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsOverlay.classList.contains('open')) {
        closeSettings();
    }
});

// Close on overlay click (outside modal)
settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
});

// Ctrl/Cmd+S to save while in editor
promptEditor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        savePrompt();
    }
});

// --- Health check on load ---
async function checkHealth() {
    try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        if (data.status !== 'ok') {
            setStatus('error', '', data.message || 'Ollama not available');
        }
    } catch {
        setStatus('error', '', 'Backend not responding');
    }
}

checkHealth();
