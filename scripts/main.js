/**
 * Main application script
 */

import { AudioLoader } from './utils/audio-loader.js';
import { WaveformVisualizer } from './visualizations/waveform.js';
import { SpectrogramVisualizer } from './visualizations/spectrogram.js';

class ShazamVisualizer {
    constructor() {
        this.audioLoader = new AudioLoader();
        this.visualizers = new Map();
        this.demoAudioUrl = 'assets/demo-song.mp3';
        this.isPlaying = false;
        
        // Initialize after DOM is loaded
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Load demo audio
            await this.loadDemoAudio();
            
            // Initialize visualizers after audio is loaded
            this.initializeVisualizers();
            
            // Setup playback controls
            this.setupPlaybackControls();
            
            // Setup resize handler
            this.setupResizeHandler();
            
            // Remove loading state
            document.body.classList.remove('loading');
        } catch (error) {
            console.error('Initialization error:', error);
            this.handleError(error);
        }
    }

    /**
     * Load the demo audio file
     */
    async loadDemoAudio() {
        try {
            await this.audioLoader.loadAudio(this.demoAudioUrl);
            this.updateTotalTime();
        } catch (error) {
            console.error('Error loading demo audio:', error);
            throw error;
        }
    }

    /**
     * Initialize visualizers for different sections
     */
    initializeVisualizers() {
        if (!this.audioLoader.isLoaded) {
            console.error('Cannot initialize visualizers: Audio not loaded');
            return;
        }

        // Initialize waveform visualizer
        const waveformCanvas = document.getElementById('waveformCanvas');
        if (waveformCanvas) {
            const container = waveformCanvas.parentElement;
            const { width, height } = container.getBoundingClientRect();
            const waveformVisualizer = new WaveformVisualizer(waveformCanvas, width, height);
            this.visualizers.set('waveform', waveformVisualizer);
            waveformVisualizer.setWaveformData(this.audioLoader.getWaveformData());
        }

        // Initialize spectrogram visualizer
        const spectrogramCanvas = document.getElementById('spectrogramCanvas');
        if (spectrogramCanvas) {
            const container = spectrogramCanvas.parentElement;
            const { width, height } = container.getBoundingClientRect();
            const spectrogramVisualizer = new SpectrogramVisualizer(spectrogramCanvas, width, height);
            this.visualizers.set('spectrogram', spectrogramVisualizer);
            spectrogramVisualizer.setAudioData(this.audioLoader.getAudioData());
        }
    }

    /**
     * Set up playback controls
     */
    setupPlaybackControls() {
        const playBtn = document.getElementById('playBtn');
        const progressBar = document.getElementById('progressBar');
        const progressContainer = progressBar.parentElement;

        // Play/Pause button
        playBtn.addEventListener('click', () => {
            if (this.isPlaying) {
                this.pause();
            } else {
                this.play();
            }
        });

        // Progress bar click
        progressContainer.addEventListener('click', (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            this.seek(pos * this.audioLoader.getDuration());
        });

        // Update progress bar and waveform cursor
        const updatePlayback = () => {
            if (this.isPlaying) {
                const currentTime = this.audioLoader.getCurrentTime();
                const duration = this.audioLoader.getDuration();
                const progress = (currentTime / duration) * 100;
                
                // Update progress bar
                progressBar.style.width = `${progress}%`;
                this.updateCurrentTime(currentTime);
                
                // Update waveform and spectrogram
                const waveformVisualizer = this.visualizers.get('waveform');
                const spectrogramVisualizer = this.visualizers.get('spectrogram');
                if (waveformVisualizer) {
                    waveformVisualizer.updatePlayback(this.isPlaying, currentTime, duration);
                }
                if (spectrogramVisualizer) {
                    spectrogramVisualizer.updatePlayback(this.isPlaying, currentTime, duration);
                }
            }
            
            requestAnimationFrame(updatePlayback);
        };
        
        requestAnimationFrame(updatePlayback);
    }

    /**
     * Play audio
     */
    play() {
        if (!this.isPlaying) {
            this.audioLoader.play();
            this.isPlaying = true;
            const playBtn = document.getElementById('playBtn');
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            
            // Update waveform and spectrogram
            const waveformVisualizer = this.visualizers.get('waveform');
            const spectrogramVisualizer = this.visualizers.get('spectrogram');
            if (waveformVisualizer) {
                waveformVisualizer.updatePlayback(true, this.audioLoader.getCurrentTime(), this.audioLoader.getDuration());
            }
            if (spectrogramVisualizer) {
                spectrogramVisualizer.updatePlayback(true, this.audioLoader.getCurrentTime(), this.audioLoader.getDuration());
            }
        }
    }

    /**
     * Pause audio
     */
    pause() {
        if (this.isPlaying) {
            this.audioLoader.pause();
            this.isPlaying = false;
            const playBtn = document.getElementById('playBtn');
            playBtn.innerHTML = '<i class="fas fa-play"></i>';
            
            // Update waveform and spectrogram
            const waveformVisualizer = this.visualizers.get('waveform');
            const spectrogramVisualizer = this.visualizers.get('spectrogram');
            if (waveformVisualizer) {
                waveformVisualizer.updatePlayback(false, this.audioLoader.getCurrentTime(), this.audioLoader.getDuration());
            }
            if (spectrogramVisualizer) {
                spectrogramVisualizer.updatePlayback(false, this.audioLoader.getCurrentTime(), this.audioLoader.getDuration());
            }
        }
    }

    /**
     * Seek to position
     * @param {number} time - Time in seconds
     */
    seek(time) {
        this.audioLoader.seek(time);
        this.updateCurrentTime(time);
    }

    /**
     * Update current time display
     * @param {number} time - Current time in seconds
     */
    updateCurrentTime(time) {
        const currentTimeEl = document.getElementById('currentTime');
        currentTimeEl.textContent = this.formatTime(time);
    }

    /**
     * Update total time display
     */
    updateTotalTime() {
        const totalTimeEl = document.getElementById('totalTime');
        totalTimeEl.textContent = this.formatTime(this.audioLoader.getDuration());
    }

    /**
     * Format time in seconds to MM:SS
     * @param {number} time - Time in seconds
     * @returns {string} Formatted time
     */
    formatTime(time) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Set up window resize handler
     */
    setupResizeHandler() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            // Debounce resize events
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
    }

    /**
     * Handle window resize
     */
    handleResize() {
        this.visualizers.forEach((visualizer, type) => {
            const canvas = document.getElementById(`${type}Canvas`);
            if (canvas) {
                const container = canvas.parentElement;
                const { width, height } = container.getBoundingClientRect();
                
                visualizer.canvas.width = width;
                visualizer.canvas.height = height;
                visualizer.width = width;
                visualizer.height = height;
                
                if (type === 'waveform') {
                    visualizer.setWaveformData(this.audioLoader.getWaveformData());
                } else {
                    visualizer.setAudioData(this.audioLoader.getAudioData());
                }
            }
        });
    }

    /**
     * Handle errors
     * @param {Error} error - The error to handle
     */
    handleError(error) {
        // Add error state to body
        document.body.classList.add('error');
        
        // Show error message to user
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-message';
        errorContainer.textContent = 'Sorry, there was an error loading the visualizations. Please refresh the page to try again.';
        document.body.appendChild(errorContainer);
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.audioLoader.dispose();
        this.visualizers.forEach(visualizer => visualizer.dispose());
    }
}

// Initialize the application
window.addEventListener('DOMContentLoaded', () => {
    window.shazamVisualizer = new ShazamVisualizer();
});
