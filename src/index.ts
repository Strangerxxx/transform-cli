import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { BufferTransform } from './transforms/buffer-transform';
import { FFmpegTransform } from './transforms/ffmpeg-transform';
import { StreamProcessor } from './stream-processor';

/**
 * Options for video processing including size and seek time
 */
interface VideoProcessingOptions {
	size?: string;
	seek?: string;
}

/**
 * Process a video stream through parallel transform streams
 * @param {Readable} inputStream - The input video stream to process
 * @param {VideoProcessingOptions} options - Processing options for video transformation
 * @returns {Promise<{mainBuffer: Buffer, thumbnailBuffer: Buffer}>} The processed video and thumbnail buffers
 */
const processVideo = async (
	inputStream: Readable,
	options: VideoProcessingOptions = {}
): Promise<{mainBuffer: Buffer, thumbnailBuffer: Buffer}> => {
	console.log('Starting video processing...');

	const transforms = [
		new BufferTransform(),
		new FFmpegTransform(options.size || '100%', options.seek || '00:00:00.1')
	];

	try {
		const processor = new StreamProcessor(transforms);
		console.log('Running streams...');
		const result = await processor.processStream(inputStream);
		return {
			mainBuffer: result.BufferTransform,
			thumbnailBuffer: result.FFmpegTransform
		};
	} finally {
		transforms.forEach(t => t.destroy());
	}
};

/**
 * Process a video file and save the results
 * Main processing flow:
 * 1. Validates input file existence
 * 2. Creates input stream from file
 * 3. Processes video through parallel streams
 * 4. Saves processed video and thumbnail to output directory
 * 
 * @param {string} input - Path to input video file
 * @param {string} output - Path to output directory
 * @param {VideoProcessingOptions} options - Processing options
 * @returns {Promise<void>}
 */
const processVideoFile = async (
	input: string,
	output: string,
	options: VideoProcessingOptions = {}
): Promise<void> => {
	try {
		if (!fs.existsSync(input)) {
			throw new Error(`Input file not found: ${input}`);
		}

		console.log('Started processing:', input);

		// Create input stream
		const inputStream = fs.createReadStream(input);

		// Process the video
		const { mainBuffer: mainData, thumbnailBuffer: thumbnailData } = await processVideo(inputStream, options);

		// Create output directory if it doesn't exist
		fs.mkdirSync(output, { recursive: true });

		// Save the files
		const originalPath = path.join(output, 'original.mp4');
		const thumbnailPath = path.join(output, 'thumbnail.jpg');

		console.log('Writing files...');
		fs.writeFileSync(originalPath, mainData);
		fs.writeFileSync(thumbnailPath, thumbnailData);

		console.log('Files written successfully');
		console.log('Original file:', originalPath);
		console.log('Thumbnail file:', thumbnailPath);
		console.log('Processing completed successfully');
	} catch (error) {
		console.error('\nError:', error);
		throw error;
	}
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
		try {
			await processVideoFile(input, output, {
				size: options.size,
				seek: options.seek
			});
		} catch (error) {
			process.exit(1);
		}
	});

program.parse();
