import { PassThrough, Readable } from 'stream';
import { BufferTransform } from './transforms/buffer-transform';

/**
 * Interface for a transform instance that can be processed
 */
export interface TransformInstance {
    transform: BufferTransform;
    name: string;
}

/**
 * Dynamic result type containing buffers from all transforms
 */
export type ProcessingResult = {
    [key: string]: Buffer;
};

/**
 * Manages parallel processing of streams through multiple transforms
 * Each transform processes the input stream independently and produces a buffer
 */
export class StreamProcessor {
    private transforms: TransformInstance[];
    private completedTransforms: Set<string> = new Set();
    private resolvePromise: ((result: ProcessingResult) => void) | null = null;
    private rejectPromise: ((error: Error) => void) | null = null;

    /**
     * Creates a new StreamProcessor instance
     * @param {TransformInstance[]} transforms - Array of transform instances to process the stream
     */
    constructor(transforms: TransformInstance[]) {
        if (!transforms.length) {
            throw new Error('At least one transform instance is required');
        }
        this.transforms = transforms;
    }

    /**
     * Process input stream through parallel transform streams
     * Sets up piping between streams and handles completion
     * @param {Readable} inputStream - Source stream
     * @returns {Promise<ProcessingResult>} Processed buffers from all transforms
     */
    async processStream(inputStream: Readable): Promise<ProcessingResult> {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;

            try {
                const passStreams = this.transforms.map(() => new PassThrough());
                
                this.transforms.forEach((transform, index) => {
                    this.setupTransformStream(transform, passStreams[index]);
                });
                
                this.setupInputStream(inputStream, passStreams);
            } catch (error) {
                this.handleError(error);
            }
        });
    }

    private handleError(error: unknown): void {
        if (this.rejectPromise) {
            this.rejectPromise(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Sets up a transform stream
     * Handles events for data flow and completion
     * @param {TransformInstance} transformInstance - Transform instance to setup
     * @param {PassThrough} passStream - PassThrough stream for the transform
     */
    private setupTransformStream(transformInstance: TransformInstance, passStream: PassThrough): void {
        const { transform, name } = transformInstance;
        const pipe = passStream.pipe(transform);

        pipe
            .on('data', (chunk) => {
                console.log(`${name} stream data chunk: ${chunk.length} bytes`);
            })
            .on('finish', () => {
                console.log(`${name} stream finished`);
                this.completedTransforms.add(name);
                this.checkCompletion();
            })
            .on('end', () => {
                console.log(`${name} stream ended`);
                this.completedTransforms.add(name);
                this.checkCompletion();
            })
            .on('error', (error) => {
                if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
                    console.log(`${name} stream completed (EPIPE expected)`);
                    this.completedTransforms.add(name);
                    this.checkCompletion();
                    return;
                }
                console.error(`Error in ${name} stream:`, error);
                this.handleError(error);
            });
    }

    /**
     * Sets up the input stream and pipes data to all transform streams
     * @param {Readable} inputStream - Source stream
     * @param {PassThrough[]} passStreams - PassThrough streams for each transform
     */
    private setupInputStream(inputStream: Readable, passStreams: PassThrough[]): void {
        inputStream
            .on('data', (chunk) => {
                passStreams.forEach(pass => pass.write(chunk));
            })
            .on('end', () => {
                passStreams.forEach(pass => pass.end());
            })
            .on('error', (error) => {
                console.error('Error in input stream:', error);
                this.handleError(error);
            });
    }

    private checkCompletion(): void {
        const allCompleted = this.transforms.every(t => this.completedTransforms.has(t.name));
        
        if (allCompleted && this.resolvePromise) {
            console.log('All streams completed');
            console.log('Getting buffers...');

            try {
                const result: ProcessingResult = {};
                
                for (const { transform, name } of this.transforms) {
                    const buffer = transform.getBuffer();
                    console.log(`${name} buffer size: ${buffer.length} bytes`);
                    
                    if (buffer.length === 0) {
                        throw new Error(`${name} buffer is empty`);
                    }
                    
                    result[name] = buffer;
                }

                this.resolvePromise(result);
            } catch (error) {
                this.handleError(error);
            }
        }
    }
} 