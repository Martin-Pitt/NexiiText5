import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { signal, effect, computed } from '@preact/signals';
import { lazy, LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';
import TGA from '../lib/tga.js';
import { length } from '../lib/vec2.js';
import { AsyncZipDeflate, Zip, ZipPassThrough } from 'fflate';
import { CharsetCommon, CharsetJapanese, CharsetEmojis } from '../lib/characters.js';


async function generateUnicodeTexture({
	name,
	textureSize = 2048,
	cellSize = 64,
	columns = 11,
	font = '400 40px Inter, sans-serif',
	backColor = 'transparent',
	textColor = 'white',
	characters = [],
}) {
	const rows = textureSize / cellSize;
	const columnWidth = textureSize / columns;
	const data = {};
	
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
	await document.fonts.load(font);
	ctx.fillStyle = textColor;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.font = font;
	
	let ColorizedGlyphs = new Set();
	let ColorizedRects = [];
	let UncoloredRects = [];
	
	// Measure and draw each glyph
	let index = 0;
	for(let char of characters)
	{
		// Compute metrics
		let metrics = ctx.measureText(char);
		
		let a = Math.floor(index / rows);
		let b = index % rows;
		index++;
		
		let x = columnWidth * 0.5 + columnWidth * a;
		let y = cellSize * b;
		
		let baseline = y + cellSize * 0.75;
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
		
		let rx = x - cellSize * 0.75;
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
			if(a === 0) continue;
			totalCount++;
			if(!(r === g && g === b)) colorCount++;
		}
		const colorRatio = colorCount / totalCount;
		if(colorRatio > 0.1) isColorized = true;
		
		if(isColorized)
		{
			ctx.strokeStyle = 'lch(80 80 215)';
			ctx.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);
			
			ColorizedGlyphs.add(char);
			ColorizedRects.push([rx, ry, rw, rh]);
		}
		
		else
		{
			UncoloredRects.push([
				Math.floor(left),
				Math.floor(top),
				Math.floor(width),
				Math.floor(height),
			]);
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
	
	
	/*
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
	*/
	
	
	return {
		canvas,
		data,
		meta: {
			name,
			textureSize,
			font,
			columns,
			rows,
			characters,
		}
	};
}



function TexturePreview(props) {
	const [src, setSrc] = useState(null);
	
	useEffect(() => {
		if(props.preview) props.preview.canvas.toBlob((blob) => {
			const url = URL.createObjectURL(blob);
			if(src) URL.revokeObjectURL(src);
			setSrc(url);
		});
		
		else if(src) { URL.revokeObjectURL(src); setSrc(null); }
	}, [props.preview]);
	
	if(props.preview)
	{
		const { name, textureSize, font, columns, rows, characters } = props.preview.meta;
		return (
			<figure class="unicode-texture">
				<img class="preview" src={src}/>
				<figcaption>
					{name}<br/>
					{textureSize}&times;{textureSize} texture<br/>
					{columns}&times;{rows} grid ({columns * rows})<br/>
					font: <code>{font}</code><br/>
					{characters.length} characters
				</figcaption>
				<a class="expand" href={src} target="_blank">
					<svg class="icon"><use href="#icon-expand"/></svg>
				</a>
			</figure>
		);
	}
	
	else return (
		<figure class="unicode-texture"></figure>
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
		Japanese: signal(null),
		Emojis: signal(null),
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
		});
	}, [
		State.backColor.value,
		State.textColor.value,
	]);
	
	return (
		<div class="page page-generator">
			<header>
				<h1 class="title">Texture Generator</h1> — Work in Progress; Generates only the common texture right now with no download yet
			</header>
			<div class="textures">
				<TexturePreview preview={State.Textures.Common.value}/>
				<TexturePreview preview={State.Textures.Japanese.value}/>
				<TexturePreview preview={State.Textures.Emojis.value}/>
			</div>
			<DownloadAsZip/>
		</div>
	)
}