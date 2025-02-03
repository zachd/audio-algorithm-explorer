/**
 * Fast Fourier Transform implementation
 */
export class FFT {
    constructor(size) {
        this.size = size;
        this.cosTable = new Float32Array(size);
        this.sinTable = new Float32Array(size);
        
        for (let i = 0; i < size; i++) {
            const angle = (2 * Math.PI * i) / size;
            this.cosTable[i] = Math.cos(angle);
            this.sinTable[i] = Math.sin(angle);
        }
    }

    /**
     * Perform FFT on input data
     * @param {Float32Array} input - Input data
     * @returns {Float32Array} - FFT result (real and imaginary parts interleaved)
     */
    forward(input) {
        const n = this.size;
        const output = new Float32Array(n * 2);
        
        // Copy input to output, interleaving with zeros for imaginary parts
        for (let i = 0; i < n; i++) {
            output[i * 2] = input[i];
            output[i * 2 + 1] = 0;
        }
        
        // Bit reversal
        let j = 0;
        for (let i = 0; i < n - 1; i++) {
            if (i < j) {
                // Swap real parts
                const tempReal = output[i * 2];
                output[i * 2] = output[j * 2];
                output[j * 2] = tempReal;
                // Swap imaginary parts
                const tempImag = output[i * 2 + 1];
                output[i * 2 + 1] = output[j * 2 + 1];
                output[j * 2 + 1] = tempImag;
            }
            
            let k = n >> 1;
            while (k <= j) {
                j -= k;
                k >>= 1;
            }
            j += k;
        }
        
        // Compute FFT
        for (let step = 1; step < n; step <<= 1) {
            const jump = step << 1;
            const angle = Math.PI / step;
            
            for (let group = 0; group < n; group += jump) {
                for (let pair = 0; pair < step; pair++) {
                    const i = group + pair;
                    const j = i + step;
                    
                    const aReal = output[i * 2];
                    const aImag = output[i * 2 + 1];
                    const bReal = output[j * 2];
                    const bImag = output[j * 2 + 1];
                    
                    const sin = this.sinTable[pair * (n / jump)];
                    const cos = this.cosTable[pair * (n / jump)];
                    
                    const tReal = bReal * cos + bImag * sin;
                    const tImag = bImag * cos - bReal * sin;
                    
                    output[j * 2] = aReal - tReal;
                    output[j * 2 + 1] = aImag - tImag;
                    output[i * 2] = aReal + tReal;
                    output[i * 2 + 1] = aImag + tImag;
                }
            }
        }
        
        return output;
    }
}
