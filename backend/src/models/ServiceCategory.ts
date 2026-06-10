import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Canonical service taxonomy. Groups the specific provider services into categories
 * and powers fuzzy resolution of a free-form request `serviceType` → category.
 * Seeded from `data/serviceCatalog.ts`; loaded at runtime by ServiceCategoryService.
 */
@Entity('service_categories')
export class ServiceCategory {
  @PrimaryColumn()
  category: string;            // canonical key, e.g. 'plumbing'

  @Column()
  labelPt: string;

  @Column()
  labelEn: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  aliases: string[];           // lowercased fuzzy-match tokens

  @Column({ type: 'jsonb', default: () => "'[]'" })
  services: string[];          // specific services belonging to this category

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
