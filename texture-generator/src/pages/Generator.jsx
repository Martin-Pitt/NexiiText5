import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { signal, effect, computed } from '@preact/signals';
import { lazy, LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';
import TGA from '../lib/tga.js';
import { length } from '../lib/vec2.js';
import { AsyncZipDeflate, Zip, ZipPassThrough } from 'fflate';
import { CharsetCommon, CharsetMultiLanguages, CharsetEmojis, CharsetChinese, CharsetJapanese, CharsetKorean, CharsetVietnamese} from '../lib/characters.js';


async function generateUnicodeTexture({
	name,
	textureSize = 2048,
	cellSize = 64,
	columns = 11,
	font = '400 40px Inter, sans-serif',
	backColor = 'transparent',
	textColor = 'white',
	characters = [],
	isFixedWidth = false,
}) {
	await document.fonts.load(font);
	
	if(isFixedWidth) columns = textureSize / cellSize;
	const rows = textureSize / cellSize;
	const columnWidth = textureSize / columns;
	const data = {};
	const maxCharacters = columns * rows;
	const allCharacters = characters.slice();
	const textures = [];
	
	// Render texture canvas per each set of max characters
	// let chIndex = 0;
	for(let chIndex = 0; chIndex < Math.ceil(allCharacters.length / maxCharacters); ++chIndex)
	{
		characters = allCharacters.slice(chIndex * maxCharacters, (chIndex + 1) * maxCharacters);
		
		// Setup canvas
		const canvas = document.createElement('canvas');
		canvas.width = textureSize;
		canvas.height = textureSize;
		canvas.style.aspectRatio = `${textureSize} / ${textureSize}`;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		
		// If there is a back color we draw a background
		// Having a background allows the texture to be rendered softly with anti-aliasing
		// Avoiding the current issues around alpha masking with legibility issues due to pixelated rendering
		if(backColor !== 'transparent')
		{
			ctx.fillStyle = backColor;
			ctx.fillRect(0, 0, textureSize, textureSize);
		}
		
		// Font setup
		ctx.fillStyle = textColor;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top'; // 'alphabetic';
		ctx.font = font;
		
		let baselinePercent = 0.09; // 0.75;
		
		let ColorizedGlyphs = new Set();
		let ColorizedRects = [];
		let UncoloredRects = [];
		let index;
		
		// Debug glyph heights horizontally to determine how close each row is vertically
		// This can be used to help measure how far you can get away with tweaking font size vs cell size
		/*
		index = 0;
		for(let char of characters)
		{
			// Compute metrics
			let metrics = ctx.measureText(char);
			
			let a = index % columns;
			let b = Math.floor(index / columns);
			index++;
			
			let x = columnWidth * 0.5 + columnWidth * a;
			let y = cellSize * b;
			
			let baseline = y + cellSize * baselinePercent;
			let width = metrics.width;
			let halfWidth = width / 2;
			let height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
			let halfHeight = height / 2;
			let top = baseline - metrics.actualBoundingBoxAscent;
			let bottom = baseline + metrics.actualBoundingBoxDescent;
			let left = x - halfWidth;
			let right = x + halfWidth;
			
			ctx.fillStyle = 'lch(20 80 0)';
			ctx.fillRect(0, top, canvas.width, height);
		}
		ctx.fillStyle = textColor;
		//*/
		
		// Measure and draw each glyph
		index = 0;
		for(let char of characters)
		{
			// Compute metrics
			let metrics = ctx.measureText(char);
			
			let a = index % columns;
			let b = Math.floor(index / columns);
			index++;
			
			let x = columnWidth * 0.5 + columnWidth * a;
			let y = cellSize * b;
			
			let baseline = y + cellSize * baselinePercent;
			let width = metrics.width;
			let halfWidth = width / 2;
			let height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
			let halfHeight = height / 2;
			let top = baseline - metrics.actualBoundingBoxAscent;
			let bottom = baseline + metrics.actualBoundingBoxDescent;
			let left = x - halfWidth;
			let right = x + halfWidth;
			
			// Render glyph
			ctx.fillText(char, x, baseline);
			
			
			// TODO: Fix this; Try to confirm whether black/white letterform or a colorized/greyscale glyph (e.g. emoji)
			let isColorized = false;
			
			let rx = x - cellSize * baselinePercent;
			let ry = y + 2;
			let rw = cellSize * 1.5;
			let rh = cellSize;
			
			// Check if glyph is colorized/greyscale instead of black/white by sampling pixels
			// in the glyph area and checking the distribution of colors
			const imageData = ctx.getImageData(rx, ry, rw, rh);
			let colorCount = 0;
			let totalCount = 0;
			for(let i = 0; i < imageData.data.length; i += 4)
			{
				const r = imageData.data[i + 0];
				const g = imageData.data[i + 1];
				const b = imageData.data[i + 2];
				const a = imageData.data[i + 3];
				if(a < 255) continue;
				totalCount++;
				if(r < 200) colorCount++;
				else if(!(r === g && g === b)) colorCount++;
			}
			const colorRatio = colorCount / totalCount;
			if(colorRatio > 0.1) isColorized = true;
			
			if(isColorized)
			{
				// ctx.strokeStyle = 'lch(80 80 215)';
				// ctx.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);
				
				// ctx.fillStyle = 'lch(80 80 215 / 0.3)';
				// ctx.fillRect(left, top, width, height);
				// ctx.fillStyle = textColor;
				
				ColorizedGlyphs.add(char);
				ColorizedRects.push([rx, ry, rw, rh]);
			}
			
			else
			{
				UncoloredRects.push([
					Math.floor(left),
					Math.floor(top),
					Math.ceil(width),
					Math.ceil(height),
				]);
				
				// ctx.strokeRect(left, top + height, width, 1);
				// ctx.strokeRect(left, top, 1, height);
				// ctx.strokeRect(right - 1, top, 1, height);
				// ctx.strokeRect(left, top, width, 1);
				
				// ctx.strokeStyle = 'lch(80 80 0)';
				// ctx.strokeRect(0, top + height, canvas.width, 1);
				// ctx.strokeRect(0, top, 1, height);
				// ctx.strokeRect(right - 1, top, 1, height);
				
				// ctx.strokeStyle = 'lch(80 80 215)';
				// ctx.strokeRect(0, top, canvas.width, 1);
			}
			
			// Save metrics
			data[char] = {
				baseline,
				width, halfWidth,
				height, halfHeight,
				top, bottom,
				left, right,
				
				isColorized,
				
				textureX: x - textureSize/2,
				textureY: 1 - ((y + cellSize/2) / textureSize/2),
				
				// Computed in another pass
				leftGap: 0,
				rightGap: 0,
			};
			
			console.assert(metrics.width > 0, 'Glyph has no width', char, 'U+' + char.codePointAt(0).toString(16), metrics);
		}
		
		// Pass to compute horizontal gaps between glyphs across the columns
		const GAP_MARGIN = 3;
		for(let a  = 0; a < columns; ++a)
		{
			for(let b = 0; b < rows; ++b)
			{
				let index = b + a * rows;
				let char = characters[index];
				if(!char) continue;
				
				let prevColumn = (columns + (a - 1)) % columns;
				let prevChar = characters[b + prevColumn * rows];
				let prevGap = columnWidth - GAP_MARGIN;
				if(prevChar && data[prevChar]) prevGap -= data[prevChar].halfWidth;
				
				let nextColumn = (a + 1) % columns;
				let nextChar = characters[b + nextColumn * rows];
				let nextGap = columnWidth - GAP_MARGIN;
				if(nextChar && data[nextChar]) nextGap -= data[nextChar].halfWidth;
				
				data[char].leftGap = prevGap;
				data[char].rightGap = nextGap;
			}
		}
		
		
		//*
		// Force pixels around uncolored glyphs to white to prevent halo artifacts
		let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		for(let [rx, ry, rw, rh] of UncoloredRects)
		{
			let cx = rx - 4, cy = ry - 4;
			let cw = rw + 6, ch = rh + 6;
			for(let x = cx; x < cx+cw; ++x)
			{
				for(let y = cy; y < cy+ch; ++y)
				{
					if(rx <= x && x < rx+rw && ry <= y && y < ry+rh) continue;
					let index = (x + y * imageData.width) * 4;
					imageData.data[index + 0] = 255;
					imageData.data[index + 1] = 255;
					imageData.data[index + 2] = 255;
				}
			}
		}
		ctx.putImageData(imageData, 0, 0);
		//*/
		
		// If this is the last canvas, then check if we can scale down the height to the closest of two
		if(chIndex === Math.ceil(allCharacters.length / maxCharacters) - 1)
		{
			// Find the last used row
			let lastRow = 0;
			for(let i = 0; i < characters.length; ++i)
			{
				let b = Math.floor(i / columns);
				if(b > lastRow) lastRow = b;
			}
			
			// Crop canvas to ceiling of closest power of two height
			let usedHeight = (lastRow + 1) * cellSize;
			let croppedHeight = Math.pow(2, Math.ceil(Math.log2(usedHeight)));
			if(croppedHeight < textureSize)
			{
				const croppedCanvas = document.createElement('canvas');
				croppedCanvas.width = textureSize;
				croppedCanvas.height = croppedHeight;
				const croppedCtx = croppedCanvas.getContext('2d');
				croppedCtx.drawImage(
					canvas,
					0, 0, canvas.width, croppedHeight,
					0, 0, croppedCanvas.width, croppedCanvas.height
				);
				
				// Replace canvas with cropped version
				canvas.width = croppedCanvas.width;
				canvas.height = croppedCanvas.height;
				ctx.drawImage(croppedCanvas, 0, 0);
			}
		}
		
		// Store texture
		textures.push(canvas);
	}
	
	return {
		textures,
		data,
		meta: {
			name,
			textureSize,
			font,
			columns,
			rows,
			characters: allCharacters,
			isFixedWidth,
		}
	};
}


function TexturesPreview(props) {
	const [sources, setSources] = useState([]);
	useEffect(async () => {
		let urls = [];
		
		if(props.data)
		{
			for(let texture of props.data.textures)
			{
				const blob = await new Promise(resolve => texture.toBlob(resolve));
				const url = URL.createObjectURL(blob);
				urls.push(url);
			}
		}
		
		if(sources) for(let url of sources) URL.revokeObjectURL(url);
		setSources(urls);
	}, [props.data]);
	
	if(!props.data) return <figure class="unicode-texture"></figure>;
	
	const { name, textureSize, font, columns, rows, characters, isFixedWidth } = props.data.meta;
	
	let textureInfo = null;
	if(props.data.textures.length > 1)
	{
		// Check if last texture has a different height
		const lastTexture = props.data.textures[props.data.textures.length - 1];
		if(lastTexture.height < textureSize)
		{
			let plural = props.data.textures.length - 1 > 1 ? 's' : '';
			if(plural) textureInfo = <>
				{props.data.textures.length - 1} &times; {textureSize}&times;{textureSize} textures + {textureSize}&times;{lastTexture.height} texture<br/>
			</>;
			
			else textureInfo = <>
				{textureSize}&times;{textureSize} texture + {textureSize}&times;{lastTexture.height} texture<br/>
			</>;
		}
		else textureInfo = <>{props.data.textures.length} &times; {textureSize}&times;{textureSize} textures<br/></>;
	}
	
	else if(props.data.textures.length == 0);
	
	else textureInfo = <>{textureSize}&times;{props.data.textures[0].height} texture<br/></>;
	
	return (
		<figure class="unicode-texture">
			<figcaption>
				{name}<br/>
				{textureInfo}
				{columns}&times;{rows} grid ({columns * rows} per){isFixedWidth ? ' (fixed width)' : ' (letter spacing)'}<br/>
				font: <code>{font}</code><br/>
				{characters.length} characters
			</figcaption>
			{sources.map(source => (
				<div class="preview-container">
					<img class="preview" src={source}/>
					<a class="expand" href={source} target="_blank">
						<svg class="icon"><use href="#icon-expand"/></svg>
					</a>
				</div>
			))}
		</figure>
	);
}




function DownloadAsZip(props) {
	const [download, setDownload] = useState(null);
	
	// https://github.com/101arrowz/fflate
	// const zip = new Zip((err, data, final) => {
	// 	if(!err) console.log(data, final);
	// });
	// const textureCommonFile = new ZipPassThrough('NT5_Texture_Common.tga');
	// zip.add(textureCommonFile);
	// textureCommonFile.push(tgaData, true);
	// const setupFile = new AsyncZipDeflate('NT5_Setup.luau', { level: 9 });
	// zip.add(setupFile);
	// setupFile.push(new TextEncoder().encode(`-- NexiiText5 Setup Script`), true);
	// zip.end();
	
	useEffect(async () => {
		if(!State.Textures.Common.value) return;
		if(!State.Textures.Japanese.value) return;
		if(!State.Textures.Emojis.value) return;
		if(!State.SetupScript.value) return;
		
		const zip = new Zip((err, data, final) => {
			if(!err) console.log(data, final);
		});
		
		// const textureCommonFile = new ZipPassThrough('NT5_Texture_Common.tga');
		// zip.add(textureCommonFile);
		// textureCommonFile.push(textureCommonTGA, true);
		
	}, [
		State.Textures.Common.value,
		State.Textures.Japanese.value,
		State.Textures.Emojis.value,
		State.SetupScript.value,
	]);
	
	
	if(download) return (
		<a
			class="download"
			href={download.url}
			download={download.filename}
		>
			Download <span class="filename">{download.filename}</span>
		</a>
	);
	
	else return (
		<a
			class="download"
			aria-disabled
		>
			Download …
		</a>
	);
}

const State = {
	// Datasets
	Textures: {
		Common: signal(null),
		MultiLanguages: signal(null),
		Emojis: signal(null),
		Chinese: signal(null),
		Japanese: signal(null),
		// Korean: signal(null),
		Vietnamese: signal(null),
	},
	SetupScript: signal(null),
	
	// Config
	backColor: signal('transparent'),
	textColor: signal('white'),
};

export default function Generator() {
	/*
		Generate:
		- Textures
			- Common
			- Japanese
			- Emojis
			- etc
		- Setup script
		- Download as zip?
	*/
	
	useEffect(async () => {
		const backColor = State.backColor.value;
		const textColor = State.textColor.value;
		State.Textures.Common.value = await generateUnicodeTexture({
			name: 'Common',
			characters: CharsetCommon,
			backColor,
			textColor,
			cellSize: 2048/23,
			columns: 8,
			font: `400 ${(50/64)*(2048/23)}px Inter, sans-serif`,
		});
		State.Textures.MultiLanguages.value = await generateUnicodeTexture({
			name: 'MultiLanguages',
			characters: CharsetMultiLanguages,
			backColor,
			textColor,
			font: `400 52px Inter, sans-serif`,
		});
		State.Textures.Emojis.value = await generateUnicodeTexture({
			name: 'Emojis',
			characters: CharsetEmojis,
			backColor,
			textColor,
			cellSize: 128,
			isFixedWidth: true,
			font: `400 120px Inter, sans-serif`,
		});
		State.Textures.Chinese.value = await generateUnicodeTexture({
			name: 'Chinese',
			characters: CharsetChinese,
			backColor,
			textColor,
			isFixedWidth: true,
			font: `400 64px Inter, sans-serif`,
		});
		State.Textures.Japanese.value = await generateUnicodeTexture({
			name: 'Japanese',
			characters: CharsetJapanese,
			backColor,
			textColor,
			cellSize: 64,
			isFixedWidth: true,
			font: `400 64px Inter, sans-serif`,
		});
		// State.Textures.Korean.value = await generateUnicodeTexture({
		// 	name: 'Korean',
		// 	characters: CharsetKorean,
		// 	backColor,
		// 	textColor,
		// 	font: `400 64px Inter, sans-serif`,
		// });
		State.Textures.Vietnamese.value = await generateUnicodeTexture({
			name: 'Vietnamese',
			characters: CharsetVietnamese,
			backColor,
			textColor,
		});
	}, [
		State.backColor.value,
		State.textColor.value,
	]);
	
	return (
		<div class="page page-generator">
			<header>
				<h1 class="title">Texture Generator</h1> — Work in Progress, no download option yet
			</header>
			<div class="textures">
				<TexturesPreview data={State.Textures.Common.value}/>
				<TexturesPreview data={State.Textures.MultiLanguages.value}/>
				<TexturesPreview data={State.Textures.Emojis.value}/>
				<TexturesPreview data={State.Textures.Chinese.value}/>
				<TexturesPreview data={State.Textures.Japanese.value}/>
				{/* <TexturesPreview data={State.Textures.Korean.value}/> */}
				<TexturesPreview data={State.Textures.Vietnamese.value}/>
			</div>
			<DownloadAsZip/>
		</div>
	)
}