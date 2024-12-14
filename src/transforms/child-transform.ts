import { TransformCallback } from 'stream';
import { spawn, ChildProcess } from 'child_process';
import { BufferTransform } from "./buffer-transform";

interface ChildProcessTransformOptions {
	command: string;
	args?: string[];
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	timeout?: number;
}

interface NodeJSError extends Error {
	code?: string;
}

export class ChildProcessTransform extends BufferTransform {
	private child: ChildProcess | null = null;
	private timeout: NodeJS.Timeout | null = null;
	private options: ChildProcessTransformOptions;
	private hasError = false;
	private processCompleted = false;

	constructor(options: ChildProcessTransformOptions) {
		super(`${options.command}Transform`);
		this.options = {
			timeout: 60000,
			...options
		};
		console.log(`[${options.command}] Starting process with args:`, options.args);
		this.initChildProcess();

		// Set timeout
		if (this.options.timeout) {
			this.timeout = setTimeout(() => {
				console.error(`[${this.options.command}] Process timeout after ${this.options.timeout}ms`);
				this.destroy(new Error(`Process timeout after ${this.options.timeout}ms`));
			}, this.options.timeout);
		}
	}

	private initChildProcess() {
		try {
			this.child = spawn(this.options.command, this.options.args || [], {
				env: this.options.env,
				cwd: this.options.cwd,
				stdio: ['pipe', 'pipe', 'pipe']
			});

			if (!this.child.stdout || !this.child.stdin || !this.child.stderr) {
				throw new Error('Child process streams are not available');
			}

			// Handle stdout data
			this.child.stdout.on('data', (chunk: Buffer) => {
				console.log(`[${this.options.command}] Received stdout chunk: ${chunk.length} bytes`);
				this.buffer.push(chunk);
				this.totalLength += chunk.length;
				this.push(chunk);
			});

			// Handle stderr data
			this.child.stderr.on('data', (chunk: Buffer) => {
				console.error(`[${this.options.command}] stderr:`, chunk.toString());
			});

			// Handle process exit
			this.child.on('exit', (code: number | null, signal: string | null) => {
				console.log(`[${this.options.command}] Process exited with code ${code}, signal: ${signal}`);
				this.processCompleted = true;
				if (code !== 0 && !this.hasError) {
					this.hasError = true;
					this.emit('error', new Error(`Process exited with code ${code}, signal: ${signal}`));
				}
				if (this.timeout) {
					clearTimeout(this.timeout);
				}
				// End the transform stream when the process exits
				this.push(null);
				this.end();
			});

			// Handle process errors
			this.child.on('error', (error: Error) => {
				console.error(`[${this.options.command}] Process error:`, error);
				if (!this.processCompleted) {
					this.hasError = true;
					this.emit('error', error);
				}
			});

			// Handle stdin errors
			this.child.stdin.on('error', (error: NodeJSError) => {
				if (error.code === 'EPIPE') {
					// EPIPE means the process has finished reading from stdin
					console.log(`[${this.options.command}] Process finished reading input`);
					if (this.child?.stdin) {
						this.child.stdin.end();
					}
					// Don't treat EPIPE as an error
					return;
				}
				console.error(`[${this.options.command}] stdin error:`, error);
				if (!this.processCompleted) {
					this.hasError = true;
					this.emit('error', error);
				}
			});

			// Handle stdout end
			this.child.stdout.on('end', () => {
				console.log(`[${this.options.command}] stdout ended`);
				if (!this.processCompleted) {
					this.processCompleted = true;
					this.push(null);
					this.end();
				}
			});

		} catch (error) {
			console.error(`[${this.options.command}] Initialization error:`, error);
			this.hasError = true;
			this.emit('error', error instanceof Error ? error : new Error(String(error)));
		}
	}

	_transform(
		chunk: any,
		encoding: BufferEncoding,
		callback: TransformCallback
	): void {
		try {
			// If process is completed, just skip the data
			if (this.processCompleted) {
				callback();
				return;
			}

			console.log(`[${this.options.command}] Incoming chunk size: ${chunk.length} bytes`);

			if (!this.child || this.child.killed || this.hasError) {
				return callback(new Error(`${this.options.command} process is not available`));
			}

			const stdin = this.child.stdin;
			if (!stdin) {
				return callback(new Error(`${this.options.command} stdin is not available`));
			}

			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
			
			try {
				const canWrite = stdin.write(buffer);
				if (!canWrite) {
					stdin.once('drain', () => callback());
				} else {
					callback();
				}
			} catch (writeError) {
				// If write fails with EPIPE, just continue
				if ((writeError as NodeJSError).code === 'EPIPE') {
					callback();
				} else {
					callback(writeError as Error);
				}
			}
		} catch (error) {
			console.error(`[${this.options.command}] Transform error:`, error);
			callback(error instanceof Error ? error : new Error(String(error)));
		}
	}

	_flush(callback: TransformCallback): void {
		console.log(`[${this.options.command}] Flush called`);
		if (this.child && !this.child.killed && !this.processCompleted) {
			const stdin = this.child.stdin;
			if (stdin) {
				stdin.end(() => {
					console.log(`[${this.options.command}] Child process stdin ended`);
					callback();
				});
				return;
			}
		}
		callback();
	}

	_destroy(error: Error | null, callback: (error: Error | null) => void): void {
		console.log(`[${this.options.command}] Destroy called`);
		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		if (this.child && !this.child.killed) {
			this.child.kill();
		}
		// Don't propagate EPIPE errors
		if (error && (error as NodeJSError).code === 'EPIPE') {
			callback(null);
		} else {
			callback(error);
		}
	}
}
