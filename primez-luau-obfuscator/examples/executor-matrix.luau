-- Broad executor compatibility matrix. These names must remain global passthroughs.
local function matrix(target)
  local mt = getrawmetatable and getrawmetatable(target)
  local readonly = setreadonly or make_readonly
  local hook = hookfunction or hookmetamethod
  local closure = newcclosure and newcclosure(function() end)
  local drawing = Drawing and Drawing.new("Line")
  local connections = getconnections and getconnections(target.Changed)
  local loaded = getloadedmodules and getloadedmodules()
  local gc = getgc and getgc(true)
  local registry = getreg and getreg()
  local instances = getinstances and getinstances()
  local nilInstances = getnilinstances and getnilinstances()
  local current = getcallingscript and getcallingscript()
  local queued = queue_on_teleport or queueonteleport
  local click = fireclickdetector
  local prompt = fireproximityprompt
  local touch = firetouchinterest
  local signal = firesignal
  if queued and closure then queued("return true") end
  return mt, readonly, hook, closure, drawing, connections, loaded, gc, registry, instances, nilInstances, current, click, prompt, touch, signal
end

return matrix
