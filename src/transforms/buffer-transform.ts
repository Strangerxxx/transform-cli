import { Transform, TransformCallback } from 'stream';

/**
 * A Transform stream that buffers data chunks while passing them through
 * Maintains an internal buffer of all data that passes through the stream
 * Used as the base class for both main video buffer and FFmpeg transform
 */
export class BufferTransform extends Transform {
	protected buffer: Buffer[] = [];
	protected totalLength = 0;
	protected debugName: string;
	protected isFinished = false;

	/**
	 * Creates a new BufferTransform instance
	 * @param {string} debugName - Name used for debugging and logging
	 */
	constructor(debugName = 'BufferTransform') {
		super();
		this.debugName = debugName;

		// Add stream event listeners for debugging
		this.on('finish', () => {
			console.log(`[${this.debugName}] Stream finished`);
			this.isFinished = true;
		});

		this.on('end', () => {
			console.log(`[${this.debugName}] Stream ended`);
			this.isFinished = true;
		});

		this.on('error', (err) => {
			console.error(`[${this.debugName}] Stream error:`, err);
		});
	}

	/**
	 * Transform implementation that stores chunks in buffer while passing them through
	 * @param {any} chunk - Data chunk to process
	 * @param {BufferEncoding} encoding - Chunk encoding
	 * @param {TransformCallback} callback - Callback to signal chunk processing completion
	 */
	_transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
		try {
			console.log(`[${this.debugName}] _transform called with chunk size: ${chunk.length} bytes`);

			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
			this.buffer.push(buffer);
			this.totalLength += buffer.length;

			console.log(`[${this.debugName}] Buffer updated: ${this.totalLength} bytes total from ${this.buffer.length} chunks`);

			this.push(buffer);
			callback();
		} catch (error) {
			console.error(`[${this.debugName}] Error in _transform:`, error);
			callback(error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Called when the transform stream is being flushed
	 * @param {TransformCallback} callback - Callback to signal flush completion
	 */
	_flush(callback: TransformCallback): void {
		console.log(`[${this.debugName}] _flush called`);
		this.isFinished = true;
		if (this.buffer.length > 0) {
			console.log(`[${this.debugName}] Flushing remaining data: ${this.totalLength} bytes`);
		}
		callback();
	}

	/**
	 * Called when the transform stream is ending
	 * @param {TransformCallback} callback - Callback to signal stream end
	 */
	_final(callback: TransformCallback): void {
		console.log(`[${this.debugName}] _final called`);
		this.isFinished = true;
		if (this.buffer.length > 0) {
			console.log(`[${this.debugName}] Final data size: ${this.totalLength} bytes`);
		}
		callback();
	}

	/**
	 * Returns the complete buffered data as a single Buffer
	 * @returns {Buffer} Concatenated buffer of all processed data
	 */
	getBuffer(): Buffer {
		console.log(`[${this.debugName}] getBuffer called`);
		console.log(`[${this.debugName}] Current state: ${this.totalLength} bytes from ${this.buffer.length} chunks`);

		if (this.buffer.length === 0) {
			console.warn(`[${this.debugName}] WARNING: Buffer is empty!`);
			return Buffer.alloc(0);
		}

		const result = Buffer.concat(this.buffer, this.totalLength);
		console.log(`[${this.debugName}] Returning buffer of size: ${result.length} bytes`);
		return result;
	}

	/**
	 * Checks if the stream has finished processing
	 * @returns {boolean} True if stream is finished
	 */
	isComplete(): boolean {
		return this.isFinished;
	}
}
