CREATE TABLE "auth_sessions" (
    "id" CHAR(64) NOT NULL,
    "encrypted" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions"("expires_at");
