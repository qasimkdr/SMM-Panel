CREATE TABLE `admin_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`actor_id` bigint unsigned NOT NULL,
	`action` varchar(64) NOT NULL,
	`target_type` varchar(32),
	`target_id` varchar(64),
	`meta` json,
	`ip` varchar(45),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `admin_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `affiliate_payouts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`amount` decimal(18,6) NOT NULL,
	`method` enum('balance','external') NOT NULL DEFAULT 'balance',
	`details` varchar(255),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_payouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `affiliate_visits` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`ip_hash` char(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `affiliate_visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`kind` enum('banner','popup','news') NOT NULL DEFAULT 'news',
	`active` boolean NOT NULL DEFAULT true,
	`starts_at` timestamp,
	`ends_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `canned_replies` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(80) NOT NULL,
	`body` text NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `canned_replies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`platform` varchar(24) NOT NULL DEFAULT 'other',
	`description` text,
	`markup` decimal(7,2),
	`sort` int NOT NULL DEFAULT 0,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `child_panels` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`domain` varchar(191) NOT NULL,
	`currency` char(3) NOT NULL DEFAULT 'USD',
	`admin_username` varchar(32) NOT NULL,
	`price` decimal(18,6) NOT NULL,
	`status` enum('pending','active','suspended','canceled') NOT NULL DEFAULT 'pending',
	`expires_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `child_panels_id` PRIMARY KEY(`id`),
	CONSTRAINT `child_panels_domain_uq` UNIQUE(`domain`)
);
--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`coupon_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`amount` decimal(18,6) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `coupon_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`kind` enum('balance','deposit_bonus') NOT NULL DEFAULT 'balance',
	`value_type` enum('fixed','percent') NOT NULL DEFAULT 'fixed',
	`value` decimal(18,6) NOT NULL,
	`max_uses` int,
	`used` int NOT NULL DEFAULT 0,
	`per_user_limit` smallint NOT NULL DEFAULT 1,
	`expires_at` timestamp,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` char(3) NOT NULL,
	`name` varchar(48) NOT NULL,
	`symbol` varchar(8) NOT NULL,
	`rate` decimal(20,8) NOT NULL DEFAULT '1',
	`auto_rate` boolean NOT NULL DEFAULT true,
	`decimals` tinyint NOT NULL DEFAULT 2,
	`enabled` boolean NOT NULL DEFAULT true,
	`sort` smallint NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `currencies_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `email_tokens` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`type` enum('verify','reset') NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `email_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_tokens_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`user_id` bigint unsigned NOT NULL,
	`service_id` bigint unsigned NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `favorites_user_id_service_id_pk` PRIMARY KEY(`user_id`,`service_id`)
);
--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`success` boolean NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `login_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`kind` varchar(32) NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` varchar(500),
	`href` varchar(255),
	`read_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`service_id` bigint unsigned NOT NULL,
	`provider_id` bigint unsigned,
	`provider_order_id` varchar(64),
	`link` varchar(1024) NOT NULL,
	`quantity` int NOT NULL,
	`charge` decimal(18,6) NOT NULL,
	`provider_cost` decimal(18,6),
	`profit` decimal(18,6),
	`refunded` decimal(18,6) NOT NULL DEFAULT '0',
	`start_count` int,
	`remains` int,
	`status` enum('pending','processing','in_progress','completed','partial','canceled','fail') NOT NULL DEFAULT 'pending',
	`mode` enum('auto','manual') NOT NULL DEFAULT 'auto',
	`runs` smallint,
	`interval_min` smallint,
	`extra` json,
	`error` varchar(500),
	`via_api` boolean NOT NULL DEFAULT false,
	`idempotency_key` varchar(64),
	`scheduled_at` timestamp,
	`completed_at` timestamp,
	`last_checked_at` timestamp,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_idem_uq` UNIQUE(`user_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`slug` varchar(64) NOT NULL,
	`title` varchar(160) NOT NULL,
	`content` text NOT NULL,
	`meta_title` varchar(160),
	`meta_description` varchar(320),
	`published` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pages_slug` PRIMARY KEY(`slug`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`gateway` varchar(32) NOT NULL,
	`amount` decimal(18,6) NOT NULL,
	`fee` decimal(18,6) NOT NULL DEFAULT '0',
	`bonus` decimal(18,6) NOT NULL DEFAULT '0',
	`external_id` varchar(128),
	`status` enum('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
	`meta` json,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_ext_uq` UNIQUE(`gateway`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `price_changes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`service_id` bigint unsigned,
	`scope` enum('service','category','provider','global') NOT NULL,
	`scope_id` bigint unsigned,
	`old_value` varchar(32),
	`new_value` varchar(32),
	`field` enum('markup','provider_rate','sell_rate') NOT NULL,
	`source` enum('admin','sync') NOT NULL,
	`actor_id` bigint unsigned,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `price_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`api_url` varchar(255) NOT NULL,
	`api_key_enc` text NOT NULL,
	`driver` enum('v2','custom') NOT NULL DEFAULT 'v2',
	`driver_config` json,
	`markup` decimal(7,2),
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`balance` decimal(18,6),
	`currency` char(3) NOT NULL DEFAULT 'USD',
	`low_balance_alert` decimal(18,6),
	`sync_enabled` boolean NOT NULL DEFAULT true,
	`sync_interval_min` smallint NOT NULL DEFAULT 180,
	`last_sync_at` timestamp,
	`error_count` int NOT NULL DEFAULT 0,
	`last_error` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `providers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refills` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`provider_refill_id` varchar(64),
	`status` enum('pending','in_progress','completed','rejected','fail') NOT NULL DEFAULT 'pending',
	`error` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `refills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`category_id` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`type` varchar(32) NOT NULL DEFAULT 'default',
	`mode` enum('auto','manual') NOT NULL DEFAULT 'auto',
	`provider_id` bigint unsigned,
	`provider_service_id` varchar(64),
	`provider_rate` decimal(18,6),
	`markup` decimal(7,2),
	`sell_rate` decimal(18,6) NOT NULL,
	`min_qty` int NOT NULL DEFAULT 10,
	`max_qty` int NOT NULL DEFAULT 100000,
	`refill` boolean NOT NULL DEFAULT false,
	`refill_days` smallint NOT NULL DEFAULT 0,
	`cancel` boolean NOT NULL DEFAULT false,
	`dripfeed` boolean NOT NULL DEFAULT false,
	`avg_time_sec` int,
	`badges` json,
	`keep_custom_name` boolean NOT NULL DEFAULT false,
	`backup_provider_id` bigint unsigned,
	`backup_provider_service_id` varchar(64),
	`sort` int NOT NULL DEFAULT 0,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(64) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`scope` enum('user','admin') NOT NULL DEFAULT 'user',
	`ip` varchar(45),
	`user_agent` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_used_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(64) NOT NULL,
	`value` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `ticket_messages` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`ticket_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`is_staff` boolean NOT NULL DEFAULT false,
	`body` text NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ticket_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`subject` varchar(160) NOT NULL,
	`topic` enum('order','payment','refill','cancel','api','other') NOT NULL DEFAULT 'other',
	`order_ids` varchar(255),
	`status` enum('open','answered','customer_reply','closed') NOT NULL DEFAULT 'open',
	`assigned_to` bigint unsigned,
	`last_reply_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`type` enum('deposit','order','refund','admin_add','admin_deduct','affiliate_commission','affiliate_withdraw','coupon','bonus','child_panel') NOT NULL,
	`amount` decimal(18,6) NOT NULL,
	`balance_after` decimal(18,6) NOT NULL,
	`ref_type` varchar(24),
	`ref_id` bigint unsigned,
	`note` varchar(255),
	`actor_id` bigint unsigned,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`username` varchar(32) NOT NULL,
	`email` varchar(191) NOT NULL,
	`name` varchar(80),
	`password_hash` varchar(255),
	`google_id` varchar(64),
	`role` enum('user','staff','admin') NOT NULL DEFAULT 'user',
	`permissions` json,
	`status` enum('active','banned') NOT NULL DEFAULT 'active',
	`ban_reason` varchar(255),
	`balance` decimal(18,6) NOT NULL DEFAULT '0',
	`spent` decimal(18,6) NOT NULL DEFAULT '0',
	`affiliate_balance` decimal(18,6) NOT NULL DEFAULT '0',
	`currency` char(3) NOT NULL DEFAULT 'USD',
	`timezone` varchar(64) NOT NULL DEFAULT 'UTC',
	`vip_tier_id` bigint unsigned,
	`vip_locked` boolean NOT NULL DEFAULT false,
	`custom_discount` decimal(7,2),
	`api_key` char(48),
	`api_enabled` boolean NOT NULL DEFAULT true,
	`referral_code` varchar(16) NOT NULL,
	`referred_by` bigint unsigned,
	`two_factor_secret` varchar(128),
	`email_verified_at` timestamp,
	`last_login_at` timestamp,
	`last_login_ip` varchar(45),
	`notes` text,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`),
	CONSTRAINT `users_username_uq` UNIQUE(`username`),
	CONSTRAINT `users_api_key_uq` UNIQUE(`api_key`),
	CONSTRAINT `users_referral_uq` UNIQUE(`referral_code`),
	CONSTRAINT `users_google_uq` UNIQUE(`google_id`)
);
--> statement-breakpoint
CREATE TABLE `vip_tiers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(48) NOT NULL,
	`min_spent` decimal(18,6) NOT NULL DEFAULT '0',
	`discount` decimal(7,2) NOT NULL DEFAULT '0',
	`color` varchar(16) NOT NULL DEFAULT '#8a857c',
	`sort` smallint NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `vip_tiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `admin_logs_actor_idx` ON `admin_logs` (`actor_id`,`id`);--> statement-breakpoint
CREATE INDEX `admin_logs_target_idx` ON `admin_logs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `aff_payouts_user_idx` ON `affiliate_payouts` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `aff_payouts_status_idx` ON `affiliate_payouts` (`status`);--> statement-breakpoint
CREATE INDEX `aff_visits_user_idx` ON `affiliate_visits` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `categories_sort_idx` ON `categories` (`status`,`sort`);--> statement-breakpoint
CREATE INDEX `child_panels_user_idx` ON `child_panels` (`user_id`);--> statement-breakpoint
CREATE INDEX `coupon_red_idx` ON `coupon_redemptions` (`coupon_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `email_tokens_user_idx` ON `email_tokens` (`user_id`,`type`);--> statement-breakpoint
CREATE INDEX `login_events_user_idx` ON `login_events` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `login_events_ip_idx` ON `login_events` (`ip`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`read_at`,`id`);--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `orders_user_status_idx` ON `orders` (`user_id`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `orders_status_provider_idx` ON `orders` (`status`,`provider_id`,`last_checked_at`);--> statement-breakpoint
CREATE INDEX `orders_provider_order_idx` ON `orders` (`provider_id`,`provider_order_id`);--> statement-breakpoint
CREATE INDEX `orders_service_created_idx` ON `orders` (`service_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `payments_user_idx` ON `payments` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `price_changes_service_idx` ON `price_changes` (`service_id`,`id`);--> statement-breakpoint
CREATE INDEX `refills_order_idx` ON `refills` (`order_id`);--> statement-breakpoint
CREATE INDEX `refills_user_idx` ON `refills` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `refills_status_idx` ON `refills` (`status`);--> statement-breakpoint
CREATE INDEX `services_cat_idx` ON `services` (`category_id`,`status`,`sort`);--> statement-breakpoint
CREATE INDEX `services_provider_idx` ON `services` (`provider_id`,`provider_service_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `ticket_msgs_ticket_idx` ON `ticket_messages` (`ticket_id`,`id`);--> statement-breakpoint
CREATE INDEX `tickets_user_idx` ON `tickets` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`,`last_reply_at`);--> statement-breakpoint
CREATE INDEX `tx_user_idx` ON `transactions` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `tx_type_created_idx` ON `transactions` (`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `users_referred_by_idx` ON `users` (`referred_by`);--> statement-breakpoint
CREATE INDEX `users_created_idx` ON `users` (`created_at`);