local Notecard = uuid("055da5a2-acae-6d84-d2cb-edc23bde8084")

local Fonts = {}
local Textures = {}
local characterCount = 0

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
            table.insert(Fonts, font)
        elseif string.sub(line, 1, 7) == "Kerning" then
            if Fonts[#Fonts].kerning == nil then
                Fonts[#Fonts].kerning = {}
            end
            
            -- Append kerning to last font
            local kerning = lljson.decode(string.sub(line, 8)) :: {[string]:number}
            for key, value in kerning do
                Fonts[#Fonts].kerning[key] = value
            end
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
    
    ll.LinksetDataWrite("NT5_Fonts", lljson.encode(Fonts))
    ll.LinksetDataWrite("NT5_Textures", lljson.encode(Textures))
    local dataUsed = (1024*128) - ll.LinksetDataAvailable()
    print(`Finished loading; {#Fonts} fonts, {#Textures} textures, {characterCount} characters; {string.format("%.2f", dataUsed/1024):gsub("%.?0+$", "")}KB/128KB linkset data`)
    ll.RemoveInventory(ll.GetScriptName())
end

loadNotecard()