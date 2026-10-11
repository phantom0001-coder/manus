-- Executor compatibility fixture: these globals must remain untouched.
local function run(source: string)
  local executorName = identifyexecutor and identifyexecutor() or "unknown"
  local clipboard = setclipboard or toclipboard or writeclipboard
  local http = request or http_request
  local gui = gethui and gethui() or game:GetService("CoreGui")
  local ref = cloneref and cloneref(gui) or gui
  if loadstring then
    local loaded = loadstring(source)
    if loaded then return loaded, executorName, clipboard, http, ref end
  end
  return nil, executorName, clipboard, http, ref
end

return run
