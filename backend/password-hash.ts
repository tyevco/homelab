import bcrypt from "bcryptjs";
import crypto from "crypto";
const saltRounds = 10;

/**
 * Hash a password
 * @param {string} password Password to hash
 * @returns {string} Hash
 */
export function generatePasswordHash(password : string) {
    return bcrypt.hashSync(password, saltRounds);
}

/**
 * Verify a password against a hash
 * @param {string} password Password to verify
 * @param {string} hash Hash to verify against
 * @returns {boolean} Does the password match the hash?
 */
export function verifyPassword(password : string, hash : string) {
    return bcrypt.compareSync(password, hash);
}

/**
 * Does the hash need to be rehashed?
 * @param {string} hash Hash to check
 * @returns {boolean} Needs to be rehashed?
 */
export function needRehashPassword(hash : string) : boolean {
    return false;
}

export const SHAKE256_LENGTH = 16;

/**
 * @param {string} data The data to be hashed
 * @param {number} len Output length of the hash
 * @returns {string} The hashed data in hex format
 */
/**
 * Encrypt a plaintext password using AES-256-GCM
 * @param {string} plaintext The password to encrypt
 * @param {string} key The encryption key (jwtSecret)
 * @returns {string} Encrypted string in format "iv:authTag:ciphertext" (hex)
 */
export function encryptPassword(plaintext : string, key : string) : string {
    const derivedKey = crypto.createHash("sha256").update(key).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

/**
 * Decrypt an encrypted password using AES-256-GCM
 * @param {string} encrypted The encrypted string in format "iv:authTag:ciphertext" (hex)
 * @param {string} key The encryption key (jwtSecret)
 * @returns {string} Decrypted plaintext password
 */
export function decryptPassword(encrypted : string, key : string) : string {
    const parts = encrypted.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted password format");
    }
    const [ ivHex, authTagHex, ciphertext ] = parts;
    const derivedKey = crypto.createHash("sha256").update(key).digest();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

export function shake256(data : string, len : number) {
    if (!data) {
        return "";
    }
    return crypto.createHash("shake256", { outputLength: len })
        .update(data)
        .digest("hex");
}
