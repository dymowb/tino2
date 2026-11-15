import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefundOperations1781600000000 implements MigrationInterface {
  name = 'CreateRefundOperations1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refund_operations" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "idempotencyKey" varchar(255) NOT NULL,
        "paymentId" uuid NOT NULL,
        "requestedBy" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "fullRefund" boolean NOT NULL DEFAULT false,
        "currency" varchar(3) NOT NULL,
        "reason" text,
        "status" varchar NOT NULL DEFAULT 'pending',
        "stripeRefundId" varchar,
        "attemptCount" int NOT NULL DEFAULT 0,
        "lastAttemptAt" timestamptz,
        "completedAt" timestamptz,
        "errorMessage" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_refund_operations_idempotency_key" UNIQUE ("idempotencyKey"),
        CONSTRAINT "FK_refund_operations_payment" FOREIGN KEY ("paymentId")
          REFERENCES "payments"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_refund_operations_requester" FOREIGN KEY ("requestedBy")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_refund_operations_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "CHK_refund_operations_status" CHECK
          ("status" IN ('pending', 'indeterminate', 'succeeded', 'failed'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refund_operations_payment_status"
        ON "refund_operations" ("paymentId", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_refund_operations_stripe_refund"
        ON "refund_operations" ("stripeRefundId") WHERE "stripeRefundId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_operations_stripe_refund"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refund_operations_payment_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_operations"`);
  }
}
