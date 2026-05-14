import { decodeBinary } from "../../livesync-commonlib/src/string_and_binary/convert.ts";

export function docContent(doc: { type?: string; datatype?: string; data: string[] }): string | Uint8Array {
    const isPlain = doc.type === "plain" || doc.datatype === "plain";
    if (isPlain) {
        return doc.data.join("");
    }
    return new Uint8Array(decodeBinary(doc.data) as ArrayBuffer);
}

export function docContentAsString(doc: { type?: string; datatype?: string; data: string[] }): string {
    const result = docContent(doc);
    return result instanceof Uint8Array ? new TextDecoder().decode(result) : result;
}
