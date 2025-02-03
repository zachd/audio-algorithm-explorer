/**
 * Main application script
 */

import { AudioLoader } from './utils/audio-loader.js';
import { WaveformVisualizer } from './visualizations/waveform.js';
import { SpectrogramVisualizer } from './visualizations/spectrogram.js';
import { ConstellationVisualizer } from './visualizations/constellation.js';
import { FingerprintVisualizer } from './visualizations/fingerprint.js';

class ShazamVisualizer {
    constructor() {
        // Audio setup
        this.audioLoader = new AudioLoader();
        this.isPlaying = false;
        this.startTime = 0;
        this.audioContext = null;
        this.audioSource = null;

        // Visualizations
        this.waveformVisualizer = new WaveformVisualizer(
            document.getElementById('waveformCanvas'),
            800, 300
        );
        
        this.spectrogramVisualizer = new SpectrogramVisualizer(
            document.getElementById('spectrogramCanvas'),
            800, 300
        );

        this.constellationVisualizer = new ConstellationVisualizer(
            document.getElementById('constellationCanvas'),
            800, 300
        );

        this.fingerprintVisualizer = new FingerprintVisualizer(
            document.querySelector('[data-type="constellation"]'),
            800, 300
        );

        // UI elements
        this.playBtn = document.getElementById('playBtn');
        this.progressBar = document.getElementById('progressBar');
        this.currentTimeSpan = document.getElementById('currentTime');
        this.totalTimeSpan = document.getElementById('totalTime');
        
        // Bind event handlers
        this.playBtn.addEventListener('click', () => this.togglePlayback());
        document.getElementById('progressBar').parentElement.addEventListener('click', (e) => this.seekAudio(e));
        document.getElementById('nextAnchorBtn')?.addEventListener('click', () => this.fingerprintVisualizer.nextAnchor());
        
        // Load default audio
        this.loadAudio('assets/demo-song.mp3');
    }

    async loadAudio(url) {
        document.body.classList.add('loading');
        try {
            await this.audioLoader.loadAudio(url);
            
            // Get raw audio data for processing
            const audioData = this.audioLoader.getAudioData();
            
            // Initialize visualizers with audio data
            this.waveformVisualizer.setWaveformData(this.audioLoader.getWaveformData());
            this.spectrogramVisualizer.setAudioData(audioData);
            this.constellationVisualizer.setAudioData(audioData);
            this.fingerprintVisualizer.setAudioData(audioData);
            
            // Update UI
            this.updateTimeDisplay(0, this.audioLoader.getDuration());
            document.body.classList.remove('loading');
        } catch (error) {
            console.error('Error loading audio:', error);
            document.body.classList.remove('loading');
        }
    }

    togglePlayback() {
        if (!this.audioLoader.isLoaded) return;
        
        if (this.isPlaying) {
            this.pauseAudio();
        } else {
            this.playAudio();
        }
    }

    async playAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (!this.audioSource) {
            this.audioSource = this.audioContext.createBufferSource();
            this.audioSource.buffer = this.audioLoader.audioBuffer;
            this.audioSource.connect(this.audioContext.destination);
            
            this.startTime = this.audioContext.currentTime - (this.currentTime || 0);
            this.audioSource.start(0, this.currentTime || 0);
            
            this.audioSource.onended = () => {
                if (this.isPlaying) {
                    this.pauseAudio();
                    this.currentTime = 0;
                    this.updateTimeDisplay(0, this.audioLoader.getDuration());
                }
            };
        }

        this.isPlaying = true;
        this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        this.startPlaybackAnimation();
    }

    pauseAudio() {
        if (this.audioSource) {
            this.audioSource.stop();
            this.audioSource = null;
        }
        this.isPlaying = false;
        this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        this.currentTime = this.audioContext ? this.audioContext.currentTime - this.startTime : 0;
        this.cancelAnimation();
    }

    seekAudio(event) {
        if (!this.audioLoader.isLoaded) return;
        
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const ratio = x / rect.width;
        const time = ratio * this.audioLoader.getDuration();
        
        if (this.isPlaying) {
            this.pauseAudio();
            this.currentTime = time;
            this.playAudio();
        } else {
            this.currentTime = time;
            this.updateTimeDisplay(time, this.audioLoader.getDuration());
            this.updateVisualizers(time, this.audioLoader.getDuration());
        }
    }

    startPlaybackAnimation() {
        this.cancelAnimation();
        
        let lastFrameTime = 0;
        const minFrameInterval = 1000 / 30; // Cap at 30 FPS
        
        const animate = (timestamp) => {
            if (!this.isPlaying) return;
            
            // Throttle frame rate
            const elapsed = timestamp - lastFrameTime;
            if (elapsed < minFrameInterval) {
                this.animationFrame = requestAnimationFrame(animate);
                return;
            }
            lastFrameTime = timestamp;
            
            const currentTime = this.audioContext.currentTime - this.startTime;
            const duration = this.audioLoader.getDuration();
            
            // Only update if time has changed
            if (currentTime !== this.lastUpdateTime) {
                this.updateTimeDisplay(currentTime, duration);
                this.updateVisualizers(currentTime, duration);
                this.lastUpdateTime = currentTime;
            }
            
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        this.animationFrame = requestAnimationFrame(animate);
    }

    updateVisualizers(currentTime, duration) {
        this.waveformVisualizer.updatePlayback(this.isPlaying, currentTime, duration);
        this.spectrogramVisualizer.updatePlayback(this.isPlaying, currentTime, duration);
        this.constellationVisualizer.updatePlayback(this.isPlaying, currentTime, duration);
        this.fingerprintVisualizer.updatePlayback(this.isPlaying, currentTime, duration);
    }

    updateTimeDisplay(currentTime, duration) {
        this.currentTimeSpan.textContent = this.formatTime(currentTime);
        this.totalTimeSpan.textContent = this.formatTime(duration);
        this.progressBar.style.width = `${(currentTime / duration) * 100}%`;
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    cancelAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
}

// Initialize when the page loads
window.addEventListener('load', () => {
    new ShazamVisualizer();
});
