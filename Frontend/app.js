// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// State
let currentUser = null;
let isGenerating = false;
let currentImageUrl = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const generateBtn = document.getElementById('generateBtn');
const promptInput = document.getElementById('prompt');
const negativePromptInput = document.getElementById('negativePrompt');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const stepsInput = document.getElementById('steps');
const guidanceInput = document.getElementById('guidance');
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

// Load saved API URL
const savedApiUrl = localStorage.getItem('apiUrl');
if (savedApiUrl) {
    API_CONFIG.baseUrl = savedApiUrl;
    apiUrlInput.value = savedApiUrl;
}

// Auth State Listener
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        loginScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        document.getElementById('userName').textContent = user.displayName || 'User';
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('userAvatar').textContent = user.email[0].toUpperCase();
        checkApiConnection();
    } else {
        currentUser = null;
        loginScreen.style.display = 'flex';
        mainApp.style.display = 'none';
    }
});

// Google Sign In
googleLoginBtn.addEventListener('click', async () => {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
    } catch (error) {
        console.error('Login error:', error);
        alert('Failed to sign in. Please try again.');
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await auth.signOut();
});

// Check API Connection
async function checkApiConnection() {
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/health`, {
            method: 'GET',
             headers: {
                'ngrok-skip-browser-warning': 'true' // <--- ADD THIS LINE
            },
            timeout: 5000
        });
        
        if (response.ok) {
            apiStatus.className = 'status-indicator connected';
            apiStatus.querySelector('.status-text').textContent = 'Connected';
        } else {
            throw new Error('API not responding');
        }
    } catch (error) {
        apiStatus.className = 'status-indicator error';
        apiStatus.querySelector('.status-text').textContent = 'Disconnected';
    }
}

// Save API URL
saveApiBtn.addEventListener('click', () => {
    const newUrl = apiUrlInput.value.trim();
    if (newUrl) {
        API_CONFIG.baseUrl = newUrl;
        localStorage.setItem('apiUrl', newUrl);
        checkApiConnection();
        alert('API URL saved!');
    }
});

// Refresh API Connection
refreshApiBtn.addEventListener('click', checkApiConnection);

// Generate Image
generateBtn.addEventListener('click', async () => {
    if (isGenerating || !currentUser) return;
    
    const prompt = promptInput.value.trim();
    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }
    
    isGenerating = true;
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="loading"></span> Generating...';
    
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                 'ngrok-skip-browser-warning': 'true',
                'Authorization': `Bearer ${await currentUser.getIdToken()}`
            },
            body: JSON.stringify({
                prompt: prompt,
                negative_prompt: negativePromptInput.value.trim(),
                width: parseInt(widthInput.value),
                height: parseInt(heightInput.value),
                steps: parseInt(stepsInput.value),
                guidance_scale: parseFloat(guidanceInput.value),
                seed: -1
            })
        });
        
        if (!response.ok) {
            throw new Error('Generation failed');
        }
        
        const data = await response.json();
        
        // Display image
        currentImageUrl = data.image_url;
        imageContainer.innerHTML = `
            <img src="${data.image_url}" alt="Generated Image" class="generated-image">
        `;
        
        // Update info
        document.getElementById('outputTitle').textContent = prompt.substring(0, 50) + '...';
        document.getElementById('outputCaption').textContent = prompt;
        document.getElementById('infoSeed').textContent = data.seed;
        document.getElementById('infoSteps').textContent = data.steps;
        document.getElementById('infoSize').textContent = `${data.width}x${data.height}`;
        document.getElementById('generationInfo').style.display = 'grid';
        
        // Enable buttons
        downloadBtn.disabled = false;
        copyBtn.disabled = false;
        
        // Save to Firebase
        await saveToFirestore({
            prompt: prompt,
            negative_prompt: negativePromptInput.value,
            image_url: data.image_url,
            width: parseInt(widthInput.value),
            height: parseInt(heightInput.value),
            steps: parseInt(stepsInput.value),
            guidance_scale: parseFloat(guidanceInput.value),
            seed: data.seed,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        
    } catch (error) {
        console.error('Generation error:', error);
        alert('Failed to generate image. Please check API connection and try again.');
    } finally {
        isGenerating = false;
        generateBtn.disabled = false;
        generateBtn.textContent = '🔮 Generate Image';
    }
});

// Save to Firestore
async function saveToFirestore(data) {
    try {
        await db.collection('users')
            .doc(currentUser.uid)
            .collection('generations')
            .add(data);
    } catch (error) {
        console.error('Save error:', error);
    }
}

// Download Image
downloadBtn.addEventListener('click', () => {
    if (!currentImageUrl) return;
    
    const link = document.createElement('a');
    link.href = currentImageUrl;
    link.download = `krea2_${Date.now()}.png`;
    link.click();
});

// Copy Image
copyBtn.addEventListener('click', async () => {
    if (!currentImageUrl) return;
    
    try {
        const response = await fetch(currentImageUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([
            new ClipboardItem({
                'image/png': blob
            })
        ]);
        alert('Image copied to clipboard!');
    } catch (error) {
        console.error('Copy error:', error);
        alert('Failed to copy image');
    }
});

// History
historyNav.addEventListener('click', async (e) => {
    e.preventDefault();
    await loadHistory();
    historyModal.style.display = 'flex';
});

closeHistoryBtn.addEventListener('click', () => {
    historyModal.style.display = 'none';
});

async function loadHistory() {
    try {
        const snapshot = await db.collection('users')
            .doc(currentUser.uid)
            .collection('generations')
            .orderBy('created_at', 'desc')
            .limit(20)
            .get();
        
        historyGrid.innerHTML = '';
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <img src="${data.image_url}" alt="${data.prompt}">
                <div class="history-item-info">
                    <p>${data.prompt}</p>
                </div>
            `;
            item.addEventListener('click', () => {
                currentImageUrl = data.image_url;
                imageContainer.innerHTML = `
                    <img src="${data.image_url}" alt="Generated Image" class="generated-image">
                `;
                document.getElementById('outputTitle').textContent = data.prompt.substring(0, 50) + '...';
                document.getElementById('outputCaption').textContent = data.prompt;
                document.getElementById('infoSeed').textContent = data.seed;
                document.getElementById('infoSteps').textContent = data.steps;
                document.getElementById('infoSize').textContent = `${data.width}x${data.height}`;
                document.getElementById('generationInfo').style.display = 'grid';
                downloadBtn.disabled = false;
                copyBtn.disabled = false;
                historyModal.style.display = 'none';
            });
            historyGrid.appendChild(item);
        });
        
    } catch (error) {
        console.error('Load history error:', error);
    }
}

// Ratio buttons
document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const ratio = btn.dataset.ratio;
        if (ratio === '1:1') {
            widthInput.value = 768;
            heightInput.value = 768;
        } else if (ratio === '4:3') {
            widthInput.value = 1024;
            heightInput.value = 768;
        } else if (ratio === '16:9') {
            widthInput.value = 1024;
            heightInput.value = 576;
        }
    });
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Initialize
console.log('Krea 2 Studio initialized');
