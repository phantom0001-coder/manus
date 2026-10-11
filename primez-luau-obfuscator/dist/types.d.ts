export type TransformProfile = 'safe' | 'balanced' | 'strong' | 'maximum';
export type CompatibilityStatus = 'SUPPORTED' | 'SUPPORTED-SAFE' | 'DYNAMIC' | 'UNSUPPORTED';
export interface CompatibilityFinding {
    status: CompatibilityStatus;
    feature: string;
    message: string;
    line?: number;
}
export interface CompatibilityReport {
    status: CompatibilityStatus;
    findings: CompatibilityFinding[];
    supportedTransforms: string[];
    skippedTransforms: string[];
}
export interface ObfuscationOptions {
    profile: TransformProfile;
    seed: number;
    target: 'roblox-luau';
}
