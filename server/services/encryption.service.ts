import crypto from 'crypto';

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  private static readonly KEY_LENGTH = 32;

  private static getKey(): Buffer {
    const rawKey = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'tsolutions-nexus-aes-256-secret!';
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  public static encrypt(text: string): { encryptedData: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.getKey(), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      tag
    };
  }

  public static decrypt(encryptedData: string, ivHex: string, tagHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.getKey(), iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
