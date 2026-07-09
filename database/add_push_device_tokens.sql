CREATE TABLE IF NOT EXISTS push_device_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    platform VARCHAR(20) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    device_id VARCHAR(255),
    app_version VARCHAR(50),
    locale VARCHAR(16),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user_id
ON push_device_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_active
ON push_device_tokens (user_id, is_active)
WHERE is_active = TRUE;