local ctx = require("./NT5 Renderer.luau")

ctx.position = vector(0,0,4)
ctx.write("Helloooooooo")
ctx.write("\n\nThe quick brown 🦊 yumps.", { color = vector(1,0,0) })
local cluster = ctx.render()

-- Example of re-rendering a cluster later with updated content
LLTimers:once(3.0, function()
    ctx.write("Hello, World 👋🌐!")
    ctx.write("\n\nThe quic bro 🦊 yumps over lazy 🐶.", { color = vector(1,0,0) })
    ctx.render(cluster)
end)
LLTimers:once(6.0, function()
    ctx.write("Hello, World 👋🌐!\nThis is a test of NexiiText5.")
    ctx.write("\nThe quick brown 🦊 jumps over the lazy 🐶.", { color = vector(1,0,0) })
    ctx.render(cluster)
end)


-- Example of markdown rendering, mind memory usage though
local markdownStyling = {
    text = { color = vector(1,1,1) },
    strong = { color = vector(.7,.7,1) },
}
ctx.position = vector(0,0,3)
ctx.markdown([[
Fonts are **proportional ↔** and **fixed-width ⬜**,
with **kerning** (To, Ve, LY, YA, etc) and **word-wrapping**!

Learn more at: [martin-pitt.github.io/NexiiText5](https://martin-pitt.github.io/NexiiText5/)

Enjoy using **NexiiText5**.
]], markdownStyling)
ctx.render()
