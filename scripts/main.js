/**
 * Main application script using Wavesurfer.js for audio visualization
 */

import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js';
import Spectrogram from 'https://unpkg.com/wavesurfer.js@7/dist/plugins/spectrogram.esm.js';
import { AudioLoader } from './utils/audio-loader.js';
import ConstellationPlugin from './plugins/constellation.js';

class ShazamVisualizer {
    constructor() {
        // Audio setup
        this.audioLoader = new AudioLoader();
        this.isPlaying = false;
        this.startTime = 0;
        
        // Create shared audio element
        this.audioElement = document.createElement('audio');
        this.audioElement.controls = false;
        
        // Initialize main waveform
        this.waveform = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4a9eff',
            progressColor: '#1e88e5',
            height: 128,
            normalize: true,
            media: this.audioElement
        });

        // Initialize spectrogram waveform
        this.spectrogramWaveform = WaveSurfer.create({
            container: '#spectrogram-waveform',
            waveColor: '#4a9eff',
            progressColor: '#1e88e5',
            height: 80,
            normalize: true,
            media: this.audioElement
        });

        this.spectrogramWaveform.once('interaction', () => {
            this.spectrogramWaveform.play()
  })

        // Initialize the Spectrogram plugin
        this.spectrogramWaveform.registerPlugin(
            Spectrogram.create({
                labels: true,
                height: 200,
                scale: 'linear',
                fftSamples: 1024,
                labelsBackground: 'rgba(0, 0, 0, 0.1)',
                container: '#spectrogram'
            })
        );

        // Initialize constellation waveform and spectrogram
        this.constellationWaveform = WaveSurfer.create({
            container: '#constellation-waveform',
            waveColor: '#4a9eff',
            progressColor: '#1e88e5',
            height: 80,
            normalize: true,
            media: this.audioElement
        });

        // Initialize constellation spectrogram with plugin
        this.constellationWaveform.registerPlugin(
            Spectrogram.create({
                labels: true,
                height: 200,
                scale: 'linear',
                fftSamples: 1024,
                labelsBackground: 'rgba(0, 0, 0, 0.1)',
                container: '#constellation-spectrogram'
            })
        );

        // Initialize constellation plugin
        this.constellationWaveform.registerPlugin(
            ConstellationPlugin.create({
                minPeakMagnitude: 0.25,    // Base threshold, will be adjusted dynamically
                maxDistance: 30,
                maxTimeDistance: 50,
                peakColor: 'white',
                peakRadius: 2,
                connectionColor: 'rgba(255, 255, 0, 0.2)',
                connectionWidth: 1
            })
        );

        // Sync constellation waveform with main waveform
        this.waveform.on('play', () => {
            if (!this.spectrogramWaveform.isPlaying()) {
                this.spectrogramWaveform.play();
            }
            if (!this.constellationWaveform.isPlaying()) {
                this.constellationWaveform.play();
            }
        });
        
        this.waveform.on('pause', () => {
            if (this.spectrogramWaveform.isPlaying()) {
                this.spectrogramWaveform.pause();
            }
            if (this.constellationWaveform.isPlaying()) {
                this.constellationWaveform.pause();
            }
        });

        // UI elements
        this.playBtn = document.getElementById('playBtn');
        this.progressBar = document.getElementById('progressBar');
        this.currentTimeSpan = document.getElementById('currentTime');
        this.totalTimeSpan = document.getElementById('totalTime');
        this.songSelect = document.getElementById('songSelect');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial song
        this.loadSelectedSong();
    }

    setupEventListeners() {
        this.playBtn.addEventListener('click', () => this.togglePlayback());
        this.songSelect.addEventListener('change', () => this.loadSelectedSong());
        
        // Wavesurfer events
        this.waveform.on('ready', () => {
            document.body.classList.remove('loading');
            this.updateTotalTime();
        });
        
        this.waveform.on('audioprocess', () => {
            this.updateCurrentTime();
            this.updateProgressBar();
        });
        
        this.waveform.on('finish', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });
    }

    togglePlayback() {
        if (this.waveform.isPlaying()) {
            this.waveform.pause();
            this.isPlaying = false;
        } else {
            this.waveform.play();
            this.isPlaying = true;
        }
        this.updatePlayButton();
    }

    updatePlayButton() {
        const icon = this.playBtn.querySelector('i');
        icon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
    }

    async loadSelectedSong() {
        document.body.classList.add('loading');
        const selectedSong = this.songSelect.value;

        // Clear constellation dots
        const constellationPlugin = this.constellationWaveform.getActivePlugins().find(p => p.name === 'constellation')
        if (constellationPlugin) {
            constellationPlugin.clear()
        }

        await Promise.all([this.waveform.load(selectedSong), this.spectrogramWaveform.load(selectedSong), this.constellationWaveform.load(selectedSong)]);
        
        // Update song title
        const songTitle = this.songSelect.options[this.songSelect.selectedIndex].text;
        document.querySelector('.song-title').textContent = songTitle;
    }

    updateCurrentTime() {
        const currentTime = this.waveform.getCurrentTime();
        this.currentTimeSpan.textContent = this.formatTime(currentTime);
    }

    updateTotalTime() {
        const duration = this.waveform.getDuration();
        this.totalTimeSpan.textContent = this.formatTime(duration);
    }

    updateProgressBar() {
        const progress = (this.waveform.getCurrentTime() / this.waveform.getDuration()) * 100;
        this.progressBar.style.width = `${progress}%`;
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

// Initialize when the page loads
window.addEventListener('load', () => {
    new ShazamVisualizer();
});
