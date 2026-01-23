
import fs from "fs";
import { importSPKI, exportJWK } from "jose";

const main = async () => {
    try {
        const pem = fs.readFileSync("public.pem", "utf8");
        const key = await importSPKI(pem, "RS256");
        const jwk = await exportJWK(key);
        
        // Add kid as it is in the config
        jwk.kid = "main-key";
        jwk.use = "sig";
        jwk.alg = "RS256";

        const jwks = { keys: [jwk] };
        const json = JSON.stringify(jwks, null, 2);
        const base64 = Buffer.from(json).toString("base64");
        
        fs.writeFileSync("new_jwks.txt", base64);
        console.log("Saved new JWKS base64 to new_jwks.txt");
        
    } catch (e) {
        console.error(e);
    }
};

main();
