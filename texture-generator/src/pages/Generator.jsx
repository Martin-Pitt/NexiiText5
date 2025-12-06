import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { signal, effect, computed } from '@preact/signals';
import { lazy, LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';
import classNames from 'classnames';
import TGA from '../lib/tga.js';
import { AsyncZipDeflate, Zip, ZipPassThrough } from 'fflate';
import {
	CharsetCommon,
	CharsetMultiLanguages,
	CharsetEmojis,
	CharsetMiscCJK,
	CharsetChineseSimplified,
	CharsetChineseTraditional,
	CharsetJapanese,
	CharsetKorean,
} from '../lib/characters.js';


function DownloadAsZip(props) {
	const [download, setDownload] = useState(null);
	const data = State.Data.value;
	
	useEffect(async () => {
		if(!State.Fonts.Inter.value) return;
		if(!State.Fonts.Emojis.value) return;
		if(!data) return setDownload(null);
		
		await Promise.all([
			...State.Fonts.Inter.value.texturesQueue,
			...State.Fonts.Emojis.value.texturesQueue
		]);
		
		const streams = [];
		const zip = new Zip((err, chunk, final) => {
			if(err) throw err;
			
			streams.push(chunk);
			
			if(final)
			{
				const blob = new Blob(streams, { type: 'application/octet-stream' });
				const url = URL.createObjectURL(blob);
				setDownload({
					url,
					filename: 'NT5_Textures.zip',
				});
			}
		});
		
		/*
		const dataFile = new AsyncZipDeflate('NT5_Data.luau', { level: 9 });
		zip.add(dataFile);
		dataFile.push(new TextEncoder().encode(generateSLuaFromData(data)), true);
		*/
		
		const dataFile = new AsyncZipDeflate('NT5_Data.txt', { level: 9 });
		zip.add(dataFile);
		dataFile.push(new TextEncoder().encode(generateNotecardFromData(data)), true);
		
		for(let font of [
			State.Fonts.Inter.value,
			State.Fonts.Emojis.value
		]) {
			let images = font.texturesChain;
			for(let iter = 0; iter < images.length; ++iter) images[iter] = await images[iter]();
			
			for(let iter = 0; iter < font.textures.length; ++iter)
			{
				const texture = font.textures[iter];
				const image = images[iter];
				// const tga = generateTGAfromCanvas(texture);
				const tga = new TGA({
					width: texture.width,
					height: texture.height,
					imageType: TGA.Type.RLE_RGB,
				});
				tga.setImageData(image);
				
				const filename = `NT5_Texture_${font.name}_${font.textures.indexOf(texture)}.tga`;
				const textureFile = new ZipPassThrough(filename);
				zip.add(textureFile);
				textureFile.push(new Uint8Array(tga.arrayBuffer), true);
				
				await new Promise(r => requestAnimationFrame(r));
			}
		}
		
		zip.end();
	}, [
		State.Fonts.Inter.value,
		State.Fonts.Emojis.value,
		data,
	]);
	
	if(!download) return <div class="zip">
		<div class="generating-indicator">Packing assets...</div>
		<div class="packing-loader"/>
	</div>;
	
	return (
		<div class="zip">
			<a
				class="download"
				href={download.url}
				download={download.filename}
			>
				Download <span class="filename">{download.filename}</span>
			</a>
		</div>
	);
}

function TexturesPreview(props) {
	const [sources, setSources] = useState([]);
	const [isStillRendering, setRendering] = useState(false);
	
	useEffect(async () => {
		if(!props.font)
		{
			setSources([]);
			return;
		}
		
		setRendering(true);
		
		let urls = [];
		for(let index = 0; index < props.font.textures.length; ++index)
		{
			await props.font.texturesQueue[index];
			const texture = props.font.textures[index];
			let blob = await new Promise(resolve => texture.toBlob(resolve));
			let link = URL.createObjectURL(blob);
			urls.push(link);
			setSources(urls.slice());
			
			await new Promise(r => requestAnimationFrame(r));
		}
		setRendering(false);
	}, [props.font]);
	
	if(!props.font) return <figure class="unicode-texture"></figure>;
	
	const {
		name,
		fontFamily, fontSize,
		type,
		columns, rows,
		cellSize,
		characters,
		textures,
	} = props.font;
	
	return (
		<figure class={classNames("unicode-texture", { 'busy-rendering': isStillRendering })}>
			<figcaption>
				{name}<br/>
				{columns}&times;{rows} grid, {Math.round(cellSize * 100)/100}px cells ({type})<br/>
				font: <code>{fontSize.toFixed(0)}px {fontFamily}</code><br/>
				{characters.length} characters<br/>
				{textures.length} textures<br/>
			</figcaption>
			{sources.map(source => (
				<div class="preview-container">
					<img class="preview" src={source}/>
					<a class="expand" href={source} target="_blank">
						<svg class="icon"><use href="#icon-expand"/></svg>
					</a>
				</div>
			))}
			{isStillRendering && (<>
				<div class="rendering-indicator">Rendering...</div>
				<div class="texture-loader"/>
			</>)}
		</figure>
	);
}

function FontsData(props) {
	const [dataURL, setDataURL] = useState(null);
	const [sluaDataURL, setSLuaDataURL] = useState(null);
	const data = State.Data.value;
	
	if(!data) return <div class="fonts-data">
		<div class="generating-indicator">Generating data...</div>
		<div class="data-loader"/>
	</div>;
	
	useEffect(async () => {
		const json = JSON.stringify(data);
		let blob = new Blob([json], { type: 'application/json' });
		let link = URL.createObjectURL(blob);
		setDataURL({ link, blob });
		const code = generateSLuaFromData(data);
		blob = new Blob([code], { type: 'application/text' });
		link = URL.createObjectURL(blob);
		setSLuaDataURL({ link, blob });
	}, [data]);
	
	return (
		<div class="fonts-data">
			{dataURL && (
				<a href={dataURL.link} target="_blank" class="download-metrics">
					{(dataURL.blob.size/1024).toFixed(2)}KB Data
				</a>
			)}
			{sluaDataURL && (
				<a href={sluaDataURL.link} target="_blank" class="download-metrics">
					{(sluaDataURL.blob.size/1024).toFixed(2)}KB SLua Code
				</a>
			)}
		</div>
	);
}

async function getFontMetrics(fontFamily) {
	const ctx = document.createElement('canvas').getContext('2d');
	ctx.font = `400 ${FontBaseUnit}px ${fontFamily}, sans-serif`;
	await document.fonts.load(ctx.font);
	
	const fontMetrics = ctx.measureText('a');
	return {
		fontBoundingBoxAscent: fontMetrics.fontBoundingBoxAscent,
		fontBoundingBoxDescent: fontMetrics.fontBoundingBoxDescent,
		fontBoundingBoxHeight: fontMetrics.fontBoundingBoxAscent + fontMetrics.fontBoundingBoxDescent,
		baselinePercent: fontMetrics.fontBoundingBoxAscent / (fontMetrics.fontBoundingBoxAscent + fontMetrics.fontBoundingBoxDescent),
		whitespace: {
			'\u0020': Math.round(ctx.measureText('\u0020').width), // Space
			'\u2002': Math.round(ctx.measureText('\u2002').width), // EN Space
			'\u2003': Math.round(ctx.measureText('\u2003').width), // EM Space
			'\u2004': Math.round(ctx.measureText('\u2004').width), // Three-per-EM Space
			'\u2005': Math.round(ctx.measureText('\u2005').width), // Four-per-EM Space
			'\u2006': Math.round(ctx.measureText('\u2006').width), // Six-per-EM Space
			'\u2007': Math.round(ctx.measureText('\u2007').width), // Figure Space
			'\u2008': Math.round(ctx.measureText('\u2008').width), // Punctuation Space
			'\u2009': Math.round(ctx.measureText('\u2009').width), // Thin Space
			'\u200A': Math.round(ctx.measureText('\u200A').width), // Hair Space
		},
	};
}

async function generateFontTextureSet(settings) {
	const {
		name,
		fontFamily,
		backColor,
		textColor,
		type,
		columns,
	} = settings;
	let characters = settings.characters;
	
	if(!(fontFamily in FontMetrics)) FontMetrics[fontFamily] = await getFontMetrics(fontFamily);
	const fontMetrics = FontMetrics[fontFamily];
	
	const cellSize = settings.cellSize || TextureSize / columns;
	const rows = TextureSize / cellSize;
	const columnWidth = TextureSize / columns;
	const data = {};
	const maxCharacters = columns * rows;
	const allCharacters = characters.slice();
	const textures = [];
	const textureCharacters = [];
	const textureContexts = [];
	
	const fontSize = (cellSize / fontMetrics.fontBoundingBoxHeight) * FontBaseUnit;
	const font = `400 ${fontSize}px ${fontFamily}, sans-serif`;
	const fontBase = `400 ${FontBaseUnit}px ${fontFamily}, sans-serif`;
	
	for(let canvasIndex = 0; canvasIndex < Math.ceil(allCharacters.length / maxCharacters); ++canvasIndex)
	{
		// Setup canvas
		const canvas = document.createElement('canvas');
		canvas.width = TextureSize;
		canvas.height = TextureSize;
		canvas.style.aspectRatio = `${TextureSize} / ${TextureSize}`;
		const ctx = canvas.getContext('2d', {
			// alpha: true,
			willReadFrequently: true,
			// colorType: 'float16',
			// colorSpace: 'srgb',
		});
		
		// If there is a back color we draw a background; Having a background allows the texture to be rendered softly with anti-aliasing
		// Avoiding the current issues around alpha masking with legibility issues due to pixelated rendering
		if(backColor !== 'transparent')
		{
			ctx.fillStyle = backColor;
			ctx.fillRect(0, 0, TextureSize, TextureSize);
		}
		
		// Font setup
		ctx.fillStyle = textColor;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		ctx.font = font;
		
		// Set all image data to white transparent initially
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		for(let i = 0; i < imageData.data.length; i += 4)
		{
			imageData.data[i + 0] = 255;
			imageData.data[i + 1] = 255;
			imageData.data[i + 2] = 255;
			imageData.data[i + 3] = 0;
		}
		ctx.putImageData(imageData, 0, 0);
		
		textures.push(canvas);
		textureCharacters[canvasIndex] = allCharacters.slice(canvasIndex * maxCharacters, (canvasIndex + 1) * maxCharacters);
		textureContexts[canvasIndex] = ctx;
	}
	
	// If characters contain alphabetic characters then lets compute kerning as well
	if(allCharacters.some(c => /[a-zA-Z]/.test(c)))
	{
		const ctx = document.createElement('canvas').getContext('2d');
		ctx.font = font;
		await document.fonts.load(ctx.font);
		
		const kerning = {};
		// Compute kerning pairs only between the alphabetic characters
		const alphabeticChars = allCharacters.filter(c => /[a-zA-Z]/.test(c));
		for(let firstChar of alphabeticChars)
		{
			for(let secondChar of alphabeticChars)
			{
				const pair = firstChar + secondChar;
				const widthFirst = ctx.measureText(firstChar).width;
				const widthSecond = ctx.measureText(secondChar).width;
				const widthPair = ctx.measureText(pair).width;
				const kernValue = widthPair - (widthFirst + widthSecond);
				if(kernValue !== 0) kerning[pair] = Math.round((kernValue / fontSize) * FontBaseUnit);
			}
		}
		
		FontMetrics[fontFamily].kerning = kerning;
	}
	
	async function renderTexture(canvas, ctx, characters) {
		// await new Promise(r => requestAnimationFrame(r));
		
		let index = -1;
		const UncoloredRects = [];
		const ColorizedRects = [];
		for(let character of characters)
		{
			// Grid coordinates
			index++;
			let a = index % columns;
			let b = Math.floor(index / columns);
			let x = columnWidth * 0.5 + columnWidth * a;
			let y = cellSize * b;
			
			// Crop to cell
			ctx.save();
			ctx.beginPath();
			ctx.rect(x - columnWidth/2, y, columnWidth, cellSize);
			ctx.clip();
			
			// Render glyph
			y += cellSize * fontMetrics.baselinePercent;
			ctx.fillText(character, x, y);
			
			ctx.restore();
			
			// Check if glyph is colorized/greyscale instead of black/white
			let isColorized = false;
			let rx = Math.floor(x - cellSize/2);
			let ry = Math.floor(y - cellSize * fontMetrics.baselinePercent);
			let rw = Math.ceil(cellSize);
			let rh = Math.ceil(cellSize);
			
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
			
			if(isColorized) ColorizedRects.push([ rx, ry, rw, rh ]);
			else UncoloredRects.push([ rx, ry, rw, rh ]);
			
			
			
			// Save metrics
			ctx.font = fontBase;
			let metrics = ctx.measureText(character);
			ctx.font = font;
			data[character] = {
				texture: canvas,
				index: 1 + index,
				width: metrics.width, 
				leftGap: 0,
				rightGap: 0,
				textureX: x - TextureSize/2,
				textureY: 1 - ((y + cellSize/2) / TextureSize/2),
				color: isColorized,
			};
		}
		
		const GAP_MARGIN = 2;
		for(let a = 0; a < columns; ++a)
		{
			for(let b = 0; b < rows; ++b)
			{
				let index = a + b * columns;
				if(index >= characters.length) continue;
				let character = characters[index];
				
				let prevColumn = (columns + (a - 1)) % columns;
				let prevCharacter = characters[prevColumn + b * columns];
				let prevGap = ((columnWidth - GAP_MARGIN) / fontSize) * FontBaseUnit;
				if(prevCharacter && data[prevCharacter]) prevGap -= data[prevCharacter].width/2;
				
				let nextColumn = (a + 1) % columns;
				let nextCharacter = characters[nextColumn + b * columns];
				let nextGap = ((columnWidth - GAP_MARGIN) / fontSize) * FontBaseUnit;
				if(nextCharacter && data[nextCharacter]) nextGap -= data[nextCharacter].width/2;
				
				data[character].width = Math.floor(data[character].width);
				data[character].leftGap = Math.floor(prevGap);
				data[character].rightGap = Math.floor(nextGap);
			}
		}
		
		// await new Promise(r => requestAnimationFrame(r));
		
		// Crop height down to closest power of two
		let lastRow = Math.floor((characters.length - 1) / columns);
		let usedHeight = (lastRow + 1) * cellSize;
		let croppedHeight = Math.pow(2, Math.ceil(Math.log2(usedHeight)));
		if(croppedHeight < TextureSize)
		{
			const croppedCanvas = document.createElement('canvas');
			croppedCanvas.width = TextureSize;
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
		
		// await new Promise(r => requestAnimationFrame(r));
		
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		
		// Loop through each colourized rect and fill in fully transparent pixels with the closest opaque pixel
		for(let [rx, ry, rw, rh] of ColorizedRects)
		{
			await new Promise(r => requestAnimationFrame(r));
			
			// Spiral out from current pixel to find closest opaque pixel for each transparent pixel
			for(let x = rx; x < rx+rw; ++x)
			{
				for(let y = ry; y < ry+rh; ++y)
				{
					let index = (x + y * imageData.width) * 4;
					if(imageData.data[index + 3] === 0)
					{
						// Find closest opaque pixel by spiral search from current position
						let closestColor = null;
						for(let radius = 1; radius < 4; ++radius) {
							for(let dx = -radius; dx <= radius; ++dx) {
								for(let dy = -radius; dy <= radius; ++dy) {
									if(Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
									const px = x + dx;
									const py = y + dy;
									if(px < 0 || px >= imageData.width || py < 0 || py >= imageData.height) continue;
									const ci = (px + py * imageData.width) * 4;
									if(imageData.data[ci + 3] === 255) {
										closestColor = [imageData.data[ci], imageData.data[ci + 1], imageData.data[ci + 2]];
										break;
									}
								}
								if(closestColor) break;
							}
							if(closestColor) break;
						}
						if(closestColor) {
							imageData.data[index] = closestColor[0];
							imageData.data[index + 1] = closestColor[1];
							imageData.data[index + 2] = closestColor[2];
							imageData.data[index + 3] = 1;
						}
					}
				}
			}
		}
		
		// Force pixels around uncolored glyphs to white to prevent halo artifacts
		for(let [rx, ry, rw, rh] of UncoloredRects)
		{
			await new Promise(r => requestAnimationFrame(r));
			
			// Loop through each pixel in the rect and set it to white
			for(let x = rx; x < rx+rw; ++x)
			{
				for(let y = ry; y < ry+rh; ++y)
				{
					let index = (x + y * imageData.width) * 4;
					imageData.data[index + 0] = 255;
					imageData.data[index + 1] = 255;
					imageData.data[index + 2] = 255;
				}
			}
		}
		
		// Loop through each colourized rect and fill in fully transparent pixels with the closest opaque pixel
		for(let [rx, ry, rw, rh] of UncoloredRects)
		{
			await new Promise(r => requestAnimationFrame(r));
			
			// Spiral out from current pixel to find closest opaque pixel for each transparent pixel
			for(let x = rx; x < rx+rw; ++x)
			{
				for(let y = ry; y < ry+rh; ++y)
				{
					let index = (x + y * imageData.width) * 4;
					if(imageData.data[index + 3] === 0)
					{
						// Find closest opaque pixel by spiral search from current position
						let closestColor = null;
						for(let radius = 1; radius < 2; ++radius) {
							for(let dx = -radius; dx <= radius; ++dx) {
								for(let dy = -radius; dy <= radius; ++dy) {
									if(Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
									const px = x + dx;
									const py = y + dy;
									if(px < 0 || px >= imageData.width || py < 0 || py >= imageData.height) continue;
									const ci = (px + py * imageData.width) * 4;
									if(imageData.data[ci + 3] === 255) {
										closestColor = [imageData.data[ci], imageData.data[ci + 1], imageData.data[ci + 2]];
										break;
									}
								}
								if(closestColor) break;
							}
							if(closestColor) break;
						}
						if(closestColor) {
							imageData.data[index] = closestColor[0];
							imageData.data[index + 1] = closestColor[1];
							imageData.data[index + 2] = closestColor[2];
							imageData.data[index + 3] = 1;
						}
					}
				}
			}
		}
		
		// Force any pixels that are black transparent to white transparent
		for(let i = 0; i < imageData.data.length; i += 4)
		{
			if(imageData.data[i + 3] === 0)
			{
				imageData.data[i + 0] = 255;
				imageData.data[i + 1] = 255;
				imageData.data[i + 2] = 255;
			}
		}
		
		// ctx.putImageData(imageData, 0, 0);
		
		await new Promise(r => requestAnimationFrame(r));
		
		return imageData
	}
	
	const texturesQueue = [];
	const _renderTextureChain = [];
	for(let index = 0; index < textures.length; ++index)
	{
		const texture = textures[index];
		const ctx = textureContexts[index];
		const characters = textureCharacters[index];
		_renderTextureChain.push(() => renderTexture(texture, ctx, characters));
	}
	
	_renderTextureChain.reduce((p, f) => {
		let step = p.then(f);
		texturesQueue.push(step);
		return step;
	}, Promise.resolve());
	
	return {
		name,
		fontFamily, fontSize,
		type,
		columns, rows,
		cellSize,
		characters: allCharacters,
		textures,
		texturesQueue,
		texturesChain: _renderTextureChain,
		textureSize: TextureSize,
		data,
	};
}

async function dataFromFontTextureSets(fonts) {
	let data = {
		fonts: [],
		textures: [],
		characters: {}
	};
	let textures = [];
	
	for(let font of fonts)
	{
		const fontIndex = 1 + data.fonts.length;
		const { name, type, columns, rows, cellSize, fontSize, textures, textureSize } = font;
		const fontData = { name, type, columns, rows, cellSize, fontSize, textureSize, textureCount: textures.length };
		
		if(font.type === 'proportional')
		{
			fontData.whitespace = FontMetrics[font.fontFamily].whitespace;
			if(FontMetrics[font.fontFamily].kerning) fontData.kerning = FontMetrics[font.fontFamily].kerning;
		}
		
		data.fonts.push(fontData);
		
		for(let texture of font.textures)
		{
			data.textures.push({
				uuid: '',
				width: texture.width,
				height: texture.height,
				font: fontIndex,
			});
			textures.push(texture);
		}
		
		for(let character of font.characters)
		{
			const metrics = font.data[character];
			const textureIndex = 1 + textures.indexOf(metrics.texture);
			if(font.type === 'fixed') data.characters[character] = [
				fontIndex,
				textureIndex,
				metrics.index,
				metrics.color ? 1 : 0,
			];
			else data.characters[character] = [
				fontIndex,
				textureIndex,
				metrics.index,
				metrics.width,
				metrics.leftGap,
				metrics.rightGap,
				metrics.color ? 1 : 0,
			];
		}
	}
	
	return data;
}

function generateSLuaFromData(data) {
	return `
local Data = {
	Fonts = {
		${data.fonts.map(font => `{
			name = "${font.name}",
			type = "${font.type}",
			columns = ${font.columns},
			rows = ${font.rows},
			cellSize = ${font.cellSize}
		}`).join(',\n\t\t')}
	},
	Textures = {
		${data.textures.map(texture => `{
			uuid = uuid("${texture.uuid || '00000000-0000-0000-0000-000000000000'}"),
			width = ${texture.width}, height = ${texture.height}
		}`).join(',\n\t\t')}
	},
	Characters = {
		${Object.entries(data.characters).map(([char, metrics]) => {
			if(char === '"') char = '\\"';
			else if(char === '\\') char = '\\\\';
			return `["${char}"] = { ${metrics.join(', ')} }`;
		}).join(',\n\t\t')}
	},
}
`;
}

function generateNotecardFromData(data) {
	return [
		...data.fonts.flatMap(item => {
			let kerning = item.kerning;
			delete item.kerning;
			let items = ['Font' + JSON.stringify(item)];
			if(kerning && Object.keys(kerning).length > 0)
			{
				let entries = Object.entries(kerning);
				for(let i = 0; i < entries.length; i += 100)
				{
					let group = entries.slice(i, i + 100);
					let kerningGroup = group.reduce((obj, [pair, value]) => {
						obj[pair] = value;
						return obj;
					}, {});
					items.push('Kerning' + JSON.stringify(kerningGroup));
				}
			}
			return items;
		}),
		...data.textures.map(item => 'Texture' + JSON.stringify(item)),
		...Object.entries(data.characters).map(([char, metrics]) => (
			char + String.fromCodePoint(0xE000) + metrics.join(',')
		)),
	].join('\n');
}

function generateTGAfromCanvas(canvas) {
	const tga = new TGA({
		width: canvas.width,
		height: canvas.height,
		imageType: TGA.Type.RLE_RGB,
	});
	
	const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
	tga.setImageData(imageData);
	return tga;
}

const FontMetrics = {};
const FontBaseUnit = 1000; // We'll save all metrics relative to this base unit, which also represents 1 em square
const TextureSize = 1024;

const State = {
	InterSettings: signal({
		name: 'Inter',
		fontFamily: 'Inter',
		backColor: 'transparent',
		textColor: 'white',
		type: 'proportional',
		columns: 4,
		cellSize: TextureSize/12,
	}),
	EmojiSettings: signal({
		name: 'Emojis',
		fontFamily: 'Noto Color Emoji',
		backColor: 'transparent',
		textColor: 'white',
		type: 'fixed',
		columns: 8,
	}),
	
	Fonts: {
		Inter: signal(null),
		Emojis: signal(null),
	},
	Data: signal(null),
};

export default function Generator() {
	useEffect(async () => {
		State.Fonts.Inter.value = await generateFontTextureSet(
			Object.assign({}, State.InterSettings.value, {
				characters: [CharsetCommon, CharsetMultiLanguages].flat(),
			})
		);
	}, [State.InterSettings.value]);
	
	useEffect(async () => {
		State.Fonts.Emojis.value = await generateFontTextureSet(
			Object.assign({}, State.EmojiSettings.value, {
				characters: CharsetEmojis,
			})
		);
	}, [State.EmojiSettings.value]);
	
	useEffect(async () => {
		if(!State.Fonts.Inter.value) return;
		if(!State.Fonts.Emojis.value) return;
		
		Promise.all([
			...State.Fonts.Inter.value.texturesQueue,
			...State.Fonts.Emojis.value.texturesQueue
		]).then(async () => {
			State.Data.value = await dataFromFontTextureSets([
				State.Fonts.Inter.value,
				State.Fonts.Emojis.value
			]);
		});
	}, [
		State.Fonts.Inter.value,
		State.Fonts.Emojis.value,
	]);
	
	return (
		<div class="page page-generator">
			<header>
				<h1 class="title">Texture Generator</h1> — Work in Progress
			</header>
			<div class="assets">
				{Object.values(State.Fonts).filter(font => font.value).map((font, index) => (
					<TexturesPreview fontIndex={1 + index} font={font.value}/>
				))}
				<FontsData/>
				<DownloadAsZip/>
			</div>
		</div>
	)
}