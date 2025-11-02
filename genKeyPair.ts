import { encodeBase64 } from "jsr:@std/encoding/base64"
const keyPair = await crypto.subtle.generateKey(
    {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
)
console.log(keyPair)
console.log(
    "Private key:",
    encodeBase64(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)),
)
console.log(
    "Public key:",
    encodeBase64(await crypto.subtle.exportKey("spki", keyPair.publicKey)),
)
