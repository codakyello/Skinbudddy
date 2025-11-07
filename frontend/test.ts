// import { generateKeyPair } from "jose";

// const { publicKey, privateKey } = await generateKeyPair("RS256");
// console.log("Private key:", privateKey);
// console.log("Public key:", publicKey);

import { generateKeyPair, exportPKCS8, exportSPKI, exportJWK } from "jose";
import { writeFileSync } from "fs";

// 1. Generate
const { publicKey, privateKey } = await generateKeyPair("RS256", {
  extractable: true,
});

// 2. Export to PEM files (for signing & reference)
const pkcs8Pem = await exportPKCS8(privateKey); // private key PEM
const spkiPem = await exportSPKI(publicKey); // public key PEM

writeFileSync("private.pem", pkcs8Pem);
writeFileSync("public.pem", spkiPem);

console.log("✅ Keys saved as private.pem & public.pem");

// 3. Export public key as JWKS JSON
const jwk = await exportJWK(publicKey);
jwk.use = "sig";
jwk.alg = "RS256";
jwk.kid = "main-key"; // identifier for the key

const jwks = { keys: [jwk] };
writeFileSync("jwks.json", JSON.stringify(jwks, null, 2));
console.log("✅ JWKS saved as jwks.json");
