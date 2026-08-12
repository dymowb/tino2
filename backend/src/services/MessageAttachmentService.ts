import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { In, Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { MessageAttachment } from '@/models/MessageAttachment';
import logger from '@/config/logger';

/** Thrown when the caller may not read the attachment they addressed. */
export class AttachmentAccessError extends Error {
  constructor(message = 'Attachment not found') {
    super(message);
    this.name = 'AttachmentAccessError';
  }
}

/** Thrown when an upload fails validation. */
export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentValidationError';
  }
}

/**
 * Files whose type can be confirmed from their own leading bytes.
 *
 * Validating by file extension — which is what this used to do — means a caller
 * chooses the type by renaming. The signature is the only part of an upload the
 * uploader cannot trivially lie about, so it decides both acceptance and the
 * Content-Type used when serving.
 */
const MAGIC_SIGNATURES: Array<{
  mimeType: string;
  extension: string;
  test: (buffer: Buffer) => boolean;
}> = [
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extension: 'png',
    test: (b) =>
      b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  {
    mimeType: 'image/gif',
    extension: 'gif',
    test: (b) =>
      b.length > 6 &&
      (b.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        b.subarray(0, 6).toString('ascii') === 'GIF89a'),
  },
  {
    mimeType: 'image/webp',
    extension: 'webp',
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mimeType: 'application/pdf',
    extension: 'pdf',
    test: (b) => b.length > 4 && b.subarray(0, 4).toString('ascii') === '%PDF',
  },
];

/**
 * Plain text has no signature, so it is accepted only when the bytes contain no NUL
 * and decode as UTF-8. Archives (zip) and Office documents are deliberately not
 * accepted: they are containers whose contents cannot be validated here, and nothing
 * in the product requires them.
 */
function looksLikeUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return !decoded.includes('�');
}

export interface StoredAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

class MessageAttachmentService {
  private repository: Repository<MessageAttachment>;

  private getRepository(): Repository<MessageAttachment> {
    if (!this.repository) {
      this.repository = AppDataSource.getRepository(MessageAttachment);
    }
    return this.repository;
  }

  /**
   * Private storage root. Deliberately **not** under `uploads/`, which is served
   * statically by Express in development and aliased by nginx in production — the
   * whole defect being fixed here was that message attachments lived in a directory
   * anyone could read by URL.
   */
  public storageRoot(): string {
    return path.join(__dirname, '../../storage/message-attachments');
  }

  /** Where attachments used to be written, before they were made private. */
  private legacyStorageRoot(): string {
    return path.join(__dirname, '../../uploads/messages');
  }

