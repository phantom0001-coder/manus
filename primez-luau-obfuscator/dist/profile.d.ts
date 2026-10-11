import type { TransformProfile } from './types.js';
export declare const ROBLOX_BUILTINS: string[];
export declare const PROFILES: Record<TransformProfile, {
    rename: boolean;
    encodeStrings: boolean;
    flatten: boolean;
}>;
