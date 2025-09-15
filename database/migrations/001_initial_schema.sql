-- Tino 2 Database Migration 001: Initial Schema
-- This migration creates the foundational database schema for the domestic service platform

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE user_type AS ENUM ('customer', 'provider', 'admin');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
CREATE TYPE quote_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE quote_request_status AS ENUM ('open', 'closed', 'expired');
CREATE TYPE payment_status AS ENUM ('pending', 'requires_capture', 'succeeded', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE message_type AS ENUM ('text', 'image', 'file');
CREATE TYPE conversation_type AS ENUM ('direct', 'group');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    user_type user_type NOT NULL DEFAULT 'customer',
    is_email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    profile_picture VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_created ON users(created_at);

-- Providers table
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    description TEXT,
    services TEXT[], -- Array of service types
    service_areas TEXT[], -- Array of service areas
    hourly_rate DECIMAL(10,2),
    rating DECIMAL(3,2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    has_insurance BOOLEAN DEFAULT FALSE,
    has_background_check BOOLEAN DEFAULT FALSE,

    -- Location information
    address VARCHAR(500),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),

    -- Availability (JSON format for flexibility)
    availability JSONB,

    -- Portfolio images
    portfolio_images TEXT[],

    -- Business information
    license_number VARCHAR(100),
    insurance_policy_number VARCHAR(100),
    years_of_experience INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for providers
CREATE INDEX idx_providers_user_id ON providers(user_id);
CREATE INDEX idx_providers_services ON providers USING GIN(services);
CREATE INDEX idx_providers_service_areas ON providers USING GIN(service_areas);
CREATE INDEX idx_providers_location ON providers(latitude, longitude);
CREATE INDEX idx_providers_rating ON providers(rating);
CREATE INDEX idx_providers_verified ON providers(is_verified);

-- Quote requests table
CREATE TABLE quote_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,

    -- Location information
    address VARCHAR(500) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),

    -- Budget and timing
    budget_min DECIMAL(10,2),
    budget_max DECIMAL(10,2),
    preferred_date DATE,
    urgency VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent

    -- Additional requirements
    special_requirements TEXT,
    property_size VARCHAR(50),
    room_count INTEGER,

    -- Status and metadata
    status quote_request_status DEFAULT 'open',
    quotes_received INTEGER DEFAULT 0,
    expires_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for quote requests
CREATE INDEX idx_quote_requests_customer ON quote_requests(customer_id);
CREATE INDEX idx_quote_requests_service_type ON quote_requests(service_type);
CREATE INDEX idx_quote_requests_location ON quote_requests(latitude, longitude);
CREATE INDEX idx_quote_requests_status ON quote_requests(status);
CREATE INDEX idx_quote_requests_date ON quote_requests(preferred_date);

-- Quotes table
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

    -- Pricing breakdown
    labor_cost DECIMAL(10,2) NOT NULL,
    material_cost DECIMAL(10,2) DEFAULT 0,
    equipment_cost DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,

    -- Service details
    estimated_duration INTEGER, -- in minutes
    description TEXT NOT NULL,
    terms TEXT,

    -- Status and timing
    status quote_status DEFAULT 'pending',
    valid_until TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for quotes
CREATE INDEX idx_quotes_request_id ON quotes(quote_request_id);
CREATE INDEX idx_quotes_provider_id ON quotes(provider_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_total_amount ON quotes(total_amount);

-- Bookings table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES quotes(id),

    -- Service information
    service_type VARCHAR(100) NOT NULL,
    description TEXT,

    -- Scheduling
    scheduled_date TIMESTAMP NOT NULL,
    estimated_duration INTEGER, -- in minutes
    actual_start_time TIMESTAMP,
    actual_end_time TIMESTAMP,

    -- Location
    address VARCHAR(500) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Pricing
    total_amount DECIMAL(10,2) NOT NULL,
    platform_fee DECIMAL(10,2),
    provider_amount DECIMAL(10,2),

    -- Status and notes
    status booking_status DEFAULT 'pending',
    customer_notes TEXT,
    provider_notes TEXT,
    cancellation_reason TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for bookings
CREATE INDEX idx_bookings_customer_id ON bookings(customer_id);
CREATE INDEX idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_scheduled_date ON bookings(scheduled_date);
CREATE INDEX idx_bookings_created_at ON bookings(created_at);

-- Payments table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

    -- Payment details
    amount DECIMAL(10,2) NOT NULL,
    platform_fee DECIMAL(10,2) NOT NULL,
    provider_amount DECIMAL(10,2) NOT NULL,

    -- Stripe integration
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    stripe_charge_id VARCHAR(255),
    payment_method_id VARCHAR(255),

    -- Status and processing
    status payment_status DEFAULT 'pending',
    currency VARCHAR(3) DEFAULT 'USD',

    -- Refund information
    refund_amount DECIMAL(10,2),
    refund_reason TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    refunded_at TIMESTAMP
);

