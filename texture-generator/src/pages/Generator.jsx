import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { signal, effect, computed } from '@preact/signals';
import { lazy, LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';
import classNames from 'classnames';
import TGA from '../lib/tga.js';
import { length } from '../lib/vec2.js';
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


function generateSetupScript(fonts) {
    // local textureIndex, glyphWidth, glyphLeftGap, glyphRightGap, textureX, textureY = table.unpack(lljson.decode(glyph) :: {number});
	
	
	// Map all textures to indices
	const textures = [];
	for(let font of fonts)
	{
		textures.push(...font.textures);
		
		for(let character of font.meta.characters)
		{
			const metrics = font.data[character];
			metrics.textureIndex = textures.indexOf(metrics.texture);
		}
	}
	
	return `-- Replace name with uploaded UUID textures respectively
	local textures = {
		${textures.map(texture => `{
			"${texture.name}",
			${texture.width},
			${texture.height},
		}`).join(',\n\t\t')}
	}
	
	
	local isFixedWidth = false
	function saveMetrics(glyph: string, metrics: {})
		local data = ""
		if isFixedWidth then
			data = table.concat({
				metrics.textureIndex,
				math.round(metrics.textureX * 8192),
				math.round(metrics.textureY * 8192)
			}, ",")
		else
			data = table.concat({
				metrics.glyphWidth,
				math.floor(metrics.glyphLeftGap),
				math.floor(metrics.glyphRightGap),
				metrics.textureIndex,
				math.round(metrics.textureX * 8192),
				math.round(metrics.textureY * 8192)
			}, ",")
		end
		ll.LinksetDataWrite(glyph, data)
	end
	
	local characters = {${
		fonts.map(font => {
			let data = [];
			for(let character of font.meta.characters)
			{
				const metrics = font.data[character];
				
				if(character == '"') character = '\\"';
				
				if(font.meta.isFixedWidth)
				{
					data.push(`"${character}" = "${[
						metrics.textureIndex,
						metrics.textureX,
						metrics.textureY,
					].join(',')}"`);
				}
				
				else
				{
					data.push(`"${character}" = "${[
						metrics.width,
						metrics.leftGap,
						metrics.rightGap,
						metrics.textureIndex,
						metrics.textureX,
						metrics.textureY,
					].join(',')}"`);
				}
			}
			
			return data.join(',\n\t\t');
		}).join(',\n')
	}}
	
	ll.LinksetDataWrite("NT5_Fonts", lljson.encode(textures))
	for char, values in pairs(characters) do
		ll.LinksetDataWrite(char, values)
	end
	`;
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
		// if(!State.Textures.Common.value) return;
		// if(!State.Textures.Emojis.value) return;
		// if(!State.Textures.CJK.value) return;
		// if(!State.SetupScript.value) return;
		
		const zip = new Zip((err, data, final) => {
			if(!err) console.log(data, final);
		});
		
		// const textureCommonFile = new ZipPassThrough('NT5_Texture_Common.tga');
		// zip.add(textureCommonFile);
		// textureCommonFile.push(textureCommonTGA, true);
		
	}, [
		// State.Textures.Common.value,
		// State.Textures.Emojis.value,
		// State.Textures.CJK.value,
		// State.SetupScript.value,
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



function TexturesPreview(props) {
	const [sources, setSources] = useState([]);
	const [isStillRendering, setRendering] = useState(false);
	
	useEffect(async () => {
		if(props.font)
		{
			setRendering(true);
			
			let urls = [];
			for(let index = 0; index < props.font.textures.length; ++index)
			{
				await props.font._renders[index]();
				const texture = props.font.textures[index];
				const blob = await new Promise(resolve => texture.toBlob(resolve));
				const url = URL.createObjectURL(blob);
				urls.push(url);
				setSources(urls.slice());
				await new Promise(r => requestAnimationFrame(r));
			}
			setRendering(false);
		}
		else setSources([]);
	}, [props.font]);
	
	if(!props.font) return <figure class="unicode-texture"></figure>;
	
	const {
		name,
		fontFamily, fontSize,
		render,
		columns, rows,
		cellSize,
		characters,
		textures,
		_rendering,
	} = props.font;
	
	// props.font.textures.length - 1} &times; {textureSize}&times;{textureSize} textures + {textureSize}&times;{lastTexture.height} texture<br/>
	// {textureSize}&times;{textureSize} texture + {textureSize}&times;{lastTexture.height} texture<br/>
	// else textureInfo = <>{props.font.textures.length} &times; {textureSize}&times;{textureSize} textures<br/></>;
	// else textureInfo = <>{textureSize}&times;{props.font.textures[0].height} texture<br/></>;
	
	return (
		<figure class={classNames("unicode-texture", { 'busy-rendering': isStillRendering })}>
			<figcaption>
				{name}<br/>
				{columns}&times;{rows} grid, {Math.round(cellSize * 100)/100}px cells {render === 'fixed'? ' (fixed width)' : ' (letter spacing)'}<br/>
				font: <code>{fontSize.toFixed(0)}px {fontFamily}</code><br/>
				{characters.length} characters<br/>
				{textures.length} textures
				
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
				<div class="busy-loader"/>
			</>)}
		</figure>
	);
}

async function getFontSettings(fontFamily) {
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
		render,
		columns,
	} = settings;
	let characters = settings.characters;
	const textureSize = 2048;
	
	if(!(fontFamily in FontSettings)) FontSettings[fontFamily] = await getFontSettings(fontFamily);
	const fontSettings = FontSettings[fontFamily];
	
	const cellSize = settings.cellSize || textureSize / columns;
	const rows = textureSize / cellSize;
	const columnWidth = textureSize / columns;
	const data = {};
	const maxCharacters = columns * rows;
	const allCharacters = characters.slice();
	const textures = [];
	const textureCharacters = [];
	const textureContexts = [];
	
	const fontSize = (cellSize / fontSettings.fontBoundingBoxHeight) * FontBaseUnit;
	const font = `400 ${fontSize}px ${fontFamily}, sans-serif`;
	
	for(let canvasIndex = 0; canvasIndex < Math.ceil(allCharacters.length / maxCharacters); ++canvasIndex)
	{
		// Setup canvas
		const canvas = document.createElement('canvas');
		canvas.width = textureSize;
		canvas.height = textureSize;
		canvas.style.aspectRatio = `${textureSize} / ${textureSize}`;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		
		// If there is a back color we draw a background; Having a background allows the texture to be rendered softly with anti-aliasing
		// Avoiding the current issues around alpha masking with legibility issues due to pixelated rendering
		if(backColor !== 'transparent')
		{
			ctx.fillStyle = backColor;
			ctx.fillRect(0, 0, textureSize, textureSize);
		}
		
		// Font setup
		ctx.fillStyle = textColor;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		ctx.font = font;
		
		textures.push(canvas);
		textureCharacters[canvasIndex] = allCharacters.slice(canvasIndex * maxCharacters, (canvasIndex + 1) * maxCharacters);
		textureContexts[canvasIndex] = ctx;
	}
	
	const _renders = [];
	async function renderTexture(canvas, ctx, characters) {
		// await new Promise(r => requestAnimationFrame(r));
		
		let index = 0;
		const UncoloredRects = [];
		const ColorizedRects = [];
		for(let character of characters)
		{
			let metrics = ctx.measureText(character);
			
			// Grid coordinates
			let a = index % columns;
			let b = Math.floor(index / columns);
			index++;
			let x = columnWidth * 0.5 + columnWidth * a;
			let y = cellSize * b;
			
			// Crop to cell
			ctx.save();
			ctx.beginPath();
			ctx.rect(x - columnWidth/2, y, columnWidth, cellSize);
			ctx.clip();
			
			// Render glyph
			y += cellSize * fontSettings.baselinePercent;
			ctx.fillText(character, x, y);
			
			ctx.restore();
			
			// Save metrics
			data[character] = {
				width: metrics.width, 
				
				texture: canvas,
				textureIndex: null, // Filled in later
				textureX: x - textureSize/2,
				textureY: 1 - ((y + cellSize/2) / textureSize/2),
				
				leftGap: 0,
				rightGap: 0,
			};
			
			
			// Check if glyph is colorized/greyscale instead of black/white
			let isColorized = false;
			let rx = x - cellSize/2;
			let ry = y - cellSize * fontSettings.baselinePercent;
			let rw = cellSize;
			let rh = cellSize;
			
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
		}
		
		const GAP_MARGIN = 2;
		for(let a = 0; a < columns; ++a)
		{
			for(let b = 0; b < rows; ++b)
			{
				let index = b + a * rows;
				let character = characters[index];
				if(!character) continue;
				
				let prevColumn = (columns + (a - 1)) % columns;
				let prevCharacter = characters[b + prevColumn * rows];
				let prevGap = columnWidth - GAP_MARGIN;
				if(prevCharacter && data[prevCharacter]) prevGap -= data[prevCharacter].width/2;
				
				let nextColumn = (a + 1) % columns;
				let nextCharacter = characters[b + nextColumn * rows];
				let nextGap = columnWidth - GAP_MARGIN;
				if(nextCharacter && data[nextCharacter]) nextGap -= data[nextCharacter].width/2;
				
				data[character].leftGap = prevGap;
				data[character].rightGap = nextGap;
			}
		}
		
		// await new Promise(r => requestAnimationFrame(r));
		
		// Crop height down to closest power of two
		let lastRow = Math.floor((characters.length - 1) / columns);
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
		
		// await new Promise(r => requestAnimationFrame(r));
		
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		
		// Force pixels around uncolored glyphs to white to prevent halo artifacts
		for(let [rx, ry, rw, rh] of UncoloredRects)
		{
			await new Promise(r => requestAnimationFrame(r));
			
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
		
		// await new Promise(r => requestAnimationFrame(r));
		
		// Force transparent pixels around glyphs to closest opaque pixel color to prevent halo artifacts
		for(let [rx, ry, rw, rh] of ColorizedRects)
		{
			await new Promise(r => requestAnimationFrame(r));
			
			for(let x = rx; x < rx+rw - 1; ++x)
			{
				for(let y = ry; y < ry+rh - 1; ++y)
				{
					let index = (x + y * imageData.width) * 4;
					const a = imageData.data[index + 3];
					if(a > 0) continue;
					
					// Find closest opaque pixel
					let found = false;
					for(let radius = 1; radius < 3 && !found; ++radius)
					{
						for(let dx = -radius; dx <= radius && !found; ++dx)
						{
							for(let dy = -radius; dy <= radius && !found; ++dy)
							{
								if(dx == 0 && dy == 0) continue;
								let sx = x + dx;
								let sy = y + dy;
								if(sx < 0 || sx >= canvas.width) continue;
								if(sy < 0 || sy >= canvas.height) continue;
								let sIndex = (sx + sy * imageData.width) * 4;
								const sa = imageData.data[sIndex + 3];
								if(sa === 255)
								{
									// Copy color
									imageData.data[index + 0] = imageData.data[sIndex + 0];
									imageData.data[index + 1] = imageData.data[sIndex + 1];
									imageData.data[index + 2] = imageData.data[sIndex + 2];
									found = true;
								}
							}
						}
					}
				}
			}
		}
		
		ctx.putImageData(imageData, 0, 0);
	}
	
	for(let index = 0; index < textures.length; ++index)
	{
		const texture = textures[index];
		const ctx = textureContexts[index];
		const characters = textureCharacters[index];
		_renders.push(() => renderTexture(texture, ctx, characters));
	}
	
	return {
		name,
		fontFamily, fontSize,
		render,
		columns, rows,
		cellSize,
		characters: allCharacters,
		textures,
		_renders,
	};
}



const FontSettings = {};
const FontBaseUnit = 1000; // We'll save all metrics relative to this base unit, which also represents 1 em square

const State = {
	Fonts: signal([]),
}

export default function Generator() {
	useEffect(async () => {
		let interSettings = {
			name: 'Inter',
			fontFamily: 'Inter',
			backColor: 'transparent',
			textColor: 'white',
			render: 'propportional',
			columns: 9,
			cellSize: 2048/24,
			characters: [
				CharsetCommon,
				CharsetMultiLanguages,
			].flat(),
		};
		let emojiSettings = {
			name: 'Emojis',
			fontFamily: 'Noto Color Emoji',
			backColor: 'transparent',
			textColor: 'white',
			render: 'fixed',
			columns: 16,
			characters: CharsetEmojis,
		};
		
		let interFont = await generateFontTextureSet(interSettings);
		let emojiFont = await generateFontTextureSet(emojiSettings);
		
		State.Fonts.value = [
			interFont,
			emojiFont,
		];
	}, [
		// Config.fontFamily.value,
		// Config.backColor.value,
		// Config.textColor.value,
	]);
	
	
	
	
	
		/*
		const backColor = State.backColor.value;
		const textColor = State.textColor.value;
		State.Textures.Common.value = await generateUnicodeTexture({
			name: 'Common',
			characters: CharsetCommon,
			backColor,
			textColor,
			cellSize: 2048/23,
			columns: 8,
			font: `400 ${((50/64)*(2048/23)).toFixed(3)}px Inter, sans-serif`,
		});
		State.Textures.MultiLanguages.value = await generateUnicodeTexture({
			name: 'MultiLanguages',
			characters: CharsetMultiLanguages,
			backColor,
			textColor,
			cellSize: 64,
			columns: 10,
			font: `400 52px Inter, sans-serif`,
		});
		State.Textures.Emojis.value = await generateUnicodeTexture({
			name: 'Emojis',
			characters: CharsetEmojis,
			backColor,
			textColor,
			cellSize: 128,
			isFixedWidth: true,
			font: `400 110px 'Noto Color Emoji', Inter, sans-serif`,
		});
		let CJKSettings = {
			backColor,
			textColor,
			isFixedWidth: true,
		};
		State.Textures.MiscCJK.value = await generateUnicodeTexture(Object.assign({
			name: 'CJKMisc',
			characters: CharsetMiscCJK,
			font: `400 64px 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans JP', 'Noto Sans KR', Inter, sans-serif`,
		}, CJKSettings));
		State.Textures.ChineseSimplified.value = await generateUnicodeTexture(Object.assign({
			name: 'ChineseSimplified',
			characters: CharsetChineseSimplified,
			font: `400 64px 'Noto Sans SC', Inter, sans-serif`,
		}, CJKSettings));
		State.Textures.ChineseTraditional.value = await generateUnicodeTexture(Object.assign({
			name: 'ChineseTraditional',
			characters: CharsetChineseTraditional,
			font: `400 64px 'Noto Sans TC', Inter, sans-serif`,
		}, CJKSettings));
		State.Textures.Japanese.value = await generateUnicodeTexture(Object.assign({
			name: 'Japanese',
			characters: CharsetJapanese,
			font: `400 64px 'Noto Sans JP', Inter, sans-serif`,
		}, CJKSettings));
		State.Textures.Korean.value = await generateUnicodeTexture(Object.assign({
			name: 'Korean',
			characters: CharsetKorean,
			font: `400 64px 'Noto Sans KR', Inter, sans-serif`,
		}, CJKSettings));
		*/
	// }, [
	// 	State.backColor.value,
	// 	State.textColor.value,
	// ]);
	
	return (
		<div class="page page-generator">
			<header>
				<h1 class="title">Texture Generator</h1> — Work in Progress, no download option yet
			</header>
			<div class="textures">
				{State.Fonts.value.map(font => (
					<TexturesPreview font={font}/>
				))}
			</div>
			{/* <DownloadAsZip/> */}
		</div>
	)
}