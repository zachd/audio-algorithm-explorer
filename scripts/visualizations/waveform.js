/**
 * Waveform visualization module
 */

import { CanvasUtils } from '../utils/canvas.js';

export class WaveformVisualizer {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        this.setupCanvas();
        
        // Visualization state
        this.waveformData = null;
        this.zoomLevel = 1; // Reset zoom level to 1
        this.offset = 0;
        this.isDragging = false;
        this.lastX = 0;
        this.playbackTime = 0;
        this.isPlaying = false;
        this.animationFrame = null;
        
        // Bind event handlers
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        
        // Add event listeners
        this.addEventListeners();
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
     * Add event listeners for interaction
     */
    addEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseUp);
        this.canvas.addEventListener('wheel', this.handleWheel);

        // Touch events
        this.canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handleMouseDown({
                clientX: touch.clientX,
                clientY: touch.clientY
            });
        });

        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handleMouseMove({
                clientX: touch.clientX,
                clientY: touch.clientY
            });
        });

        this.canvas.addEventListener('touchend', e => {
            e.preventDefault();
            this.handleMouseUp();
        });
    }

    /**
     * Set the waveform data and trigger a redraw
     * @param {Float32Array} data - The waveform data to visualize
     */
    setWaveformData(data) {
        this.waveformData = data;
        this.zoomLevel = 1; // Reset zoom level when new data is set
        this.offset = 0;    // Reset offset when new data is set
        this.draw();
    }

    /**
     * Update playback state and time
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
        } else if (!isPlaying && this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        this.draw();
    }

    /**
     * Start playback cursor animation
     */
    startPlaybackAnimation() {
        const animate = () => {
            this.draw();
            if (this.isPlaying) {
                this.animationFrame = requestAnimationFrame(animate);
            }
        };
        this.animationFrame = requestAnimationFrame(animate);
    }

    /**
     * Handle mouse down event
     * @param {MouseEvent} e - The mouse event
     */
    handleMouseDown(e) {
        this.isDragging = true;
        this.lastX = e.clientX;
        this.canvas.style.cursor = 'grabbing';
    }

    /**
     * Handle mouse move event
     * @param {MouseEvent} e - The mouse event
     */
    handleMouseMove(e) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.lastX;
        this.offset = Math.max(0, Math.min(
            this.offset - (deltaX / this.width) * this.waveformData.length / this.zoomLevel,
            this.waveformData.length * (1 - 1/this.zoomLevel)
        ));
        
        this.lastX = e.clientX;
        this.draw();
    }

    /**
     * Handle mouse up event
     */
    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }

    /**
     * Handle mouse wheel event for zooming
     * @param {WheelEvent} e - The wheel event
     */
    handleWheel(e) {
        e.preventDefault();
        
        const mouseX = e.offsetX / this.width;
        const oldZoom = this.zoomLevel;
        
        // Update zoom level
        this.zoomLevel = Math.max(1, Math.min(50, 
            this.zoomLevel * (e.deltaY > 0 ? 0.9 : 1.1)
        ));

        // Adjust offset to keep the mouse position stable
        if (this.zoomLevel > 1) {
            const dataIndexAtMouse = this.offset + (mouseX * this.waveformData.length / oldZoom);
            this.offset = dataIndexAtMouse - (mouseX * this.waveformData.length / this.zoomLevel);
            
            // Clamp offset
            this.offset = Math.max(0, Math.min(
                this.offset,
                this.waveformData.length * (1 - 1/this.zoomLevel)
            ));
        } else {
            this.offset = 0;
        }

        this.draw();
    }

    /**
     * Get maximum scroll offset
     * @returns {number} Maximum scroll offset
     */
    getMaxScroll() {
        if (!this.waveformData) return 0;
        return Math.max(0, (this.waveformData.length / (this.canvas.width * this.dpr)) * this.zoomLevel - 1);
    }

    /**
     * Resize the canvas
     * @param {number} width - New width
     * @param {number} height - New height
     */
    resize(width, height) {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        // Store logical dimensions
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        
        // Set up the coordinate system
        this.ctx.scale(dpr, dpr);
        
        this.draw();
    }

    /**
     * Draw the waveform visualization
     */
    draw() {
        if (!this.waveformData) return;

        const ctx = this.ctx;
        const dpr = this.dpr;

        // Clear canvas and reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.width * dpr, this.height * dpr);
        ctx.scale(dpr, dpr);

        // Calculate samples per pixel to fit the entire waveform
        const samplesPerPixel = this.waveformData.length / this.width;
        
        // Calculate visible range based on zoom and offset
        const visibleWidth = this.width / this.zoomLevel;
        const startSample = Math.floor(this.offset * samplesPerPixel);
        const endSample = Math.ceil((this.offset + visibleWidth) * samplesPerPixel);

        // Draw grid
        CanvasUtils.drawGrid(ctx, this.width, this.height);

        // Draw waveform
        ctx.beginPath();
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;

        let lastX = null;
        let lastY = null;
        const step = Math.max(1, Math.floor(samplesPerPixel / this.zoomLevel));

        for (let i = startSample; i < endSample; i += step) {
            if (i >= this.waveformData.length) break;
            
            const x = ((i / samplesPerPixel - this.offset) * this.zoomLevel);
            
            // Calculate average amplitude for this pixel
            let sum = 0;
            let count = 0;
            for (let j = 0; j < step && i + j < this.waveformData.length; j++) {
                sum += Math.abs(this.waveformData[i + j]);
                count++;
            }
            const avgAmplitude = (sum / count) * (this.height * 0.4);
            const y = (this.height / 2) + avgAmplitude;
            
            if (lastX === null || x - lastX >= 1) {
                if (lastX === null) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                lastX = x;
                lastY = y;
            }
        }
        ctx.stroke();

        // Draw mirror of waveform
        ctx.beginPath();
        ctx.strokeStyle = '#90CAF9';
        ctx.lineWidth = 1;

        lastX = null;
        lastY = null;

        for (let i = startSample; i < endSample; i += step) {
            if (i >= this.waveformData.length) break;
            
            const x = ((i / samplesPerPixel - this.offset) * this.zoomLevel);
            
            // Calculate average amplitude for this pixel
            let sum = 0;
            let count = 0;
            for (let j = 0; j < step && i + j < this.waveformData.length; j++) {
                sum += Math.abs(this.waveformData[i + j]);
                count++;
            }
            const avgAmplitude = (sum / count) * (this.height * 0.4);
            const y = (this.height / 2) - avgAmplitude;
            
            if (lastX === null || x - lastX >= 1) {
                if (lastX === null) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                lastX = x;
                lastY = y;
            }
        }
        ctx.stroke();

        // Draw playback cursor
        if (this.duration) {
            // Calculate cursor position based on time
            const cursorX = (this.playbackTime / this.duration) * this.width / this.zoomLevel - this.offset * this.zoomLevel;
            
            // Only draw if cursor is in view
            if (cursorX >= 0 && cursorX <= this.width) {
                // Draw cursor line
                ctx.beginPath();
                ctx.strokeStyle = '#FF4081';
                ctx.lineWidth = 2;
                ctx.moveTo(cursorX, 0);
                ctx.lineTo(cursorX, this.height);
                ctx.stroke();
                
                // Draw cursor handle
                ctx.beginPath();
                ctx.fillStyle = '#FF4081';
                ctx.arc(cursorX, 10, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Auto-scroll if playing and cursor is near edge
            if (this.isPlaying) {
                const margin = this.width * 0.2;
                if (cursorX > this.width - margin) {
                    const scrollAmount = 2; // Pixels to scroll per frame
                    this.offset += scrollAmount / this.zoomLevel;
                    this.offset = Math.min(this.getMaxScroll(), this.offset);
                }
            }
        }
    }

    /**
     * Clean up event listeners
     */
    dispose() {
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
        this.canvas.removeEventListener('wheel', this.handleWheel);
    }
}
