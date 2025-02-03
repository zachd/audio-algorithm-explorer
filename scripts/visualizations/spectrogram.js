/**
 * Spectrogram visualization module
 */

import { CanvasUtils } from '../utils/canvas.js';

export class SpectrogramVisualizer {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        this.setupCanvas();
        
        // FFT parameters
        this.fftSize = 2048;
        this.frequencyBinCount = this.fftSize / 2;
        this.minDecibels = -90;
        this.maxDecibels = -20;
        
        // Visualization state
        this.audioData = null;
        this.spectrogramData = [];
        this.colorScale = this.generateColorScale();
        
        // Playback state
        this.isPlaying = false;
        this.playbackTime = 0;
        this.duration = 0;
        this.animationFrame = null;

        // Create separate canvas for spectrogram
        this.spectrogramCanvas = document.createElement('canvas');
        this.spectrogramCanvas.width = width;
        this.spectrogramCanvas.height = height;
        this.spectrogramCtx = this.spectrogramCanvas.getContext('2d');
    }

    /**
     * Set up the canvas with high DPI support
     */
    setupCanvas() {
        const { ctx, dpr } = CanvasUtils.setupHighDPICanvas(this.canvas, this.width, this.height);
        this.ctx = ctx;
        this.dpr = dpr;
    }

    /**
     * Generate a color scale for the spectrogram
     * Returns an array of color values for the heat map
     */
    generateColorScale() {
        const colors = [];
        for (let i = 0; i < 256; i++) {
            // Create a more dramatic color scale
            if (i < 64) {  // First quarter: black to deep purple
                const val = Math.floor((i / 64) * 128);
                colors.push(`rgb(${val},0,${val * 2})`);
            } else if (i < 128) {  // Second quarter: purple to red
                const val = Math.floor(((i - 64) / 64) * 255);
                colors.push(`rgb(${val},0,255)`);
            } else if (i < 192) {  // Third quarter: red to orange
                const val = Math.floor(((i - 128) / 64) * 255);
                colors.push(`rgb(255,${val},${255 - val})`);
            } else {  // Final quarter: orange to yellow
                const val = Math.floor(((i - 192) / 64) * 255);
                colors.push(`rgb(255,255,${val})`);
            }
        }
        return colors;
    }

    /**
     * Process audio data to create spectrogram
     * @param {Float32Array} audioData - Raw audio data
     */
    setAudioData(audioData) {
        this.audioData = audioData;
        this.processSpectrogramData();
        this.drawSpectrogram();
        this.draw();
    }

    /**
     * Process the audio data into spectrogram data using FFT
     */
    processSpectrogramData() {
        const fft = new FFT(this.fftSize);
        const hopSize = Math.floor(this.fftSize / 4); // 75% overlap
        const numFrames = Math.floor((this.audioData.length - this.fftSize) / hopSize);
        
        this.spectrogramData = [];
        
        // Find global max for normalization
        let globalMax = this.maxDecibels;
        let globalMin = this.minDecibels;
        
        // First pass: compute all magnitudes and find global min/max
        const tempData = [];
        for (let i = 0; i < numFrames; i++) {
            const frame = this.audioData.slice(i * hopSize, i * hopSize + this.fftSize);
            const windowed = this.applyWindow(frame);
            const spectrum = fft.forward(windowed);
            
            const magnitudes = new Float32Array(this.frequencyBinCount);
            for (let j = 0; j < this.frequencyBinCount; j++) {
                const re = spectrum[j * 2];
                const im = spectrum[j * 2 + 1];
                const magnitude = Math.sqrt(re * re + im * im);
                const decibels = 20 * Math.log10(magnitude + 1e-6);
                magnitudes[j] = Math.max(this.minDecibels, Math.min(this.maxDecibels, decibels));
            }
            tempData.push(magnitudes);
        }
        
        // Second pass: normalize and store
        const range = globalMax - globalMin;
        for (const magnitudes of tempData) {
            const normalizedMagnitudes = new Float32Array(this.frequencyBinCount);
            for (let j = 0; j < this.frequencyBinCount; j++) {
                // Normalize to [0, 1] range with exponential scaling for better contrast
                const normalized = (magnitudes[j] - globalMin) / range;
                normalizedMagnitudes[j] = Math.pow(normalized, 1.5); // Exponential scaling
            }
            this.spectrogramData.push(normalizedMagnitudes);
        }
    }

    /**
     * Apply Hann window to reduce spectral leakage
     */
    applyWindow(frame) {
        const windowed = new Float32Array(frame.length);
        for (let i = 0; i < frame.length; i++) {
            const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frame.length - 1)));
            windowed[i] = frame[i] * windowValue;
        }
        return windowed;
    }

    /**
     * Draw the spectrogram to the offscreen canvas
     */
    drawSpectrogram() {
        if (!this.spectrogramData.length) return;

        this.spectrogramCtx.clearRect(0, 0, this.width, this.height);
        
        const timeStep = this.width / this.spectrogramData.length;
        const freqStep = this.height / (this.frequencyBinCount / 4); // Only show up to Nyquist/2
        
        // Draw each time-frequency bin
        for (let t = 0; t < this.spectrogramData.length; t++) {
            const spectrum = this.spectrogramData[t];
            
            for (let f = 0; f < this.frequencyBinCount / 4; f++) {
                const magnitude = spectrum[f];
                // Map normalized magnitude [0,1] to color index [0,255]
                const colorIndex = Math.floor(magnitude * 255);
                const color = this.colorScale[Math.max(0, Math.min(255, colorIndex))];
                
                this.spectrogramCtx.fillStyle = color;
                this.spectrogramCtx.fillRect(
                    t * timeStep,
                    f * freqStep, // Changed: now drawing from top to bottom
                    Math.ceil(timeStep),
                    Math.ceil(freqStep)
                );
            }
        }

        // Add frequency labels
        this.spectrogramCtx.fillStyle = '#ffffff';
        this.spectrogramCtx.font = '12px Arial';
        this.spectrogramCtx.textAlign = 'right';
        
        const sampleRate = 44100; // Standard sample rate
        const freqLabels = [
            { freq: 20000, label: '20 KHz' },
            { freq: 15000, label: '15 KHz' },
            { freq: 10000, label: '10 KHz' },
            { freq: 5000, label: '5 KHz' },
            { freq: 1000, label: '1 KHz' },
            { freq: 500, label: '500 Hz' },
            { freq: 100, label: '100 Hz' }
        ];

        freqLabels.forEach(({ freq, label }) => {
            const binIndex = Math.floor((freq / sampleRate) * this.fftSize);
            if (binIndex < this.frequencyBinCount / 4) {
                const y = (binIndex / (this.frequencyBinCount / 4)) * this.height;
                this.spectrogramCtx.fillText(label, this.width - 10, y + 4);
            }
        });
    }

    /**
     * Draw the main canvas (spectrogram + cursor)
     */
    draw() {
        // Clear main canvas
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw spectrogram from offscreen canvas
        this.ctx.drawImage(this.spectrogramCanvas, 0, 0);

        // Draw playback cursor if duration is set
        if (this.duration > 0) {
            const cursorX = (this.playbackTime / this.duration) * this.width;
            
            // Draw cursor line
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#ff0088';
            this.ctx.lineWidth = 2;
            this.ctx.moveTo(cursorX, 0);
            this.ctx.lineTo(cursorX, this.height);
            this.ctx.stroke();

            // Draw cursor handle
            this.ctx.fillStyle = '#ff0088';
            this.ctx.beginPath();
            this.ctx.arc(cursorX, 10, 5, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }

    /**
     * Update playback state
     * @param {boolean} isPlaying - Whether audio is playing
     * @param {number} currentTime - Current playback time in seconds
     * @param {number} duration - Total duration in seconds
     */
    updatePlayback(isPlaying, currentTime, duration) {
        this.isPlaying = isPlaying;
        this.playbackTime = currentTime;
        this.duration = duration;

        if (isPlaying && !this.animationFrame) {
            this.startPlaybackAnimation();
        } else if (!isPlaying) {
            this.cancelAnimation();
            this.draw(); // Ensure final position is drawn when paused
        }
    }

    /**
     * Cancel any ongoing animation
     */
    cancelAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Start the playback animation loop
     */
    startPlaybackAnimation() {
        this.cancelAnimation();
        
        const animate = () => {
            this.draw();
            if (this.isPlaying) {
                this.animationFrame = requestAnimationFrame(animate);
            }
        };
        
        this.animationFrame = requestAnimationFrame(animate);
    }
}

/**
 * Simple FFT implementation
 */
class FFT {
    constructor(size) {
        this.size = size;
        this.reverseTable = new Uint32Array(size);
        this.sinTable = new Float64Array(size);
        this.cosTable = new Float64Array(size);
        this.initialize();
    }

    initialize() {
        // Build reverse table
        let limit = 1;
        let bit = this.size >> 1;
        
        while (limit < this.size) {
            for (let i = 0; i < limit; i++) {
                this.reverseTable[i + limit] = this.reverseTable[i] + bit;
            }
            limit = limit << 1;
            bit = bit >> 1;
        }

        // Build trig tables
        for (let i = 0; i < this.size; i++) {
            const angle = -2 * Math.PI * i / this.size;
            this.sinTable[i] = Math.sin(angle);
            this.cosTable[i] = Math.cos(angle);
        }
    }

    forward(buffer) {
        const real = new Float64Array(this.size);
        const imag = new Float64Array(this.size);
        
        // Copy input to real array
        for (let i = 0; i < this.size; i++) {
            real[i] = buffer[i];
        }

        // Perform FFT
        let halfSize = 1;
        while (halfSize < this.size) {
            const phaseShiftStepReal = this.cosTable[halfSize];
            const phaseShiftStepImag = this.sinTable[halfSize];
            
            let currentPhaseShiftReal = 1;
            let currentPhaseShiftImag = 0;
            
            for (let fftStep = 0; fftStep < halfSize; fftStep++) {
                for (let i = fftStep; i < this.size; i += 2 * halfSize) {
                    const off = i + halfSize;
                    
                    const tr = currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off];
                    const ti = currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off];
                    
                    real[off] = real[i] - tr;
                    imag[off] = imag[i] - ti;
                    real[i] += tr;
                    imag[i] += ti;
                }
                
                const tmpReal = currentPhaseShiftReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag;
                currentPhaseShiftImag = currentPhaseShiftReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal;
                currentPhaseShiftReal = tmpReal;
            }
            
            halfSize = halfSize << 1;
        }

        // Pack real and imaginary parts into single array
        const output = new Float64Array(this.size * 2);
        for (let i = 0; i < this.size; i++) {
            output[i * 2] = real[i];
            output[i * 2 + 1] = imag[i];
        }
        
        return output;
    }
}
