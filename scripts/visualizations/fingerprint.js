/**
 * Fingerprint visualization module
 */

import { CanvasUtils } from '../utils/canvas.js';
import { FFT } from '../utils/fft.js';

export class FingerprintVisualizer {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        
        const { ctx, dpr } = CanvasUtils.setupHighDPICanvas(this.canvas, this.width, this.height);
        this.ctx = ctx;
        this.ctx.imageSmoothingEnabled = true;
        this.dpr = dpr;
        
        // Create offscreen canvas for caching
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = width * dpr;
        this.offscreenCanvas.height = height * dpr;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this.offscreenCtx.scale(dpr, dpr);
        this.offscreenCtx.imageSmoothingEnabled = true;
        
        // FFT parameters
        this.fftSize = 2048;
        this.frequencyBinCount = this.fftSize / 2;
        this.minDecibels = -90;
        this.maxDecibels = -20;
        this.sampleRate = 44100;
        
        // Peak detection parameters
        this.peakNeighborhood = 15;
        this.peakThreshold = 0.4;
        this.minDistance = 20;
        
        // Target zone parameters
        this.targetZoneStart = 5;      // Start frames after anchor
        this.targetZoneEnd = 100;      // End frames after anchor
        this.targetZoneHeight = 50;    // Frequency bins above/below anchor
        
        // Visualization state
        this.audioData = null;
        this.spectrogramData = null;
        this.peaks = [];
        this.pairs = [];
        this.currentAnchorIndex = -1;
        this.spectrogramDrawn = false;
        
