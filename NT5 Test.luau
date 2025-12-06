if ll.LinksetDataRead("NT5_Fonts") == "" then
    error("There is no font saved into Linkset Data, did you forget to drop in the NT5 Data Loader script first to setup the object?")
end

local FontBaseUnit = 1000
local FontFixedUnit = FontBaseUnit
local Fonts = lljson.decode(ll.LinksetDataRead("NT5_Fonts")) :: {Font}
local Textures = lljson.decode(ll.LinksetDataRead("NT5_Textures")) :: {Texture}
for _, texture in Textures do
    texture.uuid = uuid(texture.uuid)
    texture.font = Fonts[texture.font]
end
local Styling = {
    position = vector(0,0,0),
    rotation = quaternion(0,0,0,1),
    fontSize = 0.2,
    lineHeight = 1.2,
    textWrapLength = 4.0,
    color = vector(1,1,1),
}
local activeFont = Fonts[1]
local workingCluster: Cluster = nil
local workingIsland: Island = nil
local resume = { caret = { x = 0, y = 0 }, whitespace = 0 }

type Font = {
    type: "proportional" | "fixed",
    name: string,
    columns: number,
    rows: number,
    cellSize: number,
    fontSize: number,
    textureSize: number,
    textureCount: number,
    
    -- Proportional
    whitespace: {[string]: number},
    kerning: {[string]:number},
}

type Texture = {
    uuid: uuid,
    width: number,
    height: number,
    font: Font,
}

type Cluster = {
    -- Identity
    name: string?,
    
    -- Transform
    pos: vector,
    rot: quaternion,
    
    -- Content
    islands: {Island | number},
    caret: { x: number, y: number },
    whitespace: number,
}

type Island = {
    -- Core
    type: "proportional" | "fixed",
    x: number,
    y: number,
    faces: {IslandFace},
    
    -- Proportional
    width: number?,
    availableWidth: number?,
    
    -- Styling
    fontSize: number,
    color: vector?,
}
type IslandFace = {
    t: number, -- Texture Index
    u: number, -- Texture U coord
    v: number, -- Texture V coord
    color: vector?, -- Specific face color
}



-- Scan linkset
local function ScanLinkset(resetAll: boolean?)
    local free: any = {}
    for link = 1, ll.GetNumberOfPrims() do
        local name = ll.GetLinkName(link)
        if name == "Text" then
            local desc = table.unpack(ll.GetLinkPrimitiveParams(link, {PRIM_DESC}))
            if resetAll or desc == "Free" or desc == "(No Description)" then
                table.insert(free, string.char(link))
            end
        end
    end
    free = table.concat(free)
    ll.LinksetDataWrite("NT5_Free", free)
    
    local resetParams = {
        PRIM_SIZE, vector(.01, .01, .01),
        PRIM_POS_LOCAL, vector.zero,
        PRIM_ROT_LOCAL, quaternion(0,0,0,1),
        PRIM_DESC, "Free",
        PRIM_COLOR, ALL_SIDES, vector.one, 1,
        PRIM_TEXTURE, ALL_SIDES, TEXTURE_TRANSPARENT, vector(1,1,0), vector(0,0,0), 0,
    } :: {any}
    local params = {}
    for iterator = 1, #free do
        table.insert(params, PRIM_LINK_TARGET)
        table.insert(params, string.byte(free, iterator, iterator))
        for _, param in resetParams do table.insert(params, param) end
    end
    ll.SetLinkPrimitiveParamsFast(0, params)
end

ScanLinkset()


function createTextCluster(obj: {any}?)
    local cluster: Cluster = {
        pos = Styling.position,
        rot = Styling.rotation,
        islands = {},
        caret = { x = 0, y = 0 },
        whitespace = 0,
    }
    if obj ~= nil then
        for k, v in obj do cluster[k] = v end
    end
    return cluster
end

