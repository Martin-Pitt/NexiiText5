local Notecard = uuid("087a99f6-5c48-5942-0652-89e4f4185b90")

local Fonts = {}
local Textures = {}
local characterCount = 0
local Whitespace = {}
local Kerning = {}

local index = 1
local count = 0
function loadNotecard()
    print("Loading notecard")
    ll.GetNumberOfNotecardLines(Notecard)
    LLEvents:once("dataserver", function(request, data)
        count = tonumber(data)
        readNotecardLines()
    end)
end

function readNotecardLines()
    repeat
        local line = ll.GetNotecardLineSync(Notecard, index)
        
        if line == NAK then
            loadNotecard()
            return
        elseif string.sub(line, 1, 4) == "Font" then
            local font = lljson.decode(string.sub(line, 5))
            
            if font.whitespace then
                for key, value in font.whitespace do
                    if Whitespace[key] == nil then Whitespace[key] = value end
                end
                font.whitespace = nil
            end
            
            table.insert(Fonts, font)
        elseif string.sub(line, 1, 7) == "Kerning" then
            local kerning = lljson.decode(string.sub(line, 8)) :: {[string]:number}
            for key, value in kerning do Kerning[key] = value end
            
            --[[
            if Fonts[#Fonts].kerning == nil then
                Fonts[#Fonts].kerning = {}
            end
            
            -- Append kerning to last font
            local kerning = lljson.decode(string.sub(line, 8)) :: {[string]:number}
            for key, value in kerning do
                Fonts[#Fonts].kerning[key] = value
            end
            ]]
        elseif string.sub(line, 1, 7) == "Texture" then
            local texture = lljson.decode(string.sub(line, 8))
            texture.uuid = uuid(texture.uuid)
            table.insert(Textures, texture)
        else -- Character
            local grapheme, metrics = table.unpack(ll.ParseString2List(line, {utf8.char(0xE000)}, {}))
            ll.LinksetDataWrite("NT5_" .. grapheme, metrics)
            characterCount += 1
        end
        
        index += 1
    until index > count
    
    local needsTextureKeys = false
    local pointer = 1;
    for fontIndex, font in Fonts do
        for textureIndex=0,font.textureCount-1 do
            local texture = Textures[pointer]
            if texture.uuid == "" or texture.uuid == uuid(NULL_KEY) then
                needsTextureKeys = true
                local textureName = `NT5_Texture_{font.name}_{textureIndex}`
                local textureKey = ll.GetInventoryKey(textureName)
                if textureKey == "" or textureKey == uuid(NULL_KEY) then print(`Unabled to find texture {textureName}`) end
                texture.uuid = textureKey
                print(`Texture\{"uuid":"{textureKey}","width":{texture.width},"height":{texture.height},"font":{fontIndex}\}`)
            end
            pointer += 1
        end
    end
    
    if needsTextureKeys then
        print("Update the notecard with the texture keys")
        return
    end
    
    ll.LinksetDataWrite("NT5_Fonts", lljson.encode(Fonts))
    for key, value in Whitespace do ll.LinksetDataWrite(`NT5_Whitespace_{key}`, tostring(value)) end
    for key, value in Kerning do ll.LinksetDataWrite(`NT5_Kerning_{key}`, tostring(value)) end
    ll.LinksetDataWrite("NT5_Textures", lljson.encode(Textures))
    local dataUsed = (1024*128) - ll.LinksetDataAvailable()
    print(`Finished loading; {#Fonts} fonts, {#Textures} textures, {characterCount} characters; Using {string.format("%.1f", dataUsed/1024):gsub("%.?0+$", "")}KB / 128KB of Linkset Data`)
    print(`Removing loader script`)
    ll.RemoveInventory(ll.GetScriptName())
end

loadNotecard()