# NexiiText5

NexiiText5 is a text rendering library for Second Life scripters written in SLua

![](/screenshot-header.png)

## Quickstart

## Prefab
You can get free prefabricated object with example script, 64 mesh text prims in the linkset and the linkset data preloaded from the loader script available here:

> https://marketplace.secondlife.com/p/NexiiText5/27772073

## Manual

Here is how to manually put together an object for text rendering:
1. Link as many Text mesh prim onto your object as you may expect to need, roughly around one text mesh per 3-7 letters
2. Drop the [`N5 Data Loader.luau`](./NT5%20Data%20Loader.luau) script into the object, this loads a notecard which then stores information for fonts into Linkset Data (currently around 50KB) and then self-deletes the loader script automatically when it is finished
3. `require(...)` the [`N5 Renderer.luau`](./NT5%20Renderer.luau) library in your project
4. The library gives you a rendering context table object which has certain methods like `write`, `render` etc. and you can also apply global styling information like `position`, `fontSize` etc.


## About

Providing high quality text rendering in-world, featuring *letter spacing*, *kerning* and *text wrap*, of unicode characters using generated texture atlases. It can render text proportionally or as fixed-width fonts (such as for emojis and CJK).

The renderer works in two phases:
1. Writing text into a virtual 2D canvas (`ctx.write`)
2. Rendering text into prim params and applying them (`ctx.render`)

It also uses some specific terminology for its data structures:
- Islands
- Clusters

**Islands** represent a single Text mesh prim (see the `NT5 Text Mesh.glb/blend` files), which have up to 8 faces available for unicode characters.

**Clusters** are a group of islands and would represent labels or paragraphs.

The function `ctx.render` returns a **Rendered Cluster**, these can be used to re-render a cluster later on or move it around as you need.

To optimise script memory usage, the renderer relies on _Linkset Data_ for a lot of stored information on fonts, textures, whitespace and kerning.


## API

Require the renderer:
```luau
local ctx = require("./NT5 Renderer.luau")
```
This will also kick in a linkset scan, which resets the text mesh prims that the renderer can use to draw text.

### `ctx.write(text: string, styles: {[string]: any}?)`
Writes text to a virtual canvas, applying the styles locally to this function call.

You can use any supported unicode character by the font data stored in the linkset data.

The current web app generates characters for ASCII and common everyday characters of multiple languages as well as an almost complete range of emojis.

You can also use newlines and tab indentation which should work correctly in most cases. Newlines at the end of text may be ignored however.

### `ctx.render(renderedCluster: RenderedCluster?): RenderedCluster`
When you have finished writing text, you can call `ctx.render()` to finally render the virtual text into prim params which are then applied immediately to any unused/free text mesh prims in the linkset.

You might need to be careful not to write too much into the virtual canvas with `ctx.write` as this is all stored into script memory, so regular `ctx.render()` calls can help clear memory. However sparse calls is also more optimal for fast rendering performance.


### `ctx.resume()`

Resume writing from the end of the last `.write` call instead of at the current `Styling.position`


### `ctx.markdown(text: string, styles: {[string]: any})`

There is a very limited amount of markdown supported in the form of:
- **Bold** and *italic*
- Headings - `# H1`, `## H2`, etc.
- Blockquotes - `> Blockquote`
- Lists - `[text](link)`

