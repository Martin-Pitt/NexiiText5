--[[
* Scanning linkset and currently generated text sets (used vs free)
* New SLua specific way of consuming text, generating islands and converting islands to prim params
* Better reusability / way to regenerate text
* Robust against linkset changes and script resets
    - ID saved into text prim descriptors? Maybe also saving island IDs
* Multiple textures support for more unicode characters
* Emojis sheet!

* NexText is the main library
* An Island represents a single mesh prim of rendered glyphs
* A Cluster is a collection of Islands and so represents text, paragraphs, etc.
]]


type FontTexture = {
    index: number,
    id: uuid,
    size: number,
    fontSize: number,
    cellSize: number,
    columnSize: number,
}

type TextIslandGlyph = {string | number}

-- Islands represent a single mesh prim of glyphs
type TextIsland = {
    -- Core
    x: number,
    y: number,
    w: number,
    availableWidth: number,
    faces: number,
    glyphs: {TextIslandGlyph},
    link: number?,
    
    -- Styling
    fontSize: number,
    colors: vector | {number|vector},
}

-- Clusters are collections of islands
type TextCluster = {
    -- Identity
    name: string?,
    
    -- Transform
    pos: vector,
    rot: quaternion,
    
    -- Islands ready for rendering (from NexText.write), or link numbers for modifying (from linkset data)
    islands: {TextIsland | number},
}


if ll.LinksetDataRead("NT5_Textures") == "" then
    error("No textures defined; Was font setup process not performed on the object?")
end
local FontTextures = lljson.decode(ll.LinksetDataRead("NT5_Textures")) :: {FontTexture}

local NexText = {
    -- Configurable styling options
    styling = {
        position = vector.zero,
        rotation = quaternion(0, 0, 0, 1),
        fontSize = 0.5,
        lineHeight = 1.2,
        color = vector(1, 1, 1),
        textWrapLength = 64.0,
        tabSize = 4,
        tabularFigures = false,
    },
    
    textures = FontTextures,
    
    -- Active texture, dynamically set based on glyph being rendered
    texture = FontTextures[1],
    
    -- Computed constants based on stylings and/or current texture
    METERS_TO_PIXELS = 0,
    PIXELS_TO_METERS = 0,
    FONT_BY_CELL = 0,
    LINEHEIGHT = 0,
    TABWIDTH = 0,
    
    -- Working state
    workingCluster = nil :: TextCluster?,
    workingIsland = nil :: TextIsland?,
    caret = { x = 0, y = 0 },
    isNewline = 0,
    whitespace = 0,
}

function NexText.compute()
    NexText.METERS_TO_PIXELS = NexText.texture.cellSize / NexText.styling.fontSize
    NexText.PIXELS_TO_METERS = NexText.styling.fontSize / NexText.texture.cellSize
    NexText.FONT_BY_CELL = NexText.texture.fontSize / NexText.texture.cellSize
    NexText.LINEHEIGHT = NexText.styling.fontSize * NexText.styling.lineHeight
    NexText.TABWIDTH = 12.5 * NexText.styling.tabSize
end

function NexText.setCaret(x: number, y: number)
    NexText.caret.x = x
    NexText.caret.y = y
    if NexText.workingIsland then splitTextIsland() end
end

function NexText.setFontSize(fontSize: number)
    NexText.styling.fontSize = fontSize
    NexText.compute()
    if NexText.workingIsland then splitTextIsland() end
end

function NexText.setColor(color: vector)
    NexText.styling.color = color
    
    -- we'll need to fix the island to handle the color change per face
    if NexText.workingIsland and typeof(NexText.workingIsland.colors) == "vector" then
        if NexText.workingIsland.faces == 0 then
            -- Reuse unused island
            NexText.workingIsland.colors = NexText.styling.color
        else
            -- Convert to per-face colors
            local colors = {}
            for face=1,NexText.workingIsland.faces do
                table.insert(colors, NexText.workingIsland.colors)
            end
            NexText.workingIsland.colors = colors
        end
    end
end




--[[
    NT5_<char> JSON list of glyph metrics:
    - textureIndex
    - glyphWidth
    - glyphLeftGap
    - glyphRightGap
    - textureU
    - textureV
    TODO: Update Font Texture Generator to output these + multi texture support
]]

