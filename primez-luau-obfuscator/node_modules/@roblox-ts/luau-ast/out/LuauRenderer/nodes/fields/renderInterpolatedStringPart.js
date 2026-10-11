"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderInterpolatedStringPart = void 0;
const LuauAST_1 = __importDefault(require("../../../LuauAST"));
function renderInterpolatedStringPart(state, node) {
    return node.text.replace(/(\\(?:u\{[a-fA-F0-9]+\}|\r\n|[\s\S]))|([{}]|\r\n?|\n)/g, (_, escape, character) => escape !== null && escape !== void 0 ? escape : "\\" + character);
}
exports.renderInterpolatedStringPart = renderInterpolatedStringPart;
//# sourceMappingURL=renderInterpolatedStringPart.js.map