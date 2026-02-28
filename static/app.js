// PIP-BOY 4000 — Chat Logic & Streaming

const chatScreen = document.getElementById('chatScreen');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const modelIndicator = document.getElementById('modelIndicator');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const modelSelect = document.getElementById('modelSelect');
const thinkBtn = document.getElementById('thinkBtn');
const welcomeModel = document.getElementById('welcomeModel');

const SPINNER_FRAMES = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
let spinnerInterval = null;
let spinnerIndex = 0;
let isProcessing = false;
let thinkMode = true;
let currentModelName = '';     // Display-friendly name (e.g. "QWEN3.5:35B-A3B")
let currentSupportsThink = true;

// --- Helpers ---

function formatModelDisplay(name) {
    // Turn "qwen3.5:35b-a3b" into "QWEN3.5:35B-A3B"
    return name.toUpperCase();
}

function padModelSpan(name) {
    // Pad model name to fill the remaining 25 chars in the ASCII box, plus closing ║
    // The "║   NEURAL PROCESSOR: " prefix (21 chars) is in the HTML, so the span holds 25 chars + ║
    return name.substring(0, 25).padEnd(25, ' ') + '║';
}

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
    const modelShort = currentModelName || 'UNKNOWN';

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
            statusText.className = 'status-text generating';
            statusText.innerHTML = `<span class="spinner-char"></span> ${modelShort} [GENERATING...]`;
            startSpinner(statusText.querySelector('.spinner-char'));
            modelIndicator.innerHTML = `<span class="indicator-dot active"></span> ${modelShort}`;
            progressFill.className = 'progress-fill indeterminate';
            break;

        case 'reviewing':
            stopSpinner();
            statusText.className = 'status-text reviewing';
            statusText.innerHTML = `<span class="spinner-char"></span> ${modelShort} [VERIFYING SAFETY...]`;
            startSpinner(statusText.querySelector('.spinner-char'));
            modelIndicator.innerHTML = `<span class="indicator-dot active"></span> ${modelShort}`;
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