-- Writes text and returns a cluster
function NexText.write(text: string, cluster: TextCluster?): TextCluster
    if cluster == nil then cluster = createTextCluster() end
    NexText.workingCluster = cluster
    if NexText.workingIsland == nil then
        NexText.workingIsland = createTextIsland()
        table.insert(NexText.workingCluster.islands, NexText.workingIsland :: TextIsland)
    else
        splitTextIsland()
    end
    
    local codepoints = table.pack(utf8.codepoint(text));
    repeat
        local point = table.remove(codepoints, 1)
        -- TODO: Handle graphemes somehow? Use font texture generator web app to identify grapheme clusters
        local char = utf8.char(point)
        
        if char == " " then NexText.whitespace += 12.5 -- Space
        elseif char == " " then NexText.whitespace += 25 -- EN Space
        elseif char == " " then NexText.whitespace += 50 -- EM Space
        elseif char == " " then NexText.whitespace += 16.69921875 -- Three-per-EM Space
        elseif char == " " then NexText.whitespace += 12.5 -- Four-per-EM Space
        elseif char == " " then NexText.whitespace += 8.30078125 -- Six-per-EM Space
        elseif char == " " then NexText.whitespace += 32.2265625 -- Figure Space
        elseif char == " " then NexText.whitespace += 10.986328125 -- Punctuation Space
        elseif char == " " then NexText.whitespace += 7.51953125 -- Thin Space
        elseif char == " " then NexText.whitespace += 2.978515625 -- Hair Space
        elseif char == "\t" then -- Tab indentation
            if NexText.isNewline ~= 0 then
                NexText.caret.x = 0
                NexText.caret.y -= NexText.LINEHEIGHT * NexText.isNewline * NexText.FONT_BY_CELL
                splitTextIsland()
                NexText.isNewline = 0
                NexText.whitespace = 0
            end
            
            local edge = NexText.caret.x * NexText.METERS_TO_PIXELS + NexText.whitespace
            local indent = math.ceil(edge / NexText.TABWIDTH) * NexText.TABWIDTH
            indent -= edge
            if indent < 12.5 then indent += NexText.TABWIDTH end
            NexText.whitespace += indent
        elseif char == "\n" then -- Newline
            NexText.isNewline += 1
            NexText.whitespace = 0
        else
            local glyph = ll.LinksetDataRead("NT5_" .. char)
            if glyph == "" then
                char = "�" -- Fallback
                glyph = ll.LinksetDataRead("NT5_" .. char)
            end
            
            local textureIndex, glyphWidth, glyphLeftGap, glyphRightGap = table.unpack(lljson.decode(glyph) :: {number});
            
            -- Switch texture if needed
            if NexText.texture.index ~= textureIndex then
                NexText.texture = NexText.textures[textureIndex]
                NexText.compute()
            end
            
            -- Move caret forward by whitespace
            local whitespaceInMeters = NexText.whitespace * NexText.PIXELS_TO_METERS
            NexText.caret.x += whitespaceInMeters
            
            -- Where are we right now
            local islandEnd = (NexText.caret.x - NexText.workingIsland.x) * NexText.METERS_TO_PIXELS
            
            -- Are we out of faces?
            local outOfFaces = (NexText.workingIsland.faces == 8)
            
            -- Do we need to split the island in two?
            --- Glyph wider than available space left on island
            --- Or not enough gap to left of glyph to place it
            local needsSplit = (glyphWidth > NexText.workingIsland.availableWidth - NexText.whitespace) or (islandEnd + glyphWidth*.5 > glyphLeftGap)
            
            -- Does the text need to wrap?
            local needsWrap = (NexText.caret.x + glyphWidth * NexText.PIXELS_TO_METERS > NexText.styling.textWrapLength)
            
            if outOfFaces or needsSplit or needsWrap or NexText.isNewline ~= 0 then
                if needsWrap or NexText.isNewline ~= 0 then
                    if NexText.isNewline ~= 0 then
                        NexText.caret.x = NexText.whitespace * NexText.PIXELS_TO_METERS
                        NexText.caret.y -= NexText.LINEHEIGHT * NexText.isNewline * NexText.FONT_BY_CELL
                    else
                        NexText.caret.x = 0
                        NexText.caret.y -= NexText.LINEHEIGHT * NexText.FONT_BY_CELL
                    end
                end
                
                splitTextIsland()
                islandEnd = 0
            end
            
            -- Take off available width on island by what we are about to add
            NexText.workingIsland.availableWidth -= NexText.whitespace + glyphWidth
            
            -- Check transparent gap on right of glyph for enough space for other glyphs to slot in
            if glyphRightGap < NexText.workingIsland.availableWidth then
                NexText.workingIsland.availableWidth = glyphRightGap
            end
            
            -- Finally add the glyph to the island
            table.insert(NexText.workingIsland.glyphs, {char, islandEnd + glyphWidth * .5} :: TextIslandGlyph)
            local glyphWidthInMeters = glyphWidth * NexText.PIXELS_TO_METERS
            NexText.caret.x += glyphWidthInMeters
            NexText.workingIsland.w += whitespaceInMeters + glyphWidthInMeters
            NexText.workingIsland.faces += 1
            
            NexText.isNewline = 0
            NexText.whitespace = 0
        end
    until #codepoints == 0
    
    if NexText.isNewline ~= 0 then
        NexText.caret.x = 0
        NexText.caret.y -= NexText.LINEHEIGHT * NexText.isNewline * NexText.FONT_BY_CELL
    end
    
    NexText.whitespace = 0
    NexText.isNewline = 0
    
    return cluster :: TextCluster
