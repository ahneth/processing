// Application State
let state = {
    steps: [],          // Array of objects: { text: "...", options: ["...", ...] }
    isEnded: false,
    summary: null
};

// DOM Elements
const seedSection = document.getElementById('seedSection');
const seedText = document.getElementById('seedText');
const startBtn = document.getElementById('startBtn');

const historyContainer = document.getElementById('historyContainer');
const activePanel = document.getElementById('activePanel');
const loadingIndicator = document.getElementById('loadingIndicator');
const optionsSection = document.getElementById('optionsSection');
const optionsList = document.getElementById('optionsList');
const customInputText = document.getElementById('customInputText');
const submitCustomBtn = document.getElementById('submitCustomBtn');
const endSessionBtn = document.getElementById('endSessionBtn');

const summarySection = document.getElementById('summarySection');
const summaryContent = document.getElementById('summaryContent');
const restartBtn = document.getElementById('restartBtn');

// API Key Modal Elements
const apiKeyModal = document.getElementById('apiKeyModal');
const apiKeyBtn = document.getElementById('apiKeyBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const closeKeyBtn = document.getElementById('closeKeyBtn');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Load saved API key if present
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    } else {
        apiKeyModal.classList.remove('hidden');
    }

    setupEventListeners();
});

function setupEventListeners() {
    apiKeyBtn.addEventListener('click', () => apiKeyModal.classList.remove('hidden'));
    closeKeyBtn.addEventListener('click', () => {
        if (!localStorage.getItem('groq_api_key')) {
            alert("An API key is required to use Groq.");
            return;
        }
        apiKeyModal.classList.add('hidden');
    });
    saveKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('groq_api_key', key);
            apiKeyModal.classList.add('hidden');
        } else {
            alert('Please enter a valid API key.');
        }
    });

    startBtn.addEventListener('click', async () => {
        const text = seedText.value.trim();
        if (!text) {
            alert('Please enter a starting sentence or paragraph.');
            return;
        }
        await addStep(text);
        seedText.value = '';
        seedSection.classList.add('hidden');
    });

    submitCustomBtn.addEventListener('click', async () => {
        const text = customInputText.value.trim();
        if (!text) {
            alert('Please enter your custom continuation.');
            return;
        }
        customInputText.value = '';
        await addStep(text);
    });

    endSessionBtn.addEventListener('click', async () => {
        await finishAndSummarize();
    });

    restartBtn.addEventListener('click', () => {
        state = { steps: [], isEnded: false, summary: null };
        summarySection.classList.add('hidden');
        seedSection.classList.remove('hidden');
        historyContainer.innerHTML = '';
        activePanel.classList.add('hidden');
    });
}

// Groq API Caller
async function callGroqAPI(promptText, systemPrompt, isJson = false) {
    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) {
        apiKeyModal.classList.remove('hidden');
        throw new Error("Groq API Key is missing.");
    }

    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: promptText }
        ],
        temperature: 0.7
    };

    if (isJson) {
        body.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Groq API Error: ${errData}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Add a new step to the path and fetch subsequent options
async function addStep(text) {
    // Push new step
    state.steps.push({ text, options: [] });
    renderHistory();
    
    // Show loading state in active panel
    activePanel.classList.remove('hidden');
    loadingIndicator.classList.remove('hidden');
    optionsSection.classList.add('hidden');

    try {
        const fullContext = state.steps.map(s => s.text).join(" ");
        const systemPrompt = `You are a creative brainstorming assistant. The user will provide a running body of text. Your task is to provide exactly 5 distinct, highly diverse ways to continue the thought or story. Each continuation should be 1-3 sentences long. 
You must respond in valid JSON matching this schema:
{ "options": ["option 1", "option 2", "option 3", "option 4", "option 5"] }`;

        const jsonString = await callGroqAPI(fullContext, systemPrompt, true);
        const parsed = JSON.parse(jsonString);

        if (parsed.options && Array.isArray(parsed.options)) {
            state.steps[state.steps.length - 1].options = parsed.options;
        } else {
            throw new Error("Invalid format received from LLM.");
        }
    } catch (error) {
        console.error(error);
        alert("Failed to generate options: " + error.message);
        // Fallback dummy options if API fails
        state.steps[state.steps.length - 1].options = [
            "This opened up entirely unexpected avenues of exploration.",
            "Further analysis revealed deeper underlying principles.",
            "A sudden shift in perspective changed everything.",
            "They decided to pause and reevaluate the core assumption.",
            "The consequences began to ripple outward rapidly."
        ];
    } finally {
        loadingIndicator.classList.add('hidden');
        optionsSection.classList.remove('hidden');
        renderActiveOptions();
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
}

// Redo/Branch from a specific step index
async function redoFromStep(index) {
    // Truncate state up to this step
    state.steps = state.steps.slice(0, index + 1);
    state.isEnded = false;
    summarySection.classList.add('hidden');
    
    renderHistory();
    
    // Set active panel options to this step's pre-existing options
    activePanel.classList.remove('hidden');
    loadingIndicator.classList.add('hidden');
    optionsSection.classList.remove('hidden');
    renderActiveOptions();
    
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// Render the top-down history nodes
function renderHistory() {
    historyContainer.innerHTML = '';
    
    // Render all steps except the active latest one (which is shown in the active panel)
    // Or render all of them with a Redo button so users can jump back to any point!
    state.steps.forEach((step, idx) => {
        const node = document.createElement('div');
        node.className = 'history-node';
        node.innerHTML = `
            <div class="node-header">
                <span class="node-step-tag">Step ${idx + 1}</span>
                <button class="redo-btn" onclick="redoFromStep(${idx})">✏️ Redo / Branch here</button>
            </div>
            <div class="node-content">${escapeHTML(step.text)}</div>
        `;
        historyContainer.appendChild(node);
    });
}

// Render the 5 option buttons for the current active step
function renderActiveOptions() {
    optionsList.innerHTML = '';
    const currentStep = state.steps[state.steps.length - 1];
    
    if (!currentStep || !currentStep.options) return;

    currentStep.options.forEach((optText) => {
        const btn = document.createElement('button');
        btn.className = 'option-card';
        btn.textContent = optText;
        btn.addEventListener('click', async () => {
            await addStep(optText);
        });
        optionsList.appendChild(btn);
    });
}

// Finish session and generate summary & recommendations
async function finishAndSummarize() {
    if (state.steps.length === 0) return;

    activePanel.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');

    try {
        const fullText = state.steps.map(s => s.text).join(" ");
        const systemPrompt = `You are an analytical assistant. The user has finished building a thought process or story. Review the provided text path. Provide a concise 3-sentence summary of the core themes, followed by 3 specific, actionable recommendations or logical next steps based on the content. Format the output cleanly with clear section headings.`;

        const summaryText = await callGroqAPI(fullText, systemPrompt, false);
        
        state.isEnded = true;
        summaryContent.innerHTML = formatMarkdown(summaryText);
        summarySection.classList.remove('hidden');
        historyContainer.innerHTML = ''; // Clear history feed since it's summarized
        
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (error) {
        console.error(error);
        alert("Failed to generate summary: " + error.message);
        activePanel.classList.remove('hidden');
    } finally {
        loadingIndicator.classList.add('hidden');
    }
}

// Simple HTML Escaper
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Basic markdown formatting helper for summary output
function formatMarkdown(text) {
    return escapeHTML(text)
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}