        // Mouse interaction
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        this.hoveredPeakIndex = -1;
        this.interactionRadius = 10;  // Radius in pixels for peak detection
    }
    
    setAudioData(audioData) {
        this.audioData = audioData;
        this.processSpectrogramData();
        this.findPeaks();
        this.spectrogramDrawn = false;
        this.draw();
    }
    
    nextAnchor() {
        if (!this.peaks.length) return;
        
        this.currentAnchorIndex = (this.currentAnchorIndex + 1) % this.peaks.length;
        this.createPairsForCurrentAnchor();
        this.draw();
    }
    
    createPairsForCurrentAnchor() {
        this.pairs = [];
        if (this.currentAnchorIndex < 0) return;
        
        const anchor = this.peaks[this.currentAnchorIndex];
        
        // Look for target points within the target zone
        for (const target of this.peaks) {
            const dt = target.t - anchor.t;
            
            // Check if target is within time window
            if (dt >= this.targetZoneStart && dt <= this.targetZoneEnd) {
                // Check if target is within frequency range
                const df = Math.abs(target.f - anchor.f);
                if (df <= this.targetZoneHeight) {
                    this.pairs.push({ anchor, target });
                }
            }
        }
    }
    
    processSpectrogramData() {
        const fft = new FFT(this.fftSize);
        const hopSize = Math.floor(this.fftSize / 4);
        const numFrames = Math.floor((this.audioData.length - this.fftSize) / hopSize);
        
        // First pass: compute all magnitudes and find global min/max
        const tempData = [];
        let globalMax = -Infinity;
        let globalMin = Infinity;
        
        // Pre-compute window function
        const hannWindow = new Float32Array(this.fftSize);
        for (let i = 0; i < this.fftSize; i++) {
            hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.fftSize - 1)));
        }
        
        // Process FFT frames
        for (let i = 0; i < numFrames; i++) {
            const frame = new Float32Array(this.fftSize);
            for (let j = 0; j < this.fftSize; j++) {
                frame[j] = this.audioData[i * hopSize + j] * hannWindow[j];
            }
            
            const spectrum = fft.forward(frame);
            const magnitudes = new Float32Array(this.frequencyBinCount);
            
            for (let j = 0; j < this.frequencyBinCount; j++) {
                const re = spectrum[j * 2];
                const im = spectrum[j * 2 + 1];
                const magnitude = Math.sqrt(re * re + im * im);
                const decibels = 20 * Math.log10(magnitude + 1e-6);
                magnitudes[j] = decibels;
                globalMax = Math.max(globalMax, decibels);
                globalMin = Math.min(globalMin, decibels);
            }
            tempData.push(magnitudes);
        }
        
        // Second pass: normalize and store
        this.spectrogramData = [];
        const range = globalMax - globalMin;
        for (const magnitudes of tempData) {
            const normalizedMagnitudes = new Float32Array(this.frequencyBinCount);
            for (let j = 0; j < this.frequencyBinCount; j++) {
                normalizedMagnitudes[j] = (magnitudes[j] - globalMin) / range;
            }
            this.spectrogramData.push(normalizedMagnitudes);
        }
    }
    
    findPeaks() {
        this.peaks = [];
        if (!this.spectrogramData) return;

        const numFrames = this.spectrogramData.length;
        const numBins = Math.floor(this.frequencyBinCount / 4);
        
        for (let t = this.peakNeighborhood; t < numFrames - this.peakNeighborhood; t++) {
            for (let f = this.peakNeighborhood; f < numBins - this.peakNeighborhood; f++) {
                const value = this.spectrogramData[t][f];
                let isPeak = true;
                
                // Check if this point is a local maximum
                for (let dt = -this.peakNeighborhood; dt <= this.peakNeighborhood && isPeak; dt++) {
                    for (let df = -this.peakNeighborhood; df <= this.peakNeighborhood; df++) {
                        if (dt === 0 && df === 0) continue;
                        
                        const neighborValue = this.spectrogramData[t + dt][f + df];
                        if (neighborValue >= value) {
                            isPeak = false;
                            break;
                        }
                    }
                }
                
                // Check intensity threshold
                if (value < this.peakThreshold) {
                    isPeak = false;
                }
                
                if (isPeak) {
                    // Check minimum distance from other peaks
                    let tooClose = false;
                    for (const peak of this.peaks) {
                        const dt = Math.abs(t - peak.t);
                        const df = Math.abs(f - peak.f);
                        if (dt < this.minDistance && df < this.minDistance) {
                            tooClose = true;
                            break;
                        }
                    }
                    
                    if (!tooClose) {
                        this.peaks.push({ t, f, intensity: value });
                    }
                }
            }
        }

        // Select the first peak by default if we have any peaks
        if (this.peaks.length > 0) {
            this.currentAnchorIndex = 0;
            this.createPairsForCurrentAnchor();
        }
    }
    
    handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width) / this.dpr;
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height) / this.dpr;
        
        // Convert to spectrogram coordinates
        const timeStep = this.width / this.spectrogramData.length;
        const freqStep = this.height / (this.frequencyBinCount / 4);
        
        // Find closest peak within interaction radius
        let closestPeak = -1;
        let minDistance = this.interactionRadius;
        
        for (let i = 0; i < this.peaks.length; i++) {
            const peak = this.peaks[i];
            const peakX = peak.t * timeStep;
            const peakY = peak.f * freqStep;
            
            const distance = Math.sqrt(Math.pow(x - peakX, 2) + Math.pow(y - peakY, 2));
            if (distance < minDistance) {
                minDistance = distance;
                closestPeak = i;
            }
        }
        
        if (this.hoveredPeakIndex !== closestPeak) {
            this.hoveredPeakIndex = closestPeak;
            if (closestPeak >= 0) {
                this.currentAnchorIndex = closestPeak;
                this.createPairsForCurrentAnchor();
            }
            this.draw();
        }
    }
    
    handleMouseLeave() {
        if (this.hoveredPeakIndex >= 0) {
            this.hoveredPeakIndex = -1;
            this.currentAnchorIndex = -1;
            this.pairs = [];
            this.draw();
        }
    }
    
    draw() {
        if (!this.spectrogramData) return;

        // Draw spectrogram and base constellation
        if (!this.spectrogramDrawn) {
            this.offscreenCtx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
            
            // Draw spectrogram
            const numFrames = this.spectrogramData.length;
            const timeStep = this.width / numFrames;
            const freqStep = this.height / (this.frequencyBinCount / 4);
            
            for (let t = 0; t < numFrames; t++) {
                const magnitudes = this.spectrogramData[t];
                
                for (let f = 0; f < this.frequencyBinCount / 4; f++) {
                    const magnitude = magnitudes[f];
                    const intensity = Math.pow(magnitude, 0.7);
                    
                    const color = Math.floor(intensity * 255);
                    this.offscreenCtx.fillStyle = `rgb(${color},${color},${color})`;
                    this.offscreenCtx.fillRect(
                        t * timeStep,
                        f * freqStep,
                        Math.ceil(timeStep),
                        Math.ceil(freqStep)
                    );
                }
            }
            
            // Draw all peaks with a subtle glow for better visibility
            this.offscreenCtx.shadowBlur = 3;
            this.offscreenCtx.shadowColor = 'rgba(128, 128, 255, 0.5)';
            this.offscreenCtx.fillStyle = 'rgba(128, 128, 255, 0.5)';  // Light blue for non-selected peaks
            
            for (const peak of this.peaks) {
                const x = peak.t * timeStep;
                const y = peak.f * freqStep;
                
                this.offscreenCtx.beginPath();
                this.offscreenCtx.arc(x, y, 3, 0, 2 * Math.PI);
                this.offscreenCtx.fill();
            }
            
            this.offscreenCtx.shadowBlur = 0;  // Reset shadow
            this.spectrogramDrawn = true;
        }
        
        // Draw the cached spectrogram
        this.ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
        this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.width, this.height);
        
        if (this.currentAnchorIndex >= 0) {
            const timeStep = this.width / this.spectrogramData.length;
            const freqStep = this.height / (this.frequencyBinCount / 4);
            
            const anchor = this.peaks[this.currentAnchorIndex];
            
            // Draw target zone with animation
            const zoneStartX = (anchor.t + this.targetZoneStart) * timeStep;
            const zoneEndX = (anchor.t + this.targetZoneEnd) * timeStep;
            const zoneTopY = Math.max(0, (anchor.f - this.targetZoneHeight) * freqStep);
            const zoneBottomY = Math.min(this.height, (anchor.f + this.targetZoneHeight) * freqStep);
            
            // Animate the target zone with a subtle pulse
            const alpha = 0.1 + Math.sin(Date.now() / 500) * 0.05;  // Pulse between 0.05 and 0.15
            this.ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
            this.ctx.fillRect(zoneStartX, zoneTopY, zoneEndX - zoneStartX, zoneBottomY - zoneTopY);
            
            // Draw pairs with glow effect
            this.ctx.shadowBlur = 2;
            this.ctx.shadowColor = 'rgba(0, 255, 0, 0.6)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
            
            for (const pair of this.pairs) {
                const x1 = pair.anchor.t * timeStep;
                const y1 = pair.anchor.f * freqStep;
                const x2 = pair.target.t * timeStep;
                const y2 = pair.target.f * freqStep;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
            }
            
            // Draw current anchor point with glow
            this.ctx.shadowBlur = 4;
            this.ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
            this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
            const anchorX = anchor.t * timeStep;
            const anchorY = anchor.f * freqStep;
            
            this.ctx.beginPath();
            this.ctx.arc(anchorX, anchorY, 5, 0, 2 * Math.PI);
            this.ctx.fill();
            
            // Draw target points with glow
            this.ctx.shadowBlur = 3;
            this.ctx.shadowColor = 'rgba(0, 255, 0, 0.8)';
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
            for (const pair of this.pairs) {
                const x = pair.target.t * timeStep;
                const y = pair.target.f * freqStep;
                
                this.ctx.beginPath();
                this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
                this.ctx.fill();
            }
            
            this.ctx.shadowBlur = 0;  // Reset shadow
            
            // Request animation frame for continuous updates (for pulsing effect)
            requestAnimationFrame(() => this.draw());
        }
    }
    
    handleResize(width, height) {
        this.width = width;
        this.height = height;
        
        // Resize main canvas
        const { ctx, dpr } = CanvasUtils.setupHighDPICanvas(this.canvas, this.width, this.height);
        this.ctx = ctx;
        this.ctx.imageSmoothingEnabled = true;
        this.dpr = dpr;
        
        // Resize offscreen canvas
        this.offscreenCanvas.width = width * dpr;
        this.offscreenCanvas.height = height * dpr;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');
        this.offscreenCtx.scale(dpr, dpr);
        this.offscreenCtx.imageSmoothingEnabled = true;
        
        // Force redraw
        this.spectrogramDrawn = false;
        this.draw();
    }
    
    updatePlayback(isPlaying, currentTime, duration) {
        this.isPlaying = isPlaying;
        this.playbackTime = currentTime;
        this.duration = duration;
        this.draw();
    }
}