end




function createTextIsland(obj: {}?): TextIsland
    local island: TextIsland = {
        x = NexText.caret.x,
        y = NexText.caret.y,
        w = 0,
        availableWidth = NexText.texture.columnSize,
        faces = 0,
        glyphs = {},
        fontSize = NexText.styling.fontSize,
        colors = NexText.styling.color,
    }
    if obj ~= nil then
        for k, v in obj do island[k] = v end
    end
    return island
end

function splitTextIsland()
    local newIsland = false
    if NexText.workingIsland then
        if NexText.workingIsland.faces == 0 then newIsland = false -- Reuse unused island
        elseif NexText.workingIsland.y ~= NexText.caret.y-- Not same line
        or NexText.workingIsland.faces >= 8 -- Full island
        or NexText.workingIsland.fontSize ~= NexText.styling.fontSize -- Different font size
        then newIsland = true end
    else newIsland = true end -- No island
    
    if newIsland then
        NexText.workingIsland = createTextIsland()
        table.insert(NexText.workingCluster.islands, NexText.workingIsland)
    else
        NexText.workingIsland.x = NexText.caret.x
        NexText.workingIsland.y = NexText.caret.y
        NexText.workingIsland.fontSize = NexText.styling.fontSize
    end
end

function paramsFromIsland(island: TextIsland, cluster: TextCluster): {}
    local params = {} :: {any}
    
    -- Reserve link number
    local free = ll.LinksetDataRead("NT5_Free")
    if #free == 0 then error("No free text prims available in linkset") end
    island.link = string.byte(free, 1, 1)
    ll.LinksetDataWrite("NT5_Free", string.sub(free, 2))
    table.insert(params, PRIM_LINK_TARGET)
    table.insert(params, island.link)
    table.insert(params, PRIM_DESC)
    table.insert(params, "Text") -- TODO: Maybe store info here?
    
    if island.w < 0.01 then island.w = 0.01 end -- Minimum prim size
    island.w /= NexText.PIXELS_TO_METERS
    local repeats = vector(island.w / NexText.texture.size, NexText.texture.cellSize / NexText.texture.size, 0)
    
    -- Loop through faces
    for face = 1, island.faces do
        local char, pos = table.unpack(island.glyphs[face])
        local glyph = ll.LinksetDataRead("NT5_" .. char)
        local glyphMetrics = lljson.decode(glyph) :: {number}
        local coords = vector(glyphMetrics[5], glyphMetrics[6], 0)
        coords.x = (coords.x - pos) + island.w*.5
        coords /= NexText.texture.size
        local color
        if typeof(island.colors) == "vector" then
            color = island.colors
        else
            color = island.colors[face]
        end
        
        table.insert(params, PRIM_COLOR)
        table.insert(params, face - 1)
        table.insert(params, color)
        table.insert(params, 1)
        table.insert(params, PRIM_TEXTURE)
        table.insert(params, face - 1)
        table.insert(params, NexText.texture.id)
        table.insert(params, repeats)
        table.insert(params, coords)
        table.insert(params, 0)
    end
    
    island.w *= NexText.PIXELS_TO_METERS
    island.x += island.w * .5
    island.y += island.fontSize * .25
    
    local position = vector(0, island.x, island.y) * cluster.rot
    table.insert(params, PRIM_POS_LOCAL)
    table.insert(params, cluster.pos + position)
    table.insert(params, PRIM_ROT_LOCAL)
    table.insert(params, quaternion(.5,.5,.5,.5) * cluster.rot)
    table.insert(params, PRIM_SIZE)
    table.insert(params, vector(island.w, island.fontSize, 0.01))
    
    return params
end

function createTextCluster(obj: {}?): TextCluster
    local cluster: TextCluster = {
        pos = NexText.styling.position,
        rot = NexText.styling.rotation,
        islands = {},
    }
    if obj ~= nil then
        for k, v in obj do cluster[k] = v end
    end
    return cluster
end

