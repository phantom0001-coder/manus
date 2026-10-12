--!strict

type Pair = { left: number, right: number }

local function add(a: number, b: number): number
    return a + b
end

local function passthrough(...): ...any
    return ...
end

local pair: Pair = { left = 2, right = 3 }
local total = if pair.left < pair.right then add(pair.left, pair.right) else 0
local first = passthrough(total)

print(first)
