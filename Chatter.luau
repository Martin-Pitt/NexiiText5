local ctx = require("./NT5 Renderer.luau")
ctx.textWrapLength = 7

local message = {}
local timeStyling = { color = vector(.5,.5,.5), tabularFigures = true }
local avatarNameStyling = { color = vector(.2,.7,1) }
local objectNameStyling = { color = vector(.2,.8,.3) }
local publicTextStyling = { color = vector(1,1,1) }
local hiddenTextStyling = { color = vector(.7,.7,.7) }

function stringMostlyUnknownCharacters(s: string): boolean
    local unknownCount = 0
    for i = 1, #s do
        if not ll.LinksetDataRead("NT5_" .. s:sub(i, i)) then unknownCount += 1 end
    end
    return unknownCount / #s > 0.3
end

function newMessage(channel: number, time: number, identifier: uuid, text: string)
    ctx.write(os.date("[%H:%M] "), timeStyling)
    
    local name
    local nameStyling
    if ll.GetAgentSize(identifier) ~= vector.zero then
        nameStyling = avatarNameStyling
        name = ll.GetDisplayName(identifier)
        if name == "" or name == "???" or name == "Loading..." or stringMostlyUnknownCharacters(name) then name = ll.GetUsername(name) end
    else
        nameStyling = objectNameStyling
        name = ll.Key2Name(identifier)
    end
    
    local textStyling
    if channel == PUBLIC_CHANNEL then
        textStyling = publicTextStyling
    else
        textStyling = hiddenTextStyling
    end
    
    if text:find("^/me ") then
        name ..= " "
        text = text:sub(#"/me " + 1)
    else
        name ..= ": "
    end
    
    ctx.write(name, nameStyling)
    
    -- Write and render text out in small chunks to avoid memory issues
    local cluster
    for i = 1, #text, 256 do
        if cluster then ctx.resume() end
        local chunk = text:sub(i, math.min(i + 255, #text))
        ctx.write(chunk, textStyling)
        local c = ctx.render()
        
        -- Merge clusters on the go
        if cluster == nil then
            cluster = c
        else
            for _, link in c.links do
                table.insert(cluster.links, link)
            end
            cluster.width = math.max(cluster.width, c.width)
            cluster.height = math.max(cluster.height, c.height)
        end
    end
    table.insert(message, cluster)
    
    if #message > 10 then
        ctx.release(table.remove(message, 1))
    end
end

function moveCluster(cluster, position: vector, rotation: quaternion?)
    if rotation == nil then rotation = cluster.rot end
    local invRot = quaternion(cluster.rot.x, cluster.rot.y, cluster.rot.z, -cluster.rot.s)
    local params = table.create(#cluster.links * 6)
    for _, link in cluster.links do
        local result = ll.GetLinkPrimitiveParams(link, {PRIM_POS_LOCAL, PRIM_ROT_LOCAL})
        local linkPos, linkRot = table.unpack(result)
        linkPos = (linkPos - cluster.pos) * invRot
        linkRot = linkRot * invRot
        linkPos = (linkPos + position) * rotation
        linkRot = linkRot * rotation
        table.insert(params, PRIM_LINK_TARGET)
        table.insert(params, link)
        table.insert(params, PRIM_POS_LOCAL)
        table.insert(params, linkPos)
        table.insert(params, PRIM_ROT_LOCAL)
        table.insert(params, linkRot)
    end
    ll.SetLinkPrimitiveParamsFast(0, params)
    cluster.pos = position
    cluster.rot = rotation
end

function relayoutMessages()
    local messagesHeight = 0
    for _, cluster in message do messagesHeight += cluster.height end
    
    local position = vector(0, 0, 1 + messagesHeight)
    for _, cluster in message do
        moveCluster(cluster, position)
        position = position - vector(0, 0, cluster.height)
    end
end



LLEvents:on('listen', function(channel: number, name: string, identifier: uuid, text: string)
    newMessage(channel, os.time(), identifier, text)
    relayoutMessages()
end)

ll.Listen(PUBLIC_CHANNEL, "", NULL_KEY, "")
ll.Listen(1, "", NULL_KEY, "")
ll.Listen(2, "", NULL_KEY, "")
ll.Listen(3, "", NULL_KEY, "")
ll.Listen(4, "", NULL_KEY, "")