  /**
   * Validate an uploaded buffer and persist it under an unguessable key.
   * The file is only written once its content has been accepted.
   */
  public async store(
    uploaderId: string,
    originalName: string,
    buffer: Buffer
  ): Promise<StoredAttachment> {
    if (!buffer || buffer.length === 0) {
      throw new AttachmentValidationError('File is empty');
    }

    const signature = MAGIC_SIGNATURES.find((candidate) => candidate.test(buffer));
    let mimeType: string;
    let extension: string;

    if (signature) {
      mimeType = signature.mimeType;
      extension = signature.extension;
    } else if (looksLikeUtf8Text(buffer)) {
      mimeType = 'text/plain';
      extension = 'txt';
    } else {
      throw new AttachmentValidationError('File type not allowed');
    }

    // 24 random bytes: not derived from the filename, timestamp or user id, so a
    // stored file cannot be located by guessing. The previous scheme was
    // `Date.now()-Math.random()` with the original extension, which is enumerable.
    const storageKey = `${crypto.randomBytes(24).toString('hex')}.${extension}`;

    const root = this.storageRoot();
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, storageKey), buffer, { mode: 0o600 });

    const saved = await this.getRepository().save(
      this.getRepository().create({
        storageKey,
        uploaderId,
        // Kept for display only. Never joined onto a filesystem path — the stored
        // name is the generated key, so a traversal payload here is inert.
        originalName: path.basename(originalName).slice(0, 255),
        mimeType,
        sizeBytes: buffer.length,
      })
    );

    return {
      id: saved.id,
      originalName: saved.originalName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
    };
  }

  /**
   * Resolve an attachment for a reader, enforcing access.
   *
   * Permitted when the caller uploaded it (covers the window between upload and the
   * message being sent) or participates in a conversation whose messages reference
   * it. Anything else raises AttachmentAccessError, which the controller renders as
   * 404 so the endpoint does not confirm that an attachment exists.
   */
  public async resolveForReader(
    attachmentId: string,
    readerId: string
  ): Promise<{ attachment: MessageAttachment }> {
    const attachment = await this.getRepository().findOne({ where: { id: attachmentId } });
    if (!attachment) {
      throw new AttachmentAccessError();
    }

    if (attachment.uploaderId !== readerId) {
      // Rows backfilled from the pre-privacy era (marked by sizeBytes = 0) carry a
      // best-guess uploader: the sender of the first message that referenced the
      // file. If the same file was shared by more than one person, anchoring on that
      // guess would lock out participants of the other conversations. For these rows
      // conversation membership alone is sufficient and safe, because
      // assertAttachmentsOwnedBy prevents any *new* message from referencing them —
      // so the only referencing messages are ones that already existed.
      const uploaderAnchor = attachment.sizeBytes > 0 ? attachment.uploaderId : null;
      const permitted = await this.readerParticipatesInReferencingConversation(
        attachmentId,
        readerId,
        uploaderAnchor
      );
      if (!permitted) {
        throw new AttachmentAccessError();
      }
    }

    return { attachment };
  }

  /**
   * True when the reader is a participant of a conversation where **the uploader**
   * shared this attachment.
   *
   * The `m."senderId" = uploaderId` condition is load-bearing. Without it, the check
   * trusts any message referencing the id — so anyone who learned an attachment id
   * could paste it into a message in their own conversation and thereby grant
   * themselves access. Anchoring to the uploader means only the person who owns the
   * file can decide where it is shared.
   *
   * `assertAttachmentsOwnedBy` blocks that at write time too; this is the second
   * layer, and the one that still holds for attachments written before it existed.
   */
  private async readerParticipatesInReferencingConversation(
    attachmentId: string,
    readerId: string,
    uploaderId: string | null
  ): Promise<boolean> {
    const reference = `/api/v1/messages/attachments/${attachmentId}`;
    const rows = await AppDataSource.query(
      `SELECT 1
         FROM messages m
         JOIN conversation_participants cp ON cp."conversationId" = m."conversationId"
        WHERE cp."userId" = $1
          AND ($2::uuid IS NULL OR m."senderId" = $2::uuid)
          AND m."attachments" @> $3::jsonb
        LIMIT 1`,
      [readerId, uploaderId, JSON.stringify([reference])]
    );
    return rows.length > 0;
  }

  /**
   * Reject any attachment reference the given user did not upload.
   *
   * Called before a message is stored. Non-attachment strings (legacy `/uploads/...`
   * paths already on old messages) are ignored so existing rows keep working.
   */
  public async assertAttachmentsOwnedBy(
    userId: string,
    attachments: string[] | undefined
  ): Promise<void> {
    if (!attachments || attachments.length === 0) return;

    const ids = attachments
      .map((url) => /^\/api\/v1\/messages\/attachments\/([0-9a-f-]{36})$/.exec(url)?.[1])
      .filter((id): id is string => Boolean(id));

    if (ids.length === 0) return;

    const owned = await this.getRepository().find({
      where: { id: In(ids), uploaderId: userId },
      select: ['id'],
    });

    if (owned.length !== new Set(ids).size) {
      throw new AttachmentValidationError('Attachment does not belong to this user');
    }
  }

  /**
   * Read an attachment's bytes, falling back to the pre-migration directory.
   *
   * Attachments uploaded before this became private still sit under `uploads/messages`.
   * They are no longer publicly served, so they are read from there on demand rather
   * than being migrated — which avoids a filesystem migration against a database that
   * development and production share.
   */
  public async readFile(attachment: MessageAttachment): Promise<Buffer> {
    const primary = path.join(this.storageRoot(), attachment.storageKey);
    try {
      return await fs.readFile(primary);
    } catch (error) {
      const legacy = path.join(this.legacyStorageRoot(), attachment.storageKey);
      try {
        return await fs.readFile(legacy);
      } catch {
        logger.error(`Attachment file missing for ${attachment.id}`, error);
        throw new AttachmentAccessError();
      }
    }
  }
}

export default new MessageAttachmentService();