function saveTextClusterToLinksetData(cluster: TextCluster): boolean
    if cluster.name == nil then error("TextCluster has no name, cannot save to linkset data") end
    
    local islands = {}
    for index, island in cluster.islands do
        if typeof(island) == "number" then
            islands[index] = island
        else
            islands[index] = island.link
        end
    end
    
    local value = tostring(cluster.pos) .. utf8.char(1) .. tostring(cluster.rot) .. utf8.char(1) .. table.concat(islands, utf8.char(2))
    return ll.LinksetDataWrite("NT5_Cluster:" .. cluster.name, value) == LINKSETDATA_OK
end

function loadTextClusterFromLinksetData(name: string): TextCluster?
    local value = ll.LinksetDataRead("NT5_Cluster:" .. name)
    if value == "" or value == nil then return nil end
    
    local pos, rot, rawIslands = table.unpack(string.split(value, utf8.char(1)))
    local islands = {}
    for index, island in string.split(rawIslands, utf8.char(2)) do
        islands[index] = tonumber(island)
    end
    
    return createTextCluster({
        name = name,
        pos = tovector(pos),
        rot = toquaternion(rot),
        islands = islands
    });
end

function renderTextCluster(cluster: TextCluster)
    if typeof(cluster.islands[1]) == "number" then
        error("TextCluster islands are link numbers, cannot render. Clusters can only be rendered from NexText.write output.")
    end
    local params = {}
    for _, island in cluster.islands do
        local islandParams = paramsFromIsland(island, cluster)
        for _, param in islandParams do table.insert(params, param) end
    end
    ll.SetLinkPrimitiveParamsFast(0, params)
end

function removeTextCluster(cluster: TextCluster)
    local resetParams = {
        PRIM_SIZE, vector(.01,.01,.01),
        PRIM_POS_LOCAL, vector.zero,
        PRIM_ROT_LOCAL, quaternion(0,0,0,1),
        PRIM_DESC, "Free"
    }
    local free = ll.LinksetDataRead("NT5_Free")
    local params = {}
    for index, island in cluster.islands do
        if typeof(island) ~= "number" then island = island.link end
        table.insert(params, PRIM_LINK_TARGET)
        table.insert(params, island)
        for i = 1, #resetParams do table.insert(params, resetParams[i]) end
        free = string.char(island) .. free
    end
    ll.SetLinkPrimitiveParamsFast(0, params)
    ll.LinksetDataWrite("NT5_Free", free)
end

function moveTextCluster(cluster: TextCluster, newPos: vector, newRot: quaternion)
    local params = {} :: {any}
    for index, island in cluster.islands do
        if typeof(island) ~= "number" then island = island.link end
        
        local islandPos: vector, islandRot: quaternion = table.unpack(ll.GetLinkPrimitiveParams(island, {PRIM_POS_LOCAL, PRIM_ROT_LOCAL}) :: {any});
        
        islandPos = (islandPos - cluster.pos) / cluster.rot
        islandRot = islandRot / cluster.rot
        
        islandPos = (islandPos * newRot) + newPos
        islandRot = islandRot * newRot
        
        table.insert(params, PRIM_POS_LOCAL)
        table.insert(params, islandPos)
        table.insert(params, PRIM_ROT_LOCAL)
        table.insert(params, islandRot)
    end
    ll.SetLinkPrimitiveParamsFast(0, params)
    
    cluster.pos = newPos
    cluster.rot = newRot
end



-- Initialise NexText
function NexTextInitLinksetNumbers()
    local free = {}
    for link = 1, ll.GetNumberOfPrims() do
        local name = ll.GetLinkName(link)
        if name == "Text" then
            local desc = table.unpack(ll.GetLinkPrimitiveParams(link, {PRIM_DESC}))
            if desc == "Free" then table.insert(free, string.char(link)) end
        end
    end
    free = table.concat(free)
    ll.LinksetDataWrite("NT5_Free", free)
    
    local resetParams = {
        PRIM_SIZE, vector(.01,.01,.01),
        PRIM_POS_LOCAL, vector.zero,
        PRIM_ROT_LOCAL, quaternion(0,0,0,1),
    } :: {any}
    local params = {}
    for iterator = 1, #free do
        table.insert(params, PRIM_LINK_TARGET)
        table.insert(params, string.byte(free, iterator, iterator))
        for i = 1, #resetParams do
            table.insert(params, resetParams[i])
        end
    end
    ll.SetLinkPrimitiveParamsFast(0, params)
end
NexTextInitLinksetNumbers()

for index, texture in NexText.textures do texture.index = index end
NexText.texture = NexText.textures[1]
NexText.compute()


-- Example usage
NexText.setCaret(vector(0, 0, 4))
local hello = NexText.write("Hello, World!\nTesting NexiiText5 :D")
renderTextCluster(hello)
ll.Sleep(2.5)
removeTextCluster(hello)