function createAssistantMessage(model, isUrgent) {
    const div = document.createElement('div');
    div.className = 'message message-assistant';

    const modelName = currentModelName || 'UNKNOWN';
    const tag = isUrgent ? 'URGENT' : 'GENERAL';

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
    const modelName = currentModelName || 'UNKNOWN';
    const reviewDiv = document.createElement('div');
    reviewDiv.innerHTML = `
        <div class="review-divider">SAFETY CHECK — ${modelName}</div>
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
    let cachedIsUrgent = false;  // Cache is_urgent from routing event

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-PipBoy-Client': 'pipboy-4000' },
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
                    // Cache is_urgent from routing stage
                    if (data.stage === 'routing' && data.is_urgent !== undefined) {
                        cachedIsUrgent = data.is_urgent;
                    }

                    setStatus(data.stage, data.model || '', data.reason || '');

                    if (data.stage === 'generating' && !messageDiv) {
                        messageDiv = createAssistantMessage(data.model, cachedIsUrgent);
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
        await fetch('/api/clear', { method: 'POST', headers: { 'X-PipBoy-Client': 'pipboy-4000' } });
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

// --- Model Selection ---

function updateThinkButton(supportsThink) {
    currentSupportsThink = supportsThink;
    if (supportsThink) {
        thinkBtn.style.display = '';
        // Restore active state
        thinkBtn.classList.toggle('active', thinkMode);
    } else {
        thinkBtn.style.display = 'none';
        // Force think off if model doesn't support it
        thinkMode = false;
    }
}

function updateWelcomeModel(displayName) {
    if (welcomeModel) {
        welcomeModel.textContent = padModelSpan(displayName);
    }
}

async function loadModels() {
    try {
        const resp = await fetch('/api/models');
        const data = await resp.json();

        if (data.error) {
            console.error('Model load error:', data.error);
            return { models: [], activeModel: null };
        }

        const models = data.models || [];
        const activeModel = data.active_model || null;

        // Populate the header dropdown
        modelSelect.innerHTML = '';
        if (models.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'NO MODELS';
            modelSelect.appendChild(opt);
            return { models, activeModel };
        }

        for (const m of models) {
            const opt = document.createElement('option');
            opt.value = m.name;
            let label = formatModelDisplay(m.name);
            if (m.parameter_size) label += ` (${m.parameter_size})`;
            opt.textContent = label;
            if (m.name === activeModel) opt.selected = true;
            modelSelect.appendChild(opt);
        }

        // If we have an active model, update the UI
        if (activeModel) {
            currentModelName = formatModelDisplay(activeModel);
            const activeInfo = models.find(m => m.name === activeModel);
            updateThinkButton(activeInfo?.supports_think ?? false);
            updateWelcomeModel(currentModelName);
        }

        return { models, activeModel };
    } catch (err) {
        console.error('Failed to load models:', err);
        return { models: [], activeModel: null };
    }
}

async function switchModel(modelName) {
    try {
        const resp = await fetch('/api/model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-PipBoy-Client': 'pipboy-4000' },
            body: JSON.stringify({ model: modelName }),
        });
        const data = await resp.json();
        if (data.status === 'ok') {
            currentModelName = formatModelDisplay(data.active_model);
            updateThinkButton(data.supports_think);
            updateWelcomeModel(currentModelName);
        }
    } catch (err) {
        console.error('Model switch error:', err);
    }
}

// Header dropdown change
modelSelect.addEventListener('change', () => {
    const selected = modelSelect.value;
    if (selected) {
        switchModel(selected);
    }
});

// --- First-launch model selection screen ---

async function showModelSelectScreen(models) {
    const overlay = document.getElementById('modelSelectOverlay');
    const list = document.getElementById('modelSelectList');
    const confirmBtn = document.getElementById('modelSelectConfirm');
    const status = document.getElementById('modelSelectStatus');

    overlay.classList.add('open');

    if (models.length === 0) {
        status.textContent = 'NO MODELS FOUND — Install models with: ollama pull <model>';
        return;
    }

    status.textContent = `${models.length} MODEL(S) DETECTED`;
    list.innerHTML = '';
    let selectedModel = null;

    for (const m of models) {
        const item = document.createElement('div');
        item.className = 'model-select-item';
        item.dataset.model = m.name;

        let meta = [];
        if (m.parameter_size) meta.push(m.parameter_size);
        if (m.family) meta.push(m.family);
        if (m.quantization) meta.push(m.quantization);
        if (m.size_gb) meta.push(`${m.size_gb} GB`);

        item.innerHTML = `
            <div class="model-select-name">${formatModelDisplay(m.name)}</div>
            <div class="model-select-meta">${meta.join(' · ')}</div>
        `;

        item.addEventListener('click', () => {
            // Deselect previous
            list.querySelectorAll('.model-select-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedModel = m.name;
            confirmBtn.disabled = false;
        });

        list.appendChild(item);
    }

    // If only one model, auto-select it
    if (models.length === 1) {
        list.querySelector('.model-select-item').classList.add('selected');
        selectedModel = models[0].name;
        confirmBtn.disabled = false;
    }

    confirmBtn.addEventListener('click', async () => {
        if (!selectedModel) return;
        confirmBtn.disabled = true;
        status.textContent = 'INITIALIZING...';
        await switchModel(selectedModel);

        // Update the dropdown selection
        modelSelect.value = selectedModel;

        overlay.classList.remove('open');
    });
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
thinkBtn.addEventListener('click', () => {
    if (!currentSupportsThink) return;
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
            headers: { 'Content-Type': 'application/json', 'X-PipBoy-Client': 'pipboy-4000' },
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

// --- Guided Setup Flow ---

const setupOverlayIds = ['setupInstallOverlay', 'setupStartOverlay', 'setupDownloadOverlay'];

function hideAllSetupScreens() {
    for (const id of setupOverlayIds) {
        document.getElementById(id).classList.remove('open');
    }
}

function showSetupScreen(id) {
    hideAllSetupScreens();
    document.getElementById(id).classList.add('open');
}

async function checkSetupStatus() {
    try {
        const resp = await fetch('/api/setup/status');
        return await resp.json();
    } catch {
        return { status: 'error', recommended_models: [] };
    }
}

function populateRecommendedModels(models) {
    const list = document.getElementById('setupModelList');
    const pullBtn = document.getElementById('setupPullBtn');
    const customInput = document.getElementById('setupCustomModel');
    list.innerHTML = '';
    let selectedModel = null;

    for (const m of models) {
        const item = document.createElement('div');
        item.className = 'setup-model-item';
        item.dataset.model = m.name;
        item.innerHTML = `
            <div class="setup-model-name">${m.name.toUpperCase()}</div>
            <div class="setup-model-desc">${m.description}</div>
            <div class="setup-model-size">${m.size}</div>
        `;
        item.addEventListener('click', () => {
            list.querySelectorAll('.setup-model-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedModel = m.name;
            customInput.value = '';
            pullBtn.disabled = false;
        });
        list.appendChild(item);
    }

    // Custom input: typing deselects curated list
    customInput.addEventListener('input', () => {
        if (customInput.value.trim()) {
            list.querySelectorAll('.setup-model-item.selected').forEach(el => el.classList.remove('selected'));
            selectedModel = null;
            pullBtn.disabled = false;
        } else {
            pullBtn.disabled = !selectedModel;
        }
    });

    // Return getter for the currently chosen model name
    return () => customInput.value.trim() || selectedModel;
}

async function pullModel(modelName) {
    const progressWrapper = document.getElementById('setupProgressWrapper');
    const progressStatus = document.getElementById('setupProgressStatus');
    const progressFill = document.getElementById('setupProgressFill');
    const progressDetail = document.getElementById('setupProgressDetail');
    const pullBtn = document.getElementById('setupPullBtn');
    const downloadStatus = document.getElementById('setupDownloadStatus');

    progressWrapper.style.display = '';
    pullBtn.disabled = true;
    progressFill.style.width = '0%';
    progressFill.classList.remove('indeterminate');
    progressStatus.textContent = 'CONNECTING...';
    progressDetail.textContent = '';
    downloadStatus.textContent = '';

    try {
        const resp = await fetch('/api/setup/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-PipBoy-Client': 'pipboy-4000' },
            body: JSON.stringify({ name: modelName }),
        });

        if (!resp.ok) {
            const err = await resp.json();
            downloadStatus.textContent = 'ERROR: ' + (err.error || 'Download failed');
            pullBtn.disabled = false;
            return false;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
                let data;
                try { data = JSON.parse(line); } catch { continue; }

                const status = data.status || '';
                progressStatus.textContent = status.toUpperCase();

                if (data.total && data.completed) {
                    const pct = Math.round((data.completed / data.total) * 100);
                    progressFill.classList.remove('indeterminate');
                    progressFill.style.width = pct + '%';
                    const completedMB = (data.completed / (1024 * 1024)).toFixed(0);
                    const totalMB = (data.total / (1024 * 1024)).toFixed(0);
                    progressDetail.textContent = `${completedMB} MB / ${totalMB} MB (${pct}%)`;
                } else {
                    // Manifest/verify phase — indeterminate
                    progressFill.classList.add('indeterminate');
                    progressFill.style.width = '';
                    progressDetail.textContent = '';
                }

                if (data.error) {
                    downloadStatus.textContent = 'ERROR: ' + data.error;
                    pullBtn.disabled = false;
                    return false;
                }
            }
        }

        progressStatus.textContent = 'DOWNLOAD COMPLETE';
        progressFill.classList.remove('indeterminate');
        progressFill.style.width = '100%';
        return true;
    } catch (err) {
        downloadStatus.textContent = 'ERROR: ' + (err.message || 'Connection failed');
        pullBtn.disabled = false;
        return false;
    }
}

async function proceedToApp() {
    hideAllSetupScreens();
    const { models, activeModel } = await loadModels();
    if (!activeModel && models.length > 0) {
        showModelSelectScreen(models);
    }
}

async function runSetupFlow() {
    const result = await checkSetupStatus();

    switch (result.status) {
        case 'not_installed':
            showSetupScreen('setupInstallOverlay');
            break;
        case 'not_running':
            showSetupScreen('setupStartOverlay');
            break;
        case 'no_models': {
            showSetupScreen('setupDownloadOverlay');
            const getModel = populateRecommendedModels(result.recommended_models || []);

            document.getElementById('setupPullBtn').onclick = async () => {
                const name = getModel();
                if (!name) return;
                const ok = await pullModel(name);
                if (ok) {
                    // Short pause so user sees "DOWNLOAD COMPLETE"
                    await new Promise(r => setTimeout(r, 800));
                    await proceedToApp();
                }
            };
            break;
        }
        case 'ready':
            await proceedToApp();
            break;
        default:
            setStatus('error', '', 'Backend not responding');
    }
}

// --- Setup button event listeners ---

document.getElementById('setupDownloadOllamaBtn').addEventListener('click', async () => {
    await fetch('/api/setup/open-download', {
        method: 'POST',
        headers: { 'X-PipBoy-Client': 'pipboy-4000' },
    });
});

document.getElementById('setupInstallCheckBtn').addEventListener('click', () => {
    runSetupFlow();
});

document.getElementById('setupStartCheckBtn').addEventListener('click', async () => {
    const status = document.getElementById('setupStartStatus');
    status.textContent = 'CHECKING...';
    await runSetupFlow();
    // If we're still on this screen, Ollama is still not running
    if (document.getElementById('setupStartOverlay').classList.contains('open')) {
        status.textContent = 'OLLAMA STILL NOT DETECTED';
    }
});

// --- Initialization ---
async function init() {
    await runSetupFlow();
}

init();
