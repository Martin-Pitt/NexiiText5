local NexText = {
    FontBaseUnit = 1000,
    Fonts = lljson.decode(ll.LinksetDataRead("NT5_Fonts")),
    Textures = lljson.decode(ll.LinksetDataRead("NT5_Textures")),
}
for _, texture in NexText.Textures do texture.uuid = uuid(texture.uuid) end



local activeFont = NexText.Fonts[1]
local whitespace = 0
local text = "Hello"
local codepoints = table.pack(utf8.codepoint(text))
repeat
    local codepoint = table.remove(codepoints, 1)
    local char = utf8.char(codepoint)
    if NexText.Fonts[1].whitespace[char] then
        whitespace += NexText.Fonts[1].whitespace[char]
    --[[elseif char == "\t" then
    elseif char == "\n" then]]
    else
        local metrics = ll.LinksetDataRead("NT5_" .. char)
        if data == "" then
            char = "�" -- Fallback
            metrics = ll.LinksetDataRead("NT5_" .. char)
        end
        metrics = ll.ParseString2List(metrics, {utf8.char(0xE001)}, {})
        
        if activeFont.type == "fixed" then
            local fontIndex, textureIndex, charIndex = table.unpack(metrics)
            
            
        else
            local fontIndex, textureIndex, charIndex, glyphWidth, leftGap, rightGap = table.unpack(metrics)
            
            
        end
        
        
        
    end
until #codepoints == 0
