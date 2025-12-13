local ctx = require("./NT5 Renderer.luau")
ctx.textWrapLength = 7

local message = {}
local timeStyling = { color = vector(.5,.5,.5), tabularFigures = true }
local avatarNameStyling = { color = vector(.2,.7,1) }
local objectNameStyling = { color = vector(.2,.8,.3) }
local textStyling = { color = vector(1, 1, 1) }

function newMessage(time: number, identifier: uuid, text: string)
    ctx.write(os.date("[%H:%M] "), timeStyling)
    
    local name
    local nameStyling
    if ll.GetAgentSize(identifier) ~= vector.zero then
        nameStyling = avatarNameStyling
        name = ll.GetDisplayName(identifier)
        if name == "" or name == "???" or name == "Loading..." then name = ll.GetUsername(name) end
    else
        nameStyling = objectNameStyling
        name = ll.Key2Name(identifier)
    end
    
    if text:find("^/me ") then
        name ..= " "
        text = text:sub(#"/me " + 1)
    else
        name ..= ": "
    end
    
    ctx.write(name, nameStyling)
    ctx.write(text, textStyling)
    local cluster = ctx.render()
    table.insert(message, cluster)
    if #message > 10 then
        ctx.release(table.remove(message, 1))
    end
end

function moveCluster(cluster, position: vector, rotation: quaternion?)
    if rotation == nil then rotation = cluster.rot end
    local invRot = quaternion(cluster.rot.x, cluster.rot.y, cluster.rot.z, -cluster.rot.s)
    local params = {}
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
    newMessage(os.time(), identifier, text)
    relayoutMessages()
end)

ll.Listen(PUBLIC_CHANNEL, "", NULL_KEY, "")