Currently the renderer/font does not have actual **bold**, _italic_ or [interactive links](https://example.com).
So you are free to style the markdown as you wish from the available styling options to give your own meaning to them, usually some color for bold/italic and font sizes for headings.


### Styles

The text renderer supports the following styling options, which should be set via `ctx.`:

```luau
local Styling = {
	position = vector(0,0,0),
	rotation = quaternion(0,0,0,1),
	fontSize = 0.2,
	lineHeight = 1.2,
	textWrapLength = 4.0,
	color = vector(1,1,1),
}
```

For example:
```luau
ctx.position = vector(0.5, 1, 0.2)
```

```luau
ctx.fontSize = 0.4
ctx.lineHeight = 1.1
ctx.textWrapLength = 6.0
ctx.color = vector(.1,.1,.1)
```

#### Styling Globals

Setting the styles on `ctx.` is global for all `write` calls and represents the default stylesheet.


### Local Styles

For more unique styles per write call you can pass them to the `ctx.write` calls, e.g.
```luau
ctx.write("This is looking a bit blue", { color = vector(.4,.4,1) })
```

### Markdown Element Styles

For markdown, there are different types of elements that can be given a local style:
- `text` - normal text / fallback
- `strong` - for bold text
- `em` - for italic text
- `heading` - for all heading elements
- `h1`, `h2`, `h3`, `h4`, etc - specific headings
- `blockquote`
- `list`
- `link`

For example to apply default white color to text and then a light blue color to bold text:
```luau
ctx.markdown([[
Strings can also be declared via **double brackets**.
This is nice for **multi-line** strings such as for **markdown**.
]], {
    text = { color = vector(1,1,1) },
    strong = { color = vector(.7,.7,1) },
})
```


## Texture Generator

This repo also includes a web app (in [`./texture-generator`](./texture-generator/)) which creates the landing page at https://martin-pitt.github.io/NexiiText5/ but it also has a font texture/data generator which creates the font dataset for the text renderer.

### Downloading the generated fonts and data

1. Go to the texture generator at https://martin-pitt.github.io/NexiiText5/generator
2. Wait until everything has finished generating
3. Download the packaged assets archive zip
4. Extract the archive into a folder
5. Bulk upload all the textures
6. Copy-paste the `NT5_Data.txt` into a new notecard
7. Copy the UUID of the notecard and paste it into a new [`NT5 Data Loader`](./NT5%20Data%20Loader.luau) script in your inventory, replacing the UUID at the top with the one from your notecard
8. Drop the loader into a test object
9. The loader will spit out lines you can replace the `Texture{...}` lines of the notecard with, make sure to match exactly the same order
10. Replace the notecard UUID of the loader script that is in your inventory to finalise it

You now have a working NT5 Data Loader with custom fonts and data that you can apply to objects like the quickstart instructions.


### Developing web app

Customising the web app's generator can allow you to change the fonts, texture atlases and unicode characters you want to support. Although only limited support will be provided as the project is still fairly new and dynamic.

1. Git clone the repository
2. Run `npm install` in the `./texture-generator` folder
3. Run `npm run dev` to start the local development server
4. Edit the [`./texture-generator/src/pages/Generator.jsx`](./texture-generator/src/pages/Generator.jsx) file per your needs



## Wishlist
- Texture Generator configuration
    - Some way for users of the web app to create/configure/delete font sets & change unicode character ranges within the web app
    - Save configurations locally into `localStorage` and offer a way to save/load configs to/from a file just in case for sharing
- Optimise the performance of the texture generator
    - It is painfully slow and if configurations are added this will need to go way faster or be generated on-demand
- Add support for **Bold** and/or _Italic_ styling into the renderer
    - Might be able to get away with only adding bold and italic variants for main ASCII set
    - Hook into the markdown parser
    - Add as boolean styling options, e.g. `ctx.bold = true` / `{ italic = true }`



## Mesh

![](/screenshot-mesh.png)

The mesh can be used for proportional and fixed-width rendering by the text renderer, shown respectively left to right in the image - the top layer is how it is used in practice flattened down but the lower layer betrays the actual geometry which consists of angled faces to achieve the dual-rendering usage from the same mesh.

The source files are available at:
- [Blender source: `NT5 Text Mesh.blend`](./NT5%20Text%20Mesh.blend)
- [GLB file uploaded to SL: `NT5 Text Mesh.glb`](./NT5%20Text%20Mesh.glb)




## Known Issues
- Newline at end of write call may get ignored
