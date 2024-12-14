import { Transform, TransformCallback } from 'stream';

/**
 * A Transform stream that saves chunks to a buffer while passing them through
 */
export class BufferTransform extends Transform {
	protected buffer: Buffer[] = [];
	protected totalLength = 0;
	protected debugName: string;
	protected isFinished = false;

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

	_flush(callback: TransformCallback): void {
		console.log(`[${this.debugName}] _flush called`);
		this.isFinished = true;
		if (this.buffer.length > 0) {
			console.log(`[${this.debugName}] Flushing remaining data: ${this.totalLength} bytes`);
		}
		callback();
	}

	_final(callback: TransformCallback): void {
		console.log(`[${this.debugName}] _final called`);
		this.isFinished = true;
		if (this.buffer.length > 0) {
			console.log(`[${this.debugName}] Final data size: ${this.totalLength} bytes`);
		}
		callback();
	}

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

	isComplete(): boolean {
		return this.isFinished;
	}
}
