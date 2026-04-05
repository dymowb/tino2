import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn()
  key: string;

  @Column('text')
  value: string;

  @Column({ nullable: true })
  description: string;

  @UpdateDateColumn()
  updatedAt: Date;

  // Typed accessor — avoids scattered parseInt/parseFloat calls at each use site
  getValue<T extends string | number | boolean>(): T {
    if (this.value === 'true') return true as T;
    if (this.value === 'false') return false as T;
    const num = Number(this.value);
    if (!isNaN(num)) return num as T;
    return this.value as T;
  }
}
