--!strict
local Players = game:GetService("Players")
local localState = { clicks = 0 }

local function makeButton(parent: Instance, label: string)
    local button = Instance.new("TextButton")
    button.Name = label
    button.Parent = parent
    local connection = button.Activated:Connect(function()
        localState.clicks += 1
        print(label, localState.clicks)
    end)
    return button, connection
end

return {
    makeButton = makeButton,
    players = Players,
}
