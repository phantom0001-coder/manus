-- Representative compatibility fixture; URLs are intentionally inert placeholders.
local function loadRemote(url)
    return loadstring(game:HttpGet(url))()
end

local function inspectEnvironment()
    return getfenv and getfenv(2)
end

task.spawn(function()
    pcall(function()
        loadRemote("https://example.invalid/remote.luau")
    end)
end)

local drawing = Drawing and Drawing.new("Line")
return loadRemote, inspectEnvironment, drawing
