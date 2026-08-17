import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './User';

/**
 * A file uploaded for use in a message.
 *
 * Exists as its own table because an attachment is authorised twice over its life:
 * between upload and send it belongs only to its uploader, and after send it belongs
 * to everyone in the conversation that references it. Without a record of who
 * uploaded what, the window before the message is sent has no owner to check.
 *
 * It also pins the **verified** MIME type. Serving a Content-Type derived from the
 * request rather than from the file's own signature is how an "image" ends up being
 * interpreted as HTML by a browser.
 */
@Entity('message_attachments')
export class MessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Filename on disk — unguessable, generated from a CSPRNG. Distinct from `id` so
   * that knowing a database id does not reveal the storage path, and so the file can
   * be relocated without rewriting message bodies.
   */
  @Index({ unique: true })
  @Column()
  storageKey: string;

  @Column({ type: 'uuid' })
  uploaderId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaderId' })
  uploader: User;

  /** As supplied by the client. Never used to build a filesystem path. */
  @Column()
  originalName: string;

  /** Determined by inspecting the file's magic bytes, not the request. */
  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @CreateDateColumn()
  createdAt: Date;
}
