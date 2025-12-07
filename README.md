# NexiiText5

## Quickstart

1. Link as many Text mesh prim onto your object as you may expect to need, roughly around one text mesh per 3-7 letters
2. Drop the [`N5 Data Loader.luau`](./N5 Data Loader.luau) script into the object, this loads a notecard which then stores information for fonts into Linkset Data (currently around 50KB)
3. `require(...)` the [`N5 Renderer.luau`](./N5 Renderer.luau) library in your project
4. The library gives you a rendering context table object which has certain methods like `write`, `render` etc. and you can also apply global styling information like `position`, `fontSize` etc.

(TODO: Add link to marketplace with examples, scripts and text mesh prim)


## About
NexiiText5 is a text rendering library for Second Life scripters written in SLua.

It provides high quality text rendering in-world, featuring *letter spacing*, *kerning* and *text wrap*, of unicode characters using generated texture atlases.

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

The renderer and font doesnt currently support actual bold, italic or interactive links however and there are no default styles setup.
So you are free to style the markdown as you wish from the available styling options.


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


## Known Issues

- Newline at end of write call may get ignored
