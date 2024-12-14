import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { BufferTransform } from './transforms/buffer-transform';
import { FFmpegTransform } from './transforms/ffmpeg-transform';
import { StreamProcessor } from './stream-processor';

const processVideo = async (
	input: string,
	output: string,
	mainBuffer: BufferTransform,
	ffmpegStream: FFmpegTransform
) => {
	console.log('Starting video processing...');

	try {
		const inputStream = fs.createReadStream(input);
		const processor = new StreamProcessor(mainBuffer, ffmpegStream);
		
		console.log('Running streams...');
		const { mainBuffer: mainData, thumbnailBuffer: thumbnailData } = await processor.processStream(inputStream);

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
	} catch (error) {
		console.error('Error during video processing:', error);
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