function splitTextIsland(force: boolean?)
    local newIsland = true
    if not force then
        if workingIsland then
            if #workingIsland.faces == 0 then newIsland = false -- Reuse unused island
            elseif workingIsland.y ~= workingCluster.caret.y -- Not same line
            or #workingIsland.faces == 8 -- Full island
            or workingIsland.fontSize ~= Styling.fontSize -- Different font size
            or workingIsland.type ~= activeFont.type -- Different font rendering type
            then newIsland = true end
        else newIsland = true end -- No island
    end
    
    if newIsland then -- Create new island and pop it onto cluster
        if activeFont.type == "fixed" then
            workingIsland = {
                type = activeFont.type,
                x = workingCluster.caret.x,
                y = workingCluster.caret.y,
                fontSize = Styling.fontSize,
                faces = {},
                color = Styling.color,
            } :: Island
        else
            workingIsland = {
                type = activeFont.type,
                x = workingCluster.caret.x,
                y = workingCluster.caret.y,
                fontSize = Styling.fontSize,
                faces = {},
                color = Styling.color,
                width = 0,
                availableWidth = activeFont.textureSize/activeFont.columns * FontBaseUnit/activeFont.cellSize,
            } :: Island
        end
        table.insert(workingCluster.islands, workingIsland)
    else -- Reuse existing island
        workingIsland.type = activeFont.type
        workingIsland.x = workingCluster.caret.x
        workingIsland.y = workingCluster.caret.y
        workingIsland.fontSize = Styling.fontSize
        workingIsland.faces = {}
        workingIsland.color = Styling.color
        if activeFont.type == "proportional" then
            workingIsland.width = 0
            workingIsland.availableWidth = activeFont.textureSize/activeFont.columns * FontBaseUnit/activeFont.cellSize
        end
    end
end


