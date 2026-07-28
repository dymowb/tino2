import { MigrationInterface, QueryRunner } from 'typeorm';

export class MemoryTables1777161600000 implements MigrationInterface {
  name = 'MemoryTables1777161600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension — idempotent
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // ── semantic_memories ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE semantic_memories (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL,
        content         TEXT NOT NULL,
        embedding       VECTOR(1024),
        confidence      FLOAT NOT NULL DEFAULT 0.8,
        importance      FLOAT NOT NULL DEFAULT 0.5,
        source_type     VARCHAR(20) NOT NULL DEFAULT 'extraction'
                          CHECK (source_type IN ('extraction','reflection','manual')),
        source_ref      TEXT,
        access_count    INT NOT NULL DEFAULT 0,
        last_accessed_at TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at      TIMESTAMPTZ,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        metadata        JSONB
      )
    `);

    // HNSW index for approximate nearest-neighbor search on cosine distance.
    // ef_construction=64, m=16 are safe defaults for <1M rows.
    // We use cosine distance (<=>), not L2, because embedding magnitudes vary.
    await queryRunner.query(`
      CREATE INDEX sem_mem_embedding_hnsw
        ON semantic_memories
        USING hnsw (embedding vector_cosine_ops)
        WITH (m=16, ef_construction=64)
    `);
    await queryRunner.query(
      `CREATE INDEX sem_mem_user_active ON semantic_memories (user_id, is_active)`
    );
    await queryRunner.query(
      `CREATE INDEX sem_mem_expires ON semantic_memories (expires_at) WHERE expires_at IS NOT NULL`
    );

    // ── episodic_memories ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE episodic_memories (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL,
        summary         TEXT NOT NULL,
        embedding       VECTOR(1024),
        workflow_id     TEXT,
        booking_id      UUID,
        importance      FLOAT NOT NULL DEFAULT 0.5,
        access_count    INT NOT NULL DEFAULT 0,
        occurred_at     TIMESTAMPTZ NOT NULL,
        last_accessed_at TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at      TIMESTAMPTZ,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        metadata        JSONB
      )
    `);

    await queryRunner.query(`
      CREATE INDEX epi_mem_embedding_hnsw
        ON episodic_memories
        USING hnsw (embedding vector_cosine_ops)
        WITH (m=16, ef_construction=64)
    `);
    await queryRunner.query(
      `CREATE INDEX epi_mem_user_active ON episodic_memories (user_id, is_active)`
    );
    await queryRunner.query(
      `CREATE INDEX epi_mem_occurred ON episodic_memories (user_id, occurred_at DESC)`
    );
    await queryRunner.query(
      `CREATE INDEX epi_mem_expires ON episodic_memories (expires_at) WHERE expires_at IS NOT NULL`
    );

    // ── procedural_rules ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE procedural_rules (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id                 UUID NOT NULL,
        rule_text               TEXT NOT NULL,
        prompt_fragment         TEXT NOT NULL,
        embedding               VECTOR(1024),
        confidence              FLOAT NOT NULL,
        status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','active','deprecated','rejected')),
        source_episode_ids      UUID[],
        version                 INT NOT NULL DEFAULT 1,
        auto_approved           BOOLEAN NOT NULL DEFAULT FALSE,
        approval_threshold_used FLOAT,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        activated_at            TIMESTAMPTZ,
        deprecated_at           TIMESTAMPTZ
      )
    `);

    await queryRunner.query(
      `CREATE INDEX proc_rules_user_status ON procedural_rules (user_id, status)`
    );

    // ── memory_retrieval_log ───────────────────────────────────────────────
    // Kept for 30 days — purely observability, not part of the memory store
    await queryRunner.query(`
      CREATE TABLE memory_retrieval_log (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL,
        query_text      TEXT NOT NULL,
        query_embedding VECTOR(1024),
        memory_type     VARCHAR(20) NOT NULL
                          CHECK (memory_type IN ('semantic','episodic','procedural','hybrid')),
        results         JSONB NOT NULL DEFAULT '[]',
        workflow_id     TEXT,
        retrieved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX ret_log_user ON memory_retrieval_log (user_id, retrieved_at DESC)`
    );

    // ── memory_write_log ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE memory_write_log (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           UUID NOT NULL,
        memory_type       VARCHAR(20) NOT NULL
                            CHECK (memory_type IN ('semantic','episodic','procedural')),
        action            VARCHAR(20) NOT NULL
                            CHECK (action IN ('created','merged','discarded','deprecated')),
        memory_id         UUID,
        source_content    TEXT NOT NULL,
        extracted_content TEXT,
        dedup_decision    JSONB,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX write_log_user ON memory_write_log (user_id, created_at DESC)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS memory_write_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS memory_retrieval_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS procedural_rules`);
    await queryRunner.query(`DROP TABLE IF EXISTS episodic_memories`);
    await queryRunner.query(`DROP TABLE IF EXISTS semantic_memories`);
    // Leave the vector extension — other tables may use it
  }
}