-- Create indexes for payments
CREATE INDEX idx_payments_booking_id ON payments(booking_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_provider_id ON payments(provider_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_stripe_intent ON payments(stripe_payment_intent_id);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

    -- Rating information
    rating DECIMAL(3,2) NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,

    -- Multi-criteria ratings
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    timeliness_rating INTEGER CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
    communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
    professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
    value_rating INTEGER CHECK (value_rating >= 1 AND value_rating <= 5),

    -- Additional information
    photos TEXT[], -- Array of photo URLs
    is_anonymous BOOLEAN DEFAULT FALSE,
    is_flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,

    -- Provider response
    provider_response TEXT,
    provider_response_date TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for reviews
CREATE INDEX idx_reviews_booking_id ON reviews(booking_id);
CREATE INDEX idx_reviews_customer_id ON reviews(customer_id);
CREATE INDEX idx_reviews_provider_id ON reviews(provider_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_created_at ON reviews(created_at);

-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type conversation_type DEFAULT 'direct',
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for conversations
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_updated ON conversations(updated_at);

-- Conversation participants table
CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP,

    UNIQUE(conversation_id, user_id)
);

-- Create indexes for conversation participants
CREATE INDEX idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Message content
    content TEXT NOT NULL,
    message_type message_type DEFAULT 'text',
    attachments TEXT[], -- Array of file URLs

    -- Message threading
    reply_to_id UUID REFERENCES messages(id),

    -- Status
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for messages
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_reply_to ON messages(reply_to_id);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Notification content
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- booking, payment, review, message, system, promotion
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent

    -- Related entities
    entity_type VARCHAR(50), -- booking, quote, payment, review, message
    entity_id UUID,

    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,

    -- Delivery channels
    email_sent BOOLEAN DEFAULT FALSE,
    sms_sent BOOLEAN DEFAULT FALSE,
    push_sent BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Create indexes for notifications
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Notification preferences table
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Channel preferences
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,

    -- Category preferences
    booking_notifications BOOLEAN DEFAULT TRUE,
    quote_notifications BOOLEAN DEFAULT TRUE,
    payment_notifications BOOLEAN DEFAULT TRUE,
    review_notifications BOOLEAN DEFAULT TRUE,
    message_notifications BOOLEAN DEFAULT TRUE,
    system_notifications BOOLEAN DEFAULT TRUE,
    promotion_notifications BOOLEAN DEFAULT FALSE,

    -- Quiet hours
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    quiet_hours_timezone VARCHAR(50),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id)
);

-- Create indexes for notification preferences
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Admin audit log table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for audit logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- System settings table
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for system settings
CREATE INDEX idx_system_settings_key ON system_settings(key);

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
('platform_fee_percentage', '15', 'Platform fee percentage (15%)'),
('max_booking_advance_days', '90', 'Maximum days in advance to book services'),
('review_edit_window_hours', '168', 'Hours customers can edit reviews (7 days)'),
('review_delete_window_hours', '24', 'Hours customers can delete reviews'),
('quote_validity_days', '7', 'Default quote validity period in days'),
('email_verification_required', 'true', 'Require email verification for new accounts'),
('max_file_upload_size_mb', '10', 'Maximum file upload size in MB'),
('maintenance_mode', 'false', 'System maintenance mode flag');

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quote_requests_updated_at BEFORE UPDATE ON quote_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries

-- Provider summary view
CREATE VIEW provider_summary AS
SELECT
    p.id,
    p.user_id,
    u.first_name,
    u.last_name,
    u.email,
    p.business_name,
    p.description,
    p.services,
    p.service_areas,
    p.hourly_rate,
    p.rating,
    p.review_count,
    p.is_verified,
    p.has_insurance,
    p.has_background_check,
    p.address,
    p.city,
    p.state,
    p.latitude,
    p.longitude,
    p.created_at
FROM providers p
JOIN users u ON p.user_id = u.id;

-- Booking summary view
CREATE VIEW booking_summary AS
SELECT
    b.id,
    b.customer_id,
    c.first_name AS customer_first_name,
    c.last_name AS customer_last_name,
    b.provider_id,
    p.business_name AS provider_business_name,
    b.service_type,
    b.scheduled_date,
    b.total_amount,
    b.status,
    b.address,
    b.created_at
FROM bookings b
JOIN users c ON b.customer_id = c.id
JOIN providers p ON b.provider_id = p.id;

-- Review summary view
CREATE VIEW review_summary AS
SELECT
    r.id,
    r.booking_id,
    r.customer_id,
    c.first_name AS customer_first_name,
    c.last_name AS customer_last_name,
    r.provider_id,
    p.business_name AS provider_business_name,
    r.rating,
    r.title,
    r.comment,
    r.quality_rating,
    r.timeliness_rating,
    r.communication_rating,
    r.professionalism_rating,
    r.value_rating,
    r.is_anonymous,
    r.provider_response,
    r.created_at
FROM reviews r
JOIN users c ON r.customer_id = c.id
JOIN providers p ON r.provider_id = p.id;

-- Grant permissions (adjust based on your user setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tino2_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tino2_user;