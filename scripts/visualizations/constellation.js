import { CanvasUtils } from '../utils/canvas.js';
import { FFT } from '../utils/fft.js';

export class ConstellationVisualizer {
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
        
        // FFT parameters (matching spectrogram)
        this.fftSize = 2048;
        this.frequencyBinCount = this.fftSize / 2;
        this.minDecibels = -90;
        this.maxDecibels = -20;
        this.sampleRate = 44100;
        
        // Peak detection parameters
        this.peakNeighborhood = 15;   // Points to check in time/frequency
        this.peakThreshold = 0.4;     // Minimum intensity for peaks
        this.minDistance = 20;        // Minimum distance between peaks
        
        // Constellation parameters
        this.maxTargetDt = 100;      // Maximum time difference for pairs
        this.minTargetDt = 5;        // Minimum time difference for pairs (reduced for more pairs)
        this.maxFreqDelta = 50;      // Maximum frequency difference for pairs (increased for more pairs)
        
        this.audioData = null;
        this.spectrogramData = null;
        this.peaks = [];             // List of peak points
        this.pairs = [];             // List of point pairs
        this.playbackTime = 0;
        this.duration = 0;
        this.isPlaying = false;
        this.animationFrame = null;
        this.spectrogramDrawn = false;
        
        // Add resize handler
        this.resizeHandler = this.handleResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);
    }

    // Find peaks in the spectrogram
    findPeaks() {
        this.peaks = [];
        if (!this.spectrogramData) return;

        const numFrames = this.spectrogramData.length;
        const numBins = Math.floor(this.frequencyBinCount / 4); // Only look at lower frequencies
        
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

        console.log(`Found ${this.peaks.length} peaks`); // Debug log
    }

    // Create constellation pairs from peaks
    createPairs() {
        this.pairs = [];
        if (!this.peaks.length) return;

        // Sort peaks by time to make pairing more efficient
        const sortedPeaks = [...this.peaks].sort((a, b) => a.t - b.t);
        
        // For each peak, look ahead to create pairs
        for (let i = 0; i < sortedPeaks.length; i++) {
            const anchor = sortedPeaks[i];
            
            // Look ahead for target points within time window
            for (let j = i + 1; j < sortedPeaks.length; j++) {
                const target = sortedPeaks[j];
                const dt = target.t - anchor.t;
                
                // Check if we've gone too far in time
                if (dt > this.maxTargetDt) break;
                
                // Check if pair meets our criteria
                if (dt >= this.minTargetDt) {
                    const df = Math.abs(target.f - anchor.f);
                    if (df <= this.maxFreqDelta) {
                        this.pairs.push({ anchor, target });
                    }
                }
            }
        }

        console.log(`Created ${this.pairs.length} pairs`); // Debug log
    }

    processSpectrogramData() {
        const fft = new FFT(this.fftSize);
        const hopSize = Math.floor(this.fftSize / 4);  // 75% overlap to match spectrogram
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
                // Normalize to [0, 1] range
                normalizedMagnitudes[j] = (magnitudes[j] - globalMin) / range;
            }
            this.spectrogramData.push(normalizedMagnitudes);
        }
        
        // Find peaks and create constellation
        this.findPeaks();
        this.createPairs();
    }

    draw() {
        if (!this.spectrogramData) return;

        // Draw spectrogram and constellation only once
        if (!this.spectrogramDrawn) {
            this.offscreenCtx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
            
            // Draw spectrogram
            const numFrames = this.spectrogramData.length;
            const timeStep = this.width / numFrames;
            const freqStep = this.height / (this.frequencyBinCount / 4); // Only show up to Nyquist/2
            
            for (let t = 0; t < numFrames; t++) {
                const magnitudes = this.spectrogramData[t];
                
                for (let f = 0; f < this.frequencyBinCount / 4; f++) {
                    const magnitude = magnitudes[f];
                    const intensity = Math.pow(magnitude, 0.7); // Gamma correction for better visibility
                    
                    // Use grayscale for background
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
            
            // Draw constellation pairs with thicker lines
            this.offscreenCtx.lineWidth = 1;
            this.offscreenCtx.strokeStyle = 'rgba(0, 255, 0, 0.6)';  // More opaque green
            
            for (const pair of this.pairs) {
                const x1 = pair.anchor.t * timeStep;
                const y1 = pair.anchor.f * freqStep;
                const x2 = pair.target.t * timeStep;
                const y2 = pair.target.f * freqStep;
                
                this.offscreenCtx.beginPath();
                this.offscreenCtx.moveTo(x1, y1);
                this.offscreenCtx.lineTo(x2, y2);
                this.offscreenCtx.stroke();
            }
            
            // Draw peak points with larger, more visible dots
            this.offscreenCtx.fillStyle = 'rgba(0, 0, 255, 0.9)';  // More opaque blue
            for (const peak of this.peaks) {
                const x = peak.t * timeStep;
                const y = peak.f * freqStep;
                
                this.offscreenCtx.beginPath();
                this.offscreenCtx.arc(x, y, 3, 0, 2 * Math.PI);  // Larger radius
                this.offscreenCtx.fill();
            }
            
            this.spectrogramDrawn = true;
        }
        
        // Draw the cached spectrogram
        this.ctx.clearRect(0, 0, this.width * this.dpr, this.height * this.dpr);
        this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.width, this.height);
        
        // Draw playback cursor
        if (this.duration > 0) {
            const cursorX = (this.playbackTime / this.duration) * this.width;
            this.ctx.strokeStyle = 'red';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(cursorX, 0);
            this.ctx.lineTo(cursorX, this.height);
            this.ctx.stroke();
        }
    }

    handleResize() {
        // Get new container dimensions
        const container = this.canvas.parentElement;
        const { width, height } = container.getBoundingClientRect();
        
        // Update dimensions
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

    setAudioData(audioData) {
        this.audioData = audioData;
        this.processSpectrogramData();
        this.draw();
    }

    updatePlayback(isPlaying, currentTime, duration) {
        this.isPlaying = isPlaying;
        this.playbackTime = currentTime;
        this.duration = duration;

        if (isPlaying && !this.animationFrame) {
            this.startPlaybackAnimation();
        } else if (!isPlaying) {
            this.cancelAnimation();
            this.draw();
        }
    }

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

    cancelAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
}
