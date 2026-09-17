local ctx = require("./NT5 Renderer.luau")

-- Example of basic text rendering
ctx.position = vector(0,0,0.5)
ctx.fontSize = 0.08
ctx.textWrapLength = 30.0
ctx.write("glTF:\nDAE:")
local cluster = ctx.render()

