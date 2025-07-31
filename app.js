import { WebsimSocket } from 'https://esm.websim.com/@websim/websim-socket';

class VoiceLabs {
    constructor() {
        this.room = new WebsimSocket();
        this.currentUser = null;
        this.voices = [];
        /* @tweakable max voices to display in community library */
        this.maxCommunityVoices = 50;
        /* @tweakable debounce time for search in milliseconds */
        this.searchDebounceTime = 300;
        /* @tweakable timeout for voice loading in milliseconds */
        this.loadTimeout = 5000;
        this.init();
    }

    async init() {
        // Get current user
        try {
            const user = await window.websim.getCurrentUser();
            this.currentUser = user;
        } catch (error) {
            console.error('Error getting current user:', error);
        }

        // Initialize tabs
        this.setupTabs();
        this.setupEventListeners();
        this.loadVoices();
        this.loadCommunityVoices(); // Add this line
    }

    setupTabs() {
        const navBtns = document.querySelectorAll('.nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    setupEventListeners() {
        // File upload
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        // Voice cloning
        document.getElementById('clone-btn').addEventListener('click', () => {
            this.cloneVoice();
        });

        // TTS generation
        document.getElementById('generate-tts').addEventListener('click', () => {
            this.generateTTS();
        });

        // Speed and pitch controls
        const speedSlider = document.getElementById('speed-slider');
        const pitchSlider = document.getElementById('pitch-slider');
        speedSlider.addEventListener('input', (e) => {
            document.getElementById('speed-value').textContent = `${e.target.value}x`;
        });
        pitchSlider.addEventListener('input', (e) => {
            document.getElementById('pitch-value').textContent = `${e.target.value}x`;
        });

        // Download audio
        document.getElementById('download-audio').addEventListener('click', () => {
            this.downloadAudio();
        });

        // Add community tab listeners
        document.getElementById('community-search').addEventListener('input', 
            this.debounce(this.filterCommunityVoices.bind(this), this.searchDebounceTime)
        );
        document.getElementById('language-filter').addEventListener('change', 
            this.filterCommunityVoices.bind(this)
        );
    }

    /* @tweakable debounce helper for search filtering */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async loadCommunityVoices() {
        try {
            /* @tweakable fetch limit for community voices */
            const fetchLimit = 100;
            const voices = await this.room.collection('voices')
                .filter({ is_public: true })
                .getList();
            
            this.communityVoices = voices.reverse().slice(0, this.maxCommunityVoices);
            this.renderCommunityVoices(this.communityVoices);
        } catch (error) {
            console.error('Error loading community voices:', error);
        }
    }

    filterCommunityVoices() {
        const searchTerm = document.getElementById('community-search').value.toLowerCase();
        const languageFilter = document.getElementById('language-filter').value;
        
        let filtered = this.communityVoices.filter(voice => {
            const matchesSearch = voice.name.toLowerCase().includes(searchTerm) || 
                                (voice.description && voice.description.toLowerCase().includes(searchTerm));
            const matchesLanguage = !languageFilter || voice.language === languageFilter;
            
            return matchesSearch && matchesLanguage;
        });

        this.renderCommunityVoices(filtered);
    }

    renderCommunityVoices(voices) {
        const grid = document.getElementById('community-grid');
        const count = document.getElementById('community-voice-count');

        if (voices.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎙️</div>
                    <h3>No community voices found</h3>
                    <p>Voices published to the community will appear here</p>
                </div>
            `;
            count.textContent = '0 voices';
            return;
        }

        grid.innerHTML = '';
        voices.forEach(voice => {
            const card = document.createElement('div');
            card.className = 'community-voice-card';
            card.innerHTML = `
                <div class="community-voice-header">
                    <h3>${voice.name}</h3>
                    <span class="community-voice-creator">
                        by <a href="https://websim.com/@${voice.creator_username}" target="_blank">
                            @${voice.creator_username}
                        </a>
                    </span>
                </div>
                <p>${voice.description || 'No description'}</p>
                <div class="community-voice-stats">
                    <span>${voice.samples_count} samples</span>
                    <span>${voice.language.toUpperCase()}</span>
                    <span>${new Date(voice.created_at).toLocaleDateString()}</span>
                </div>
            `;
            grid.appendChild(card);
        });

        count.textContent = `${voices.length} voice${voices.length !== 1 ? 's' : ''}`;
    }

    handleFiles(files) {
        const validFiles = Array.from(files).filter(file => file.type.startsWith('audio/'));
        if (validFiles.length === 0) {
            this.showNotification('Please upload valid audio files', 'error');
            return;
        }

        // Store files for processing
        this.audioFiles = validFiles;
        this.showNotification(`${validFiles.length} audio files loaded`, 'success');
    }

    async cloneVoice() {
        const name = document.getElementById('voice-name').value.trim();
        const description = document.getElementById('voice-desc').value.trim();
        const language = document.getElementById('voice-lang').value;
        const publishToCommunity = document.getElementById('publish-to-community').checked; // Add this line

        if (!name || !this.audioFiles || this.audioFiles.length === 0) {
            this.showNotification('Please provide a name and upload audio files', 'error');
            return;
        }

        const cloneBtn = document.getElementById('clone-btn');
        const btnText = cloneBtn.querySelector('.btn-text');
        const spinner = cloneBtn.querySelector('.loading-spinner');

        // Show loading state
        btnText.textContent = 'Cloning...';
        spinner.classList.remove('hidden');
        cloneBtn.disabled = true;

        /* @tweakable delay before showing cloned voice in library (ms) */
        const refreshDelay = 1000;

        try {
            // Upload audio files
            const uploadedUrls = [];
            for (const file of this.audioFiles) {
                const url = await websim.upload(file);
                uploadedUrls.push(url);
            }

            // Create voice record
            const voice = await this.room.collection('voices').create({
                name,
                description,
                language,
                audio_files: uploadedUrls,
                samples_count: this.audioFiles.length,
                created_at: new Date().toISOString(),
                is_public: publishToCommunity, // Add this line
                creator_username: this.currentUser?.username // Add this line
            });

            setTimeout(() => {
                this.voices.push(voice);
                this.updateVoiceLibrary();
                this.updateVoiceSelect();
                
                // If published to community, refresh community view
                if (publishToCommunity) {
                    this.loadCommunityVoices();
                }
            }, refreshDelay);

            this.showNotification('Voice cloned successfully!', 'success');

            // Reset form
            document.getElementById('voice-name').value = '';
            document.getElementById('voice-desc').value = '';
            document.getElementById('publish-to-community').checked = true; // Reset checkbox
            this.audioFiles = null;

        } catch (error) {
            console.error('Error cloning voice:', error);
            this.showNotification('Error cloning voice', 'error');
        } finally {
            btnText.textContent = 'Clone Voice';
            spinner.classList.add('hidden');
            cloneBtn.disabled = false;
        }
    }

    async loadVoices() {
        try {
            const voices = await this.room.collection('voices').getList();
            this.voices = voices;
            this.updateVoiceLibrary();
            this.updateVoiceSelect();
        } catch (error) {
            console.error('Error loading voices:', error);
        }
    }

    updateVoiceLibrary() {
        const grid = document.getElementById('voice-grid');
        const count = document.getElementById('voice-count');

        if (this.voices.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎙️</div>
                    <h3>No voices cloned yet</h3>
                    <p>Start by uploading voice samples in the Clone tab</p>
                </div>
            `;
            count.textContent = '0 voices';
            return;
        }

        grid.innerHTML = '';
        this.voices.forEach(voice => {
            const card = document.createElement('div');
            card.className = 'voice-card';
            card.innerHTML = `
                <h3>${voice.name}</h3>
                <p>${voice.description || 'No description'}</p>
                <div class="voice-stats">
                    <span>${voice.samples_count} samples</span>
                    <span>${voice.language.toUpperCase()}</span>
                    <span>${new Date(voice.created_at).toLocaleDateString()}</span>
                </div>
            `;
            grid.appendChild(card);
        });

        count.textContent = `${this.voices.length} voice${this.voices.length !== 1 ? 's' : ''}`;
    }

    updateVoiceSelect() {
        const select = document.getElementById('voice-select');
        select.innerHTML = '<option value="">Choose a cloned voice...</option>';
        
        this.voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            select.appendChild(option);
        });
    }

    async generateTTS() {
        const voiceId = document.getElementById('voice-select').value;
        const text = document.getElementById('tts-text').value.trim();
        const speed = document.getElementById('speed-slider').value;
        const pitch = document.getElementById('pitch-slider').value;

        if (!voiceId || !text) {
            this.showNotification('Please select a voice and enter text', 'error');
            return;
        }

        const generateBtn = document.getElementById('generate-tts');
        const btnText = generateBtn.querySelector('.btn-text');
        const spinner = generateBtn.querySelector('.loading-spinner');

        // Show loading state
        btnText.textContent = 'Generating...';
        spinner.classList.remove('hidden');
        generateBtn.disabled = true;

        try {
            const voice = this.voices.find(v => v.id === voiceId);
            if (!voice) {
                throw new Error('Voice not found');
            }

            // Generate TTS using websim's TTS service
            const result = await websim.textToSpeech({
                text,
                /* @tweakable fallback voice when cloned voice isn't available */
                voice: 'en-male',
                speed: parseFloat(speed),
                pitch: parseFloat(pitch)
            });

            // Store the generated audio
            const audioUrl = result.url;
            const audioElement = document.getElementById('tts-audio');
            audioElement.src = audioUrl;
            audioElement.load();

            // Show audio player
            document.getElementById('audio-player').classList.remove('hidden');

            // Save to library
            await this.room.collection('tts_syntheses').create({
                voice_id: voiceId,
                text,
                audio_url: audioUrl,
                speed,
                pitch,
                voice_name: voice.name,
                created_at: new Date().toISOString()
            });

            this.showNotification('TTS generated successfully!', 'success');

        } catch (error) {
            console.error('Error generating TTS:', error);
            this.showNotification('Error generating TTS', 'error');
        } finally {
            btnText.textContent = 'Generate Speech';
            spinner.classList.add('hidden');
            generateBtn.disabled = false;
        }
    }

    downloadAudio() {
        const audio = document.getElementById('tts-audio');
        const link = document.createElement('a');
        link.href = audio.src;
        link.download = 'voice-labs-tts.mp3';
        link.click();
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        /* @tweakable notification auto-dismiss time in milliseconds */
        const dismissTime = 5000;
        
        setTimeout(() => {
            notification.remove();
        }, dismissTime);
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new VoiceLabs();
});