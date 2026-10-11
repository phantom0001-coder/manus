export const ROBLOX_BUILTINS = [
    'game', 'workspace', 'script', 'shared', '_G', 'plugin',
    'print', 'warn', 'error', 'assert', 'pairs', 'ipairs', 'next',
    'select', 'unpack', 'pcall', 'xpcall', 'require', 'type', 'typeof',
    'tostring', 'tonumber', 'rawequal', 'rawget', 'rawset', 'getmetatable',
    'setmetatable', 'coroutine', 'string', 'table', 'math', 'bit32', 'utf8',
    'os', 'debug', 'task', 'buffer', 'Instance', 'Enum', 'Color3', 'Vector2',
    'Vector3', 'UDim', 'UDim2', 'CFrame', 'Ray', 'Rect', 'Region3', 'TweenInfo',
];
export const PROFILES = {
    safe: { rename: true, encodeStrings: false, flatten: false },
    balanced: { rename: true, encodeStrings: true, flatten: false },
    strong: { rename: true, encodeStrings: true, flatten: false },
    maximum: { rename: true, encodeStrings: true, flatten: false },
};
