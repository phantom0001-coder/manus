local function object()
  return setmetatable({}, {
    __index = function(_, key)
      if key == "GetService" then return function() return object() end end
      if key == "Connect" or key == "Once" then return function() return object() end end
      if key == "Play" or key == "Destroy" or key == "Wait" then return function() end end
      return object()
    end,
    __newindex = rawset,
    __call = function() return object() end,
  })
end

game = object()
workspace = object()
Instance = { new = function() return object() end }
Enum = object()
Color3 = { fromRGB = function() return object() end }
Vector2 = { new = function() return object() end }
Vector3 = { new = function() return object() end }
UDim = { new = function() return object() end }
UDim2 = { new = function() return object() end, fromOffset = function() return object() end }
Font = { new = function() return object() end }
TweenInfo = { new = function() return object() end }
