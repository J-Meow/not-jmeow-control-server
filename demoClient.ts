import { decodeBase64 } from "jsr:@std/encoding/base64"

const keyPair = {
    private: await crypto.subtle.importKey(
        "pkcs8",
        decodeBase64(Deno.env.get("PRIVATE_KEY")!),
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["decrypt"],
    ),
    public: await crypto.subtle.importKey(
        "spki",
        decodeBase64(Deno.env.get("PUBLIC_KEY")!),
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["encrypt"],
    ),
}

const textDecoder = new TextDecoder()

const socket = new WebSocket(
    "ws://localhost:7531/connect?secret=" +
        encodeURIComponent(Deno.env.get("CONNECTION_SECRET")!),
)

socket.addEventListener("open", () => {
    console.log("Socket open")
})

socket.addEventListener("message", async (ev) => {
    const encryptedKey = await ev.data.arrayBuffer()
    console.log(
        "Connected, got key: " +
            textDecoder.decode(
                await crypto.subtle.decrypt(
                    { name: "RSA-OAEP" },
                    keyPair.private,
                    encryptedKey,
                ),
            ),
    )
})
