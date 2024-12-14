import { PassThrough, Readable } from 'stream';
import { BufferTransform } from './transforms/buffer-transform';
import { FFmpegTransform } from './transforms/ffmpeg-transform';

/**
 * Result of the parallel stream processing containing both buffers
 */
interface ProcessingResult {
    mainBuffer: Buffer;
    thumbnailBuffer: Buffer;
}

/**
 * Manages parallel processing of video streams
 * Handles two parallel transform streams:
 * 1. MainBuffer - stores the original video data
 * 2. FFmpegTransform - creates a thumbnail from the video
 */
export class StreamProcessor {
    private mainBuffer: BufferTransform;
    private ffmpegStream: FFmpegTransform;
    private mainCompleted = false;
    private ffmpegCompleted = false;
    private resolvePromise: ((result: ProcessingResult) => void) | null = null;
    private rejectPromise: ((error: Error) => void) | null = null;

    /**
     * Creates a new StreamProcessor instance
     * @param {BufferTransform} mainBuffer - Transform stream for storing original video
     * @param {FFmpegTransform} ffmpegStream - Transform stream for creating thumbnail
     */
    constructor(mainBuffer: BufferTransform, ffmpegStream: FFmpegTransform) {
        this.mainBuffer = mainBuffer;
        this.ffmpegStream = ffmpegStream;
    }

    /**
     * Process input stream through parallel transform streams
     * Sets up piping between streams and handles completion
     * @param {Readable} inputStream - Source video stream
     * @returns {Promise<ProcessingResult>} Processed video and thumbnail buffers
     */
    async processStream(inputStream: Readable): Promise<ProcessingResult> {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;

            try {
                const mainPass = new PassThrough();
                const ffmpegPass = new PassThrough();

                this.setupMainStream(mainPass);
                this.setupFfmpegStream(ffmpegPass);
                this.setupInputStream(inputStream, mainPass, ffmpegPass);
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
     * Sets up the main video buffer stream
     * Handles events for data flow and completion
     * @param {PassThrough} mainPass - PassThrough stream for main video data
     */
    private setupMainStream(mainPass: PassThrough): void {
        const mainPipe = mainPass.pipe(this.mainBuffer);
        mainPipe
            .on('data', (chunk) => {
                console.log(`Main stream data chunk: ${chunk.length} bytes`);
            })
            .on('finish', () => {
                console.log('Main stream finished');
                this.mainCompleted = true;
                this.checkCompletion();
            })
            .on('end', () => {
                console.log('Main stream ended');
                this.mainCompleted = true;
                this.checkCompletion();
            })
            .on('error', (error) => {
                console.error('Error in main stream:', error);
                this.handleError(error);
            });
    }

    /**
     * Sets up the FFmpeg transform stream for thumbnail creation
     * Handles events for data flow and completion
     * @param {PassThrough} ffmpegPass - PassThrough stream for FFmpeg processing
     */
    private setupFfmpegStream(ffmpegPass: PassThrough): void {
        const ffmpegPipe = ffmpegPass.pipe(this.ffmpegStream);
        ffmpegPipe
            .on('data', (chunk) => {
                console.log(`FFmpeg stream data chunk: ${chunk.length} bytes`);
            })
            .on('finish', () => {
                console.log('FFmpeg stream finished');
                this.ffmpegCompleted = true;
                this.checkCompletion();
            })
            .on('end', () => {
                console.log('FFmpeg stream ended');
                this.ffmpegCompleted = true;
                this.checkCompletion();
            })
            .on('error', (error) => {
                if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
                    console.log('FFmpeg stream completed (EPIPE expected)');
                    this.ffmpegCompleted = true;
                    this.checkCompletion();
                    return;
                }
                console.error('Error in FFmpeg stream:', error);
                this.handleError(error);
            });
    }

    /**
     * Sets up the input stream and pipes data to both transform streams
     * @param {Readable} inputStream - Source video stream
     * @param {PassThrough} mainPass - PassThrough for main video
     * @param {PassThrough} ffmpegPass - PassThrough for FFmpeg
     */
    private setupInputStream(inputStream: Readable, mainPass: PassThrough, ffmpegPass: PassThrough): void {
        inputStream
            .on('data', (chunk) => {
                mainPass.write(chunk);
                ffmpegPass.write(chunk);
            })
            .on('end', () => {
                mainPass.end();
                ffmpegPass.end();
            })
            .on('error', (error) => {
                console.error('Error in input stream:', error);
                this.handleError(error);
            });
    }

    private checkCompletion(): void {
        if (this.mainCompleted && this.ffmpegCompleted && this.resolvePromise) {
            console.log('All streams completed');
            console.log('Getting buffers...');

            try {
                const mainData = this.mainBuffer.getBuffer();
                const thumbnailData = this.ffmpegStream.getBuffer();

                console.log(`Main buffer size: ${mainData.length} bytes`);
                console.log(`Thumbnail buffer size: ${thumbnailData.length} bytes`);

                if (mainData.length === 0) {
                    throw new Error('Main buffer is empty');
                }

                if (thumbnailData.length === 0) {
                    throw new Error('Thumbnail buffer is empty');
                }

                this.resolvePromise({
                    mainBuffer: mainData,
                    thumbnailBuffer: thumbnailData
                });
            } catch (error) {
                this.handleError(error);
            }
        }
    }
} 