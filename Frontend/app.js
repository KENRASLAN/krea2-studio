firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null, isGenerating = false, currentImageUrl = null;

const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const generateBtn = document.getElementById('generateBtn');
const promptInput = document.getElementById('prompt');
const negativePromptInput = document.getElementById('negativePrompt');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const stepsInput = document.getElementById('steps');
const guidanceInput = document.getElementById('guidance');
const loraIdInput = document.getElementById('loraId');
const loraScaleInput = document.getElementById('loraScale');
const imageContainer = document.getElementById('imageContainer');
const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const apiUrlInput = document.getElementById('apiUrlInput');
const saveApiBtn = document.getElementById('saveApiBtn');
const apiStatus = document.getElementById('apiStatus');
const historyNav = document.getElementById('historyNav');
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyGrid = document.getElementById('historyGrid');
const refreshApiBtn = document.getElementById('refreshApiBtn');

const savedApiUrl = localStorage.getItem('apiUrl');
if (savedApiUrl) { API_CONFIG.baseUrl = savedApiUrl; apiUrlInput.value = savedApiUrl; }

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        loginScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        document.getElementById('userName').textContent = user.displayName || 'User';
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('userAvatar').textContent = user.email[0].toUpperCase();
        testConnection();
    } else {
        currentUser = null;
        loginScreen.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    try { const provider = new firebase.auth.GoogleAuthProvider(); await auth.signInWithPopup(provider); } 
    catch (error) { console.error('Login error:', error); alert('Failed to sign in.'); }
});

document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

async function testConnection() {
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/health`, {
            method: 'GET',
            headers: { 'ngrok-skip-browser-warning': 'true' },
            timeout: 5000
        });
        if (response.ok) { 
            apiStatus.className = 'status-indicator connected'; 
            apiStatus.querySelector('.status-text').textContent = 'Connected'; 
        } else { throw new Error('API not responding'); }
    } catch (error) { 
        apiStatus.className = 'status-indicator error'; 
        apiStatus.querySelector('.status-text').textContent = 'Disconnected'; 
    }
}

saveApiBtn.addEventListener('click', () => {
    const newUrl = apiUrlInput.value.trim();
    if (newUrl) { API_CONFIG.baseUrl = newUrl; localStorage.setItem('apiUrl', newUrl); testConnection(); alert('API URL saved!'); }
});

refreshApiBtn.addEventListener('click', testConnection);

generateBtn.addEventListener('click', async () => {
    if (isGenerating || !currentUser) return;
    const prompt = promptInput.value.trim();
    if (!prompt) { alert('Please enter a prompt'); return; }
    
    isGenerating = true;
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="loading"></span> Generating...';
    
    try {
        // 1. Check connection first
        const healthCheck = await fetch(`${API_CONFIG.baseUrl}/health`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        if (!healthCheck.ok) throw new Error("Backend is not responding. Check Ngrok URL.");

        // 2. Generate
        const response = await fetch(`${API_CONFIG.baseUrl}/generate`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'ngrok-skip-browser-warning': 'true', 
                'Authorization': `Bearer ${await currentUser.getIdToken()}` 
            },
            body: JSON.stringify({
                prompt: prompt, negative_prompt: negativePromptInput.value.trim(),
                width: parseInt(widthInput.value), height: parseInt(heightInput.value),
                steps: parseInt(stepsInput.value), guidance_scale: parseFloat(guidanceInput.value),
                seed: -1, lora_identifier: loraIdInput.value.trim() || null, lora_scale: parseFloat(loraScaleInput.value) || 1.0
            })
        });
        
        if (!response.ok) { 
            let errorMsg = `Server Error: ${response.status}`;
            try {
                const errData = await response.json();
                if (errData.detail) errorMsg = errData.detail;
            } catch(e) {}
            throw new Error(errorMsg); 
        }
        
        const data = await response.json();
        
        currentImageUrl = data.image_url;
        imageContainer.innerHTML = `<img src="${data.image_url}" alt="Generated Image" class="generated-image">`;
        
        document.getElementById('outputTitle').textContent = prompt.substring(0, 50) + '...';
        document.getElementById('outputCaption').textContent = prompt;
        document.getElementById('infoSeed').textContent = data.seed;
        document.getElementById('infoSteps').textContent = data.steps;
        document.getElementById('infoSize').textContent = `${data.width}x${data.height}`;
        document.getElementById('generationInfo').style.display = 'grid';
        
        downloadBtn.disabled = false; copyBtn.disabled = false;
        
        await db.collection('users').doc(currentUser.uid).collection('generations').add({
            prompt, negative_prompt: negativePromptInput.value, image_url: data.image_url,
            width: parseInt(widthInput.value), height: parseInt(heightInput.value),
            steps: parseInt(stepsInput.value), guidance_scale: parseFloat(guidanceInput.value),
            seed: data.seed, lora_identifier: loraIdInput.value.trim() || null,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) { 
        console.error('Generation error:', error); 
        alert(`Error: ${error.message}`); 
    } finally { 
        isGenerating = false; 
        generateBtn.disabled = false; 
        generateBtn.textContent = '🔮 Generate Image'; 
    }
});

downloadBtn.addEventListener('click', () => {
    if (!currentImageUrl) return;
    const link = document.createElement('a'); link.href = currentImageUrl; link.download = `krea2_${Date.now()}.png`; link.click();
});

copyBtn.addEventListener('click', async () => {
    if (!currentImageUrl) return;
    try { const response = await fetch(currentImageUrl); const blob = await response.blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); alert('Image copied!'); } 
    catch (error) { alert('Failed to copy image'); }
});

historyNav.addEventListener('click', async (e) => {
    e.preventDefault(); historyModal.style.display = 'flex';
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid).collection('generations').orderBy('created_at', 'desc').limit(20).get();
        historyGrid.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('div'); item.className = 'history-item';
            item.innerHTML = `<img src="${data.image_url}" alt="${data.prompt}"><div class="history-item-info"><p>${data.prompt}</p></div>`;
            item.addEventListener('click', () => {
                currentImageUrl = data.image_url;
                imageContainer.innerHTML = `<img src="${data.image_url}" alt="Generated Image" class="generated-image">`;
                document.getElementById('outputTitle').textContent = data.prompt.substring(0, 50) + '...';
                document.getElementById('outputCaption').textContent = data.prompt;
                document.getElementById('infoSeed').textContent = data.seed;
                document.getElementById('infoSteps').textContent = data.steps;
                document.getElementById('infoSize').textContent = `${data.width}x${data.height}`;
                document.getElementById('generationInfo').style.display = 'grid';
                downloadBtn.disabled = false; copyBtn.disabled = false; historyModal.style.display = 'none';
            });
            historyGrid.appendChild(item);
        });
    } catch (error) { console.error('Load history error:', error); }
});

closeHistoryBtn.addEventListener('click', () => { historyModal.style.display = 'none'; });
