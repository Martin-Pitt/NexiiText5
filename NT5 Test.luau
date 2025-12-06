if ll.LinksetDataRead("NT5_Fonts") == "" then
    error("There is no font saved into Linkset Data, did you forget to drop in the NT5 Data Loader script first to setup the object?")
end

local FontBaseUnit = 1000
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


type Font = {
    type: "proportional" | "fixed",
    name: string,
    columns: number,
    rows: number,
    cellSize: number,
    fontSize: number,
    
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
    if force then
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
            -- if Styling.color ~= vector.one then workingIsland.color = Styling.color end
        else
            workingIsland = {
                type = activeFont.type,
                x = workingCluster.caret.x,
                y = workingCluster.caret.y,
                fontSize = Styling.fontSize,
                faces = {},
                color = Styling.color,
                width = 0,
                availableWidth = 2048/activeFont.columns * FontBaseUnit/activeFont.cellSize,
            } :: Island
            -- if Styling.color ~= vector.one then workingIsland.color = Styling.color end
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
            workingIsland.availableWidth = 2048/activeFont.columns * FontBaseUnit/activeFont.cellSize
        end
    end
end


-- Writes text into a virtual 2D canvas through a cluster of islands, each representing a mesh prim
function write(text: string, cluster: Cluster?)
    if cluster == nil and workingCluster == nil then
        workingCluster = createTextCluster()
        splitTextIsland(true)
    elseif cluster then workingCluster = cluster end
    if workingIsland == nil then splitTextIsland() end
    
    local whitespace = workingCluster.whitespace
    local newlines = 0
    
    local codepoints = table.pack(utf8.codepoint(text, 1, #text))
    local prevChar = nil
    repeat
        local codepoint = table.remove(codepoints, 1)
        local char = utf8.char(codepoint)
        
        if activeFont.type == 'proportional' and activeFont.whitespace[char] then
            whitespace += activeFont.whitespace[char]
        elseif activeFont.type == 'fixed' and char == " " then
            whitespace += 250
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
            local fontIndex, textureIndex, charIndex, glyphWidth, leftGap, rightGap = table.unpack(lljson.decode(`[{metrics}]`) :: {number})
            
            if prevChar then
                local pair = prevChar .. char
                if activeFont.kerning[pair] then
                    glyphWidth += activeFont.kerning[pair]
                end
            end
            prevChar = char
            
            glyphWidth *= (activeFont.fontSize/activeFont.cellSize)
            
            if Fonts[fontIndex].name ~= activeFont.name then
                local prevFont = activeFont
                activeFont = Fonts[fontIndex]
                if prevFont.type ~= activeFont.type then splitTextIsland() end
            end
            
            local addedWidth = whitespace + glyphWidth
            local islandEnd = workingCluster.caret.x - workingIsland.x
            
            local outOfFaces = #workingIsland.faces >= 8
            local notEnoughSpace = (workingIsland.type == 'proportional' and addedWidth > workingIsland.availableWidth)
                                or (workingIsland.type == 'fixed' and addedWidth > #workingIsland.faces*activeFont.cellSize)
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
            if workingIsland.type == 'proportional' then
                workingIsland.availableWidth -= addedWidth
                if rightGap < workingIsland.availableWidth then
                    workingIsland.availableWidth = rightGap
                end
                workingIsland.width += addedWidth
                
                local columnWidth = 2048 / activeFont.columns
                local x = (columnWidth*.5 + columnWidth * ((charIndex - 1) % activeFont.columns))
                local y = activeFont.cellSize * math.floor((charIndex - 1) / activeFont.columns)
                local pos = (islandEnd + whitespace + glyphWidth*.5) * (activeFont.cellSize/FontBaseUnit)
                local face = {
                    t = textureIndex,
                    u = x - texture.width/2 - pos,
                    v = 1 - ((y - activeFont.cellSize/2) - texture.height/2),
                } :: IslandFace
                if Styling.color ~= vector.one or workingIsland.color ~= Styling.color then face.color = Styling.color end
                table.insert(workingIsland.faces, face)
            else -- fixed
                local x = activeFont.cellSize * ((charIndex - 1) % activeFont.columns)
                local y = activeFont.cellSize * math.floor((charIndex - 1) / activeFont.columns)
                local face = {
                    t = textureIndex,
                    u = x - texture.width/2,
                    v = 1 - ((y - activeFont.cellSize/2) - texture.height/2),
                } :: IslandFace
                if Styling.color ~= vector.one or workingIsland.color ~= Styling.color then face.color = Styling.color end
                table.insert(workingIsland.faces, face)
            end
            workingCluster.caret.x += addedWidth
            
            newlines = 0
            whitespace = 0
        end
    until #codepoints == 0
    
    if newlines > 0 then
        workingCluster.caret.x = 0
        workingCluster.caret.y -= Styling.fontSize*Styling.lineHeight * newlines * FontBaseUnit * (activeFont.fontSize/activeFont.cellSize)
        splitTextIsland()
    end
    
    workingCluster.whitespace = whitespace
    
    return workingCluster
end


function render(cluster: TextCluster?)
    if cluster == nil then cluster = workingCluster end
    
    local params: {any} = {}
    
    for _, island in cluster.islands do
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
            if island.type == "proportional" then
                islandWidth = island.width * texture.font.cellSize/FontBaseUnit
            else
                islandWidth = 8 * texture.font.cellSize
            end
            
            --islandWidth *= (texture.font.fontSize/texture.font.cellSize)
            
            local repeats = vector(
                islandWidth / texture.width,
                texture.font.cellSize / texture.height,
                0
            )
            local coords = vector(
                (face.u + islandWidth*.5) / texture.width,
                face.v / texture.height,
                0
            )
            
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
        
        local pos = vector(
            0,
            (island.x + island.width*.5) * (island.fontSize/FontBaseUnit),
            island.y * (island.fontSize/FontBaseUnit) -- + island.fontSize * 0.25
        )
        
        pos *= workingCluster.rot
        
        table.insert(params, PRIM_POS_LOCAL)
        table.insert(params, workingCluster.pos + pos)
        table.insert(params, PRIM_ROT_LOCAL)
        table.insert(params, quaternion(0,0,-1,0) *workingCluster.rot)
        table.insert(params, PRIM_SIZE)
        table.insert(params, vector(
            0.01,
            island.width / FontBaseUnit * island.fontSize,
            island.fontSize
        ))
    end
    
    ll.SetLinkPrimitiveParamsFast(0, params)
    
    workingCluster = nil
    workingIsland = nil
end

Styling.position = vector(0,0,4)
write("Hello, World!\nThis is a test of NexiiText5.")
Styling.color = vector(1,0,0)
write("\nThe quick brown fox jumps over the lazy dog.\n0123456789")
render()

LLTimers:once(2.0, function(scheduled_time)
    Styling.position = vector(0,0,3)
    Styling.color = vector(.5,1,.5)
    render(write("Another text cluster,\ncreated after 2 seconds!"))
end)

-- LLTimers:once(0.5, function(scheduled_time)
    Styling.position = vector(0,0,2)
    Styling.color = vector(1,1,1); write("Fonts are ")
    Styling.color = vector(.7,.7,1); write("proportional")
    Styling.color = vector(1,1,1); write(" and ")
    Styling.color = vector(.7,.7,1); write("fixed-width")
    Styling.color = vector(1,1,1); write(",\nwith ")
    Styling.color = vector(.7,.7,1); write("kerning")
    Styling.color = vector(1,1,1); write(" and ")
    Styling.color = vector(.7,.7,1); write("word-wrapping")
    Styling.color = vector(1,1,1); write("!\n\nEnjoy using ")
    Styling.color = vector(.7,.7,1); write("NexiiText5")
    Styling.color = vector(1,1,1); write(".")
    render()
-- end)
