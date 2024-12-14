import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import { BufferTransform } from './transforms/buffer-transform';
import { FFmpegTransform } from './transforms/ffmpeg-transform';

const processVideo = async (
	input: string,
	output: string,
	mainBuffer: BufferTransform,
	ffmpegStream: FFmpegTransform
) => {
	console.log('Starting video processing...');

	return new Promise((resolve, reject) => {
		try {
			// Create a single input stream
			const inputStream = fs.createReadStream(input);
			
			// Create two PassThrough streams to duplicate the data
			const mainPass = new PassThrough();
			const ffmpegPass = new PassThrough();

			console.log('Running streams...');

			let mainCompleted = false;
			let ffmpegCompleted = false;

			// Handle main stream
			const mainPipe = mainPass.pipe(mainBuffer);
			mainPipe
				.on('data', (chunk) => {
					console.log(`Main stream data chunk: ${chunk.length} bytes`);
				})
				.on('finish', () => {
					console.log('Main stream finished');
					mainCompleted = true;
					checkCompletion();
				})
				.on('end', () => {
					console.log('Main stream ended');
					mainCompleted = true;
					checkCompletion();
				})
				.on('error', (error) => {
					console.error('Error in main stream:', error);
					reject(error);
				});

			// Handle FFmpeg stream
			const ffmpegPipe = ffmpegPass.pipe(ffmpegStream);
			ffmpegPipe
				.on('data', (chunk) => {
					console.log(`FFmpeg stream data chunk: ${chunk.length} bytes`);
				})
				.on('finish', () => {
					console.log('FFmpeg stream finished');
					ffmpegCompleted = true;
					checkCompletion();
				})
				.on('end', () => {
					console.log('FFmpeg stream ended');
					ffmpegCompleted = true;
					checkCompletion();
				})
				.on('error', (error) => {
					// Ignore EPIPE errors from FFmpeg
					if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
						console.log('FFmpeg stream completed (EPIPE expected)');
						ffmpegCompleted = true;
						checkCompletion();
						return;
					}
					console.error('Error in FFmpeg stream:', error);
					reject(error);
				});

			// Pipe input stream to both PassThrough streams
			inputStream.on('data', (chunk) => {
				mainPass.write(chunk);
				ffmpegPass.write(chunk);
			});

			inputStream.on('end', () => {
				mainPass.end();
				ffmpegPass.end();
			});

			inputStream.on('error', (error) => {
				console.error('Error in input stream:', error);
				reject(error);
			});

			function checkCompletion() {
				if (mainCompleted && ffmpegCompleted) {
					console.log('All streams completed');
					try {
						// Create output directory if it doesn't exist
						fs.mkdirSync(output, { recursive: true });

						// Save the files
						const originalPath = path.join(output, 'original.mp4');
						const thumbnailPath = path.join(output, 'thumbnail.jpg');

						console.log('Getting buffers...');
						const mainData = mainBuffer.getBuffer();
						const thumbnailData = ffmpegStream.getBuffer();

						console.log(`Main buffer size: ${mainData.length} bytes`);
						console.log(`Thumbnail buffer size: ${thumbnailData.length} bytes`);

						if (mainData.length === 0) {
							throw new Error('Main buffer is empty');
						}

						if (thumbnailData.length === 0) {
							throw new Error('Thumbnail buffer is empty');
						}

						// Write files
						console.log('Writing files...');
						fs.writeFileSync(originalPath, mainData);
						fs.writeFileSync(thumbnailPath, thumbnailData);

						console.log('Files written successfully');
						console.log('Original file:', originalPath);
						console.log('Thumbnail file:', thumbnailPath);

						resolve(undefined);
					} catch (error) {
						reject(error);
					}
				}
			}
		} catch (error) {
			reject(error);
		}
	});
};

const program = new Command();

program
	.name('transform-cli')
	.description('CLI tool for testing transform streams')
	.version('1.0.0');

program
	.command('process-video')
	.description('Process a video file through FFmpeg transform')
	.argument('<input>', 'input video file path')
	.argument('<output>', 'output directory path')
	.option('-s, --size <size>', 'output size (e.g., "100%", "640x480")', '100%')
	.option('-t, --seek <time>', 'seek time (HH:MM:SS.ms)', '00:00:00.1')
	.action(async (input: string, output: string, options) => {
		let mainBuffer: BufferTransform | null = null;
		let ffmpegStream: FFmpegTransform | null = null;

		try {
			if (!fs.existsSync(input)) {
				throw new Error(`Input file not found: ${input}`);
			}

			console.log('Started processing:', input);

			mainBuffer = new BufferTransform('MainBuffer');
			ffmpegStream = new FFmpegTransform(options.size, options.seek);

			if (!mainBuffer || !ffmpegStream) {
				throw new Error('Failed to create transform streams');
			}

			await processVideo(input, output, mainBuffer, ffmpegStream);
			console.log('Processing completed successfully');

		} catch (error) {
			console.error('\nError:', error);
			process.exit(1);
		} finally {
			if (mainBuffer) mainBuffer.destroy();
			if (ffmpegStream) ffmpegStream.destroy();
		}
	});

program.parse();