-- Writes text into a virtual 2D canvas through a cluster of islands, each representing a mesh prim
function write(text: string, styles: {[string]: any}?)
    if text == "" then return end
    if styles then for key, value in styles do Styling[key] = value end end
    if workingCluster == nil then
        workingCluster = createTextCluster()
        splitTextIsland(true)
    end
    if workingIsland == nil then splitTextIsland() end
    local whitespace = workingCluster.whitespace
    local newlines = 0
    
    local codepoints = table.pack(utf8.codepoint(text, 1, #text))
    local prevChar = nil
    repeat
        local codepoint = table.remove(codepoints, 1)
        local char = utf8.char(codepoint)
        local nextChar = nil
        if #codepoints > 0 then nextChar = utf8.char(codepoints[1]) end
        
        if activeFont.type == 'proportional' and activeFont.whitespace[char] then
            whitespace += activeFont.whitespace[char]
        elseif activeFont.type == 'fixed' and char == " " then -- TODO: Force other whitespace to fixed width as well?
            -- Lookahead for proportional font switch
            local switchedToProportional = false
            if nextChar then
                local nextMetrics = ll.LinksetDataRead("NT5_" .. nextChar)
                if nextMetrics ~= "" then
                    local fontIndex = table.unpack(lljson.decode(`[{nextMetrics}]`) :: {number})
                    local nextFont = Fonts[fontIndex]
                    if nextFont.name ~= activeFont.name and nextFont.type == 'proportional' then
                        activeFont = nextFont
                        whitespace += nextFont.whitespace[" "]
                        workingCluster.caret.x += whitespace
                        splitTextIsland()
                        whitespace = 0
                        switchedToProportional = true
                    end
                end
            end
            
            if not switchedToProportional then whitespace += FontFixedUnit end
        elseif char == "\t" then -- Tab indentation
            if newlines > 0 then
                workingCluster.caret.x = 0
                workingCluster.caret.y -= Styling.fontSize*Styling.lineHeight * newlines * (FontBaseUnit/Styling.fontSize) * (activeFont.fontSize/activeFont.cellSize)
                splitTextIsland()
                newlines = 0
                whitespace = 0
            end
            local edge = workingCluster.caret.x + whitespace
            local indent = math.ceil(edge / FontBaseUnit) * FontBaseUnit
            indent -= edge
            if indent < (FontBaseUnit/4) then indent += FontBaseUnit end
            whitespace += indent
        elseif char == "\n" then -- Newline
            newlines += 1
            whitespace = 0
        else
            local metrics = ll.LinksetDataRead("NT5_" .. char)
            if metrics == "" then
                char = "�" -- Fallback
                metrics = ll.LinksetDataRead("NT5_" .. char)
            end
            metrics = lljson.decode(`[{metrics}]`) :: {number}
            local fontIndex: number = metrics[1]
            local textureIndex: number = metrics[2]
            local charIndex: number = metrics[3]
            local glyphWidth: number
            local leftGap: number
            local rightGap: number
            local isColor: boolean
            
            if Fonts[fontIndex].name ~= activeFont.name then
                local prevFont = activeFont
                activeFont = Fonts[fontIndex]
                if prevFont.type ~= activeFont.type then
                    workingCluster.caret.x += whitespace
                    splitTextIsland()
                    whitespace = 0
                end
            end
            
            if activeFont.type == 'proportional' then
                glyphWidth = metrics[4]
                leftGap = metrics[5] - FontBaseUnit*.5
                rightGap = metrics[6] - FontBaseUnit*.5
                isColor = metrics[7] == 1 and true or false
            elseif activeFont.type == 'fixed' then
                isColor = metrics[4] == 1 and true or false
            end
            
            if workingIsland.type == 'proportional' then
                local kerningAdjustment = 0
                if prevChar then
                    local pair = prevChar .. char
                    if activeFont.kerning[pair] then
                        kerningAdjustment = activeFont.kerning[pair]
                    end
                end
                
                glyphWidth *= (activeFont.fontSize/activeFont.cellSize)
                
                local addedWidth = whitespace + kerningAdjustment*.5 + glyphWidth
                local islandEnd = workingCluster.caret.x - workingIsland.x
                
                local outOfFaces = #workingIsland.faces >= 8
                local notEnoughSpace = addedWidth > workingIsland.availableWidth
                local wouldOverlapLeftGap = islandEnd + whitespace + glyphWidth*.5 > leftGap
                local exceedsWrap = workingCluster.caret.x + addedWidth > (Styling.textWrapLength * FontBaseUnit/Styling.fontSize)
                
                if outOfFaces or notEnoughSpace or wouldOverlapLeftGap or exceedsWrap or newlines > 0 then
                    if newlines > 0 then
                        workingCluster.caret.x = whitespace
                        workingCluster.caret.y -= Styling.fontSize*Styling.lineHeight * newlines * (FontBaseUnit/Styling.fontSize) * (activeFont.fontSize/activeFont.cellSize)
                    elseif exceedsWrap then
                        whitespace = 0
                        workingCluster.caret.x = 0
                        workingCluster.caret.y -= Styling.fontSize*Styling.lineHeight * (FontBaseUnit/Styling.fontSize) * (activeFont.fontSize/activeFont.cellSize)
                    end
                    
                    workingCluster.caret.x += whitespace
                    splitTextIsland()
                    whitespace = 0
                    addedWidth = glyphWidth
                    islandEnd = 0
                end
                
                -- Add glyph
                local texture = Textures[textureIndex]
                workingIsland.availableWidth -= addedWidth
                if rightGap < workingIsland.availableWidth then workingIsland.availableWidth = rightGap end
                workingIsland.width += addedWidth
                workingCluster.caret.x += addedWidth
                
                local columnWidth = activeFont.textureSize / activeFont.columns
                local x = (columnWidth*.5 + columnWidth * ((charIndex - 1) % activeFont.columns))
                local y = activeFont.cellSize * math.floor((charIndex - 1) / activeFont.columns)
                local pos = (islandEnd + whitespace + kerningAdjustment + glyphWidth*.5) * (activeFont.cellSize/FontBaseUnit)
                local face = {
                    t = textureIndex,
                    u = x - texture.width/2 - pos,
                    v = 1 - ((y - activeFont.cellSize/2) - texture.height/2),
                } :: IslandFace
                if Styling.color ~= vector.one or workingIsland.color ~= Styling.color then
                    face.color = Styling.color
                    if isColor then face.color = vector.one end
                end
                table.insert(workingIsland.faces, face)
                
                newlines = 0
                whitespace = 0
            elseif workingIsland.type == 'fixed' then
                local addedWidth = whitespace + FontFixedUnit
                
                local outOfFaces = #workingIsland.faces >= 8
                local notEnoughSpace = addedWidth > (8 - #workingIsland.faces) * FontFixedUnit
                local exceedsWrap = workingCluster.caret.x + addedWidth > (Styling.textWrapLength * FontBaseUnit/Styling.fontSize)
                
                if outOfFaces or notEnoughSpace or exceedsWrap or newlines > 0 then
                    if newlines > 0 then
                        whitespace = 0
                        workingCluster.caret.x = 0
                        workingCluster.caret.y -= Styling.fontSize*Styling.lineHeight * newlines * (FontBaseUnit/Styling.fontSize) * (activeFont.fontSize/activeFont.cellSize)
                    elseif exceedsWrap then
                        whitespace = 0
                        workingCluster.caret.x = 0
                        workingCluster.caret.y -= Styling.fontSize*Styling.lineHeight * (FontBaseUnit/Styling.fontSize) * (activeFont.fontSize/activeFont.cellSize)
                    end
                    
                    workingCluster.caret.x += whitespace
                    splitTextIsland()
                    whitespace = 0
                    addedWidth = FontFixedUnit
                end
                
                -- Add glyph
                local texture = Textures[textureIndex]
                workingCluster.caret.x += addedWidth
                
                for step = 0, whitespace, FontFixedUnit do
                    local emptyFace = nil
                    table.insert(workingIsland.faces, emptyFace)
                end
                
                local x = activeFont.cellSize*.5 + activeFont.cellSize * ((charIndex - 1) % activeFont.columns)
                local y = activeFont.cellSize * math.floor((charIndex - 1) / activeFont.columns)
                local face = {
                    t = textureIndex,
                    u = x - texture.width/2,
                    v = 1 - ((y - activeFont.cellSize/2) - texture.height/2),
                } :: IslandFace
                if Styling.color ~= vector.one or workingIsland.color ~= Styling.color then
                    face.color = Styling.color
                    if isColor then face.color = vector.one end
                end
                table.insert(workingIsland.faces, face)
                
                newlines = 0
                whitespace = 0
            end
            
            prevChar = char
        end
    until #codepoints == 0
    
    if newlines > 0 then
        whitespace = 0
        workingCluster.caret.x = 0
        workingCluster.caret.y -= Styling.fontSize*Styling.lineHeight * newlines * (FontBaseUnit/Styling.fontSize) * (activeFont.fontSize/activeFont.cellSize)
        splitTextIsland()
    end
    
    workingCluster.whitespace = whitespace
    
    return workingCluster
end


function render(cluster: TextCluster?)
    if cluster == nil then cluster = workingCluster end
    
    if #cluster.islands[#cluster.islands].faces == 0 then table.remove(cluster.islands, #cluster.islands) end
    
    local params: {any} = {}
    
    for _, island in (cluster :: Cluster).islands do
        local free = ll.LinksetDataRead("NT5_Free")
        if #free == 0 then error("No free text prims available in linkset") end
        local link = string.byte(free, 1, 1)
        ll.LinksetDataWrite("NT5_Free", string.sub(free, 2))
        
        table.insert(params, PRIM_LINK_TARGET)
        table.insert(params, link)
        -- table.insert(params, PRIM_DESC)
        -- table.insert(params, "Text")
        
        if island.color then
            table.insert(params, PRIM_COLOR)
            table.insert(params, 0)
            table.insert(params, island.color)
            table.insert(params, 1)
        end
        
        if island.type == "proportional" then
            local minimumSize = 0.01 * (FontBaseUnit/island.fontSize)
            if island.width < minimumSize then island.width = minimumSize end -- Minimum prim size
        end
        
        for index, face in island.faces do
            local texture = Textures[face.t]
            local islandWidth = 0
            local repeats, coords
            if island.type == "proportional" then
                islandWidth = island.width * texture.font.cellSize/FontBaseUnit
                
                repeats = vector(
                    islandWidth / texture.width,
                    texture.font.cellSize / texture.height,
                    0
                )
                coords = vector(
                    (face.u + islandWidth*.5) / texture.width,
                    face.v / texture.height,
                    0
                )
            else
                islandWidth = 8 * texture.font.cellSize
                
                repeats = vector(
                    texture.font.cellSize / texture.width,
                    texture.font.cellSize / texture.height,
                    0
                )
                coords = vector(
                    face.u / texture.width,
                    face.v / texture.height,
                    0
                )
            end
            
            if face.color then
                table.insert(params, PRIM_COLOR)
                table.insert(params, index - 1)
                table.insert(params, face.color)
                table.insert(params, 1)
            end
            table.insert(params, PRIM_TEXTURE)
            table.insert(params, index - 1)
            table.insert(params, texture.uuid)
            table.insert(params, repeats)
            table.insert(params, coords)
            table.insert(params, 0)
        end
        
        if island.type == "proportional" then
            local pos = vector(
                0,
                (island.x + island.width*.5) * (island.fontSize/FontBaseUnit),
                island.y * (island.fontSize/FontBaseUnit) -- + island.fontSize * 0.25
            )
            
            pos *= workingCluster.rot
            
            table.insert(params, PRIM_POS_LOCAL)
            table.insert(params, workingCluster.pos + pos)
            table.insert(params, PRIM_ROT_LOCAL)
            table.insert(params, quaternion(0,0,-1,0) * workingCluster.rot)
            table.insert(params, PRIM_SIZE)
            table.insert(params, vector(
                0.01,
                island.width / FontBaseUnit * island.fontSize,
                island.fontSize
            ))
        elseif island.type == "fixed" then
            local pos = vector(
                0,
                (island.x + FontFixedUnit*4) * (island.fontSize/FontBaseUnit),
                island.y * (island.fontSize/FontBaseUnit) -- + island.fontSize * 0.25
            )
            
            pos *= workingCluster.rot
            
            table.insert(params, PRIM_POS_LOCAL)
            table.insert(params, workingCluster.pos + pos)
            table.insert(params, PRIM_ROT_LOCAL)
            table.insert(params, quaternion(0,0,.70711,.70711) * workingCluster.rot)
            table.insert(params, PRIM_SIZE)
            table.insert(params, vector(
                (FontFixedUnit*8) / FontBaseUnit * island.fontSize,
                0.01,
                island.fontSize
            ))
        end
    end
    
    ll.SetLinkPrimitiveParamsFast(0, params)
    
    resume.caret = workingCluster.caret
    resume.whitespace = workingCluster.whitespace
    workingCluster = nil
    workingIsland = nil
end



local TextRenderingContext = setmetatable({
    write = write,
    render = render,
    resume = function() workingCluster = createTextCluster(resume) end,
    markdown = function(self, text: string, styles: {[string]: {any}})
        for _, line in text:split("\n") do
            local trimmed = line:match("^%s*(.-)%s*$")
            
            -- Headings
            local heading_level = trimmed:match("^(#+)%s")
            if heading_level then
                local content = trimmed:sub(#heading_level + 2)
                write(content .. "\n", styles["h" .. #heading_level] or styles.heading)
            -- Blockquotes
            elseif trimmed:match("^>%s") then
                local content = trimmed:sub(3)
                write("\t" .. content .. "\n", styles.blockquote)
            -- Lists
            elseif trimmed:match("^[%*%-]%s") or trimmed:match("^%d+%.%s") then
                local content = trimmed:gsub("^[%*%-]%s", ""):gsub("^%d+%.%s", "")
                write("  • " .. content .. "\n", styles.list)
            -- Bold and italic
            else
                local result = ""
                local pos = 1
                while pos <= #trimmed do
                    local bold_start, bold_end = trimmed:find("%*%*(.-)%*%*", pos)
                    local italic_start, italic_end = trimmed:find("%*(.-)%*", pos)
                    local link_start, link_end = trimmed:find("%[(.-)%]%((.-)%)", pos)
                    
                    local next_pattern = math.min(bold_start or math.huge, italic_start or math.huge, link_start or math.huge)
                    
                    if next_pattern == math.huge then
                        result = trimmed:sub(pos)
                        break
                    end
                    
                    if next_pattern == bold_start then
                        result = trimmed:sub(pos, bold_start - 1)
                        write(result, styles.text)
                        write(trimmed:sub(bold_start + 2, bold_end - 2), styles.strong)
                        pos = bold_end + 1
                    elseif next_pattern == link_start then
                        result = trimmed:sub(pos, link_start - 1)
                        write(result, styles.text)
                        local link_text = trimmed:match("%[(.-)%]", link_start)
                        write(link_text, styles.link)
                        pos = link_end + 1
                    else
                        result = trimmed:sub(pos, italic_start - 1)
                        write(result, styles.text)
                        write(trimmed:sub(italic_start + 1, italic_end - 1), styles.em)
                        pos = italic_end + 1
                    end
                end
                
                if result ~= trimmed then write(result .. "\n", styles.text)
                else write("\n", styles.text) end
            end
        end
    end,
}, {
    __index = Styling,
    __newindex = Styling,
})



local ctx = TextRenderingContext;
ctx.position = vector(0,0,4)
ctx.write("Hello, World 👋🌐!\nThis is a test of NexiiText5.")
ctx.write("\nThe quick brown 🦊 jumps over the lazy 🐶.\n0123456789", { color = vector(1,0,0) })
ctx.render();


ctx.position = vector(0,0,3)
ctx:markdown([[
Fonts are **proportional ↔** and **fixed-width ⬜**,
with **kerning** (To, Ve, LY, YA, etc) and **word-wrapping**!

Enjoy using **NexiiText5**.
]], {
    text = { color = vector(1,1,1) },
    strong = { color = vector(.7,.7,1) },
})
ctx.render()
