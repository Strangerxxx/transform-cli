import { ChildProcessTransform } from "./child-transform";

interface Size {
	percentage?: number;
	width?: number | null;
	height?: number | null;
}

export class FFmpegTransform extends ChildProcessTransform {
	constructor(size = "100%", seek = "00:00:00.1") {
		const ffmpegArgs = FFmpegTransform.buildFfmpegArgs(FFmpegTransform.parseSize(size), seek);

		super({
			command: 'ffmpeg',
			args: ffmpegArgs,
			timeout: 60000
		});
	}

	private static parseSize(sizeStr: string): Size {
		const invalidSizeString = new Error("Invalid size string");
		const percentRegex = /(\d+)%/g;
		const sizeRegex = /(\d+|\?)x(\d+|\?)/g;
		let size: Size;

		const percentResult = percentRegex.exec(sizeStr);
		const sizeResult = sizeRegex.exec(sizeStr);

		if (percentResult) {
			size = { percentage: Number.parseInt(percentResult[1]) };
		} else if (sizeResult) {
			const sizeValues = sizeResult.map((x) => (x === "?" ? null : Number.parseInt(x)));

			size = {
				width: sizeValues[1],
				height: sizeValues[2],
			};
		} else {
			throw invalidSizeString;
		}

		if (size.width === null && size.height === null) {
			throw invalidSizeString;
		}

		return size;
	}

	private static buildFfmpegArgs({ width, height, percentage }: Size, seek: string): string[] {
		const scaleArg = percentage
			? `scale=iw*${percentage / 100}:ih*${percentage / 100}`
			: `scale=${width || -1}:${height || -1}`;

		return [
			'-y',              // Overwrite output files
			'-i', 'pipe:0',    // Input from pipe
			'-ss', seek,       // Seek position
			'-vframes', '1',   // Extract one frame
			'-vf', scaleArg,   // Scale video
			'-f', 'mjpeg',     // Force MJPEG format for output
			'-loglevel', 'warning', // Show warnings and errors
			'-nostdin',        // Disable interaction
			'pipe:1'           // Output to pipe
		];
	}
}
