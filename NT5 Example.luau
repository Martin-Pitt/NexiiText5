local ctx = require("./NT5 Renderer.luau");

ctx.position = vector(0,0,4)
ctx.write("Hello, World 👋🌐!\nThis is a test of NexiiText5.")
ctx.write("\nThe quick brown 🦊 jumps over the lazy 🐶.", { color = vector(1,0,0) })
ctx.render();

local markdownStyling = {
    text = { color = vector(1,1,1) },
    strong = { color = vector(.7,.7,1) },
}
ctx.position = vector(0,0,3)
ctx.markdown([[
Fonts are **proportional ↔** and **fixed-width ⬜**,
with **kerning** (To, Ve, LY, YA, etc) and **word-wrapping**!]], markdownStyling)
ctx.render()
ctx.resume()
ctx.markdown([[

Learn more at: [martin-pitt.github.io/NexiiText5](https://martin-pitt.github.io/NexiiText5/)

Enjoy using **NexiiText5**.
]], markdownStyling);

ctx.render()
