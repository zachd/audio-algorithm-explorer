/**
 * Canvas utility functions for visualization
 */

export class CanvasUtils {
    /**
     * Sets up a canvas for high DPI displays
     * @param {HTMLCanvasElement} canvas - The canvas element to setup
     * @param {number} width - Desired width in CSS pixels
     * @param {number} height - Desired height in CSS pixels
     * @returns {Object} Context and scale factor
     */
    static setupHighDPICanvas(canvas, width, height) {
        const dpr = window.devicePixelRatio || 1;
        
        // Set canvas size in CSS pixels
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        // Scale canvas for retina displays
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        
        return { ctx, dpr };
    }

    /**
     * Clears the canvas
     * @param {CanvasRenderingContext2D} ctx - The canvas context
     * @param {number} width - Canvas width in CSS pixels
     * @param {number} height - Canvas height in CSS pixels
     */
    static clearCanvas(ctx, width, height) {
        ctx.clearRect(0, 0, width, height);
    }

    /**
     * Draws a responsive grid on the canvas
     * @param {CanvasRenderingContext2D} ctx - The canvas context
     * @param {number} width - Canvas width in CSS pixels
     * @param {number} height - Canvas height in CSS pixels
     * @param {number} gridSize - Size of grid squares in pixels
     */
    static drawGrid(ctx, width, height, gridSize = 50) {
        ctx.save();
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 0.5;

        // Draw vertical lines
        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Draw horizontal lines
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.restore();
    }
}
