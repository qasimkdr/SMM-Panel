CREATE TABLE `payment_methods` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`kind` enum('manual','binance_pay') NOT NULL DEFAULT 'manual',
	`brand` varchar(24) NOT NULL DEFAULT 'other',
	`currency` char(3) NOT NULL DEFAULT 'USD',
	`account_title` varchar(120),
	`account_number` varchar(128),
	`instructions` text,
	`min_amount` decimal(18,2) NOT NULL DEFAULT '1',
	`max_amount` decimal(18,2),
	`api_key_enc` varchar(512),
	`api_secret_enc` varchar(512),
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`sort` smallint NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_methods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_proofs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`mime` varchar(32) NOT NULL,
	`data` mediumblob NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `payment_proofs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `status` enum('pending','completed','failed','refunded','rejected') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `payments` ADD `method_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `payments` ADD `amount_local` decimal(18,2);--> statement-breakpoint
ALTER TABLE `payments` ADD `currency` char(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `proof_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `payments` ADD `user_note` varchar(255);--> statement-breakpoint
ALTER TABLE `payments` ADD `admin_note` varchar(255);--> statement-breakpoint
ALTER TABLE `payments` ADD `reviewed_by` bigint unsigned;--> statement-breakpoint
ALTER TABLE `payments` ADD `reviewed_at` timestamp;--> statement-breakpoint
CREATE INDEX `payment_methods_sort_idx` ON `payment_methods` (`status`,`sort`);--> statement-breakpoint
CREATE INDEX `payment_proofs_user_idx` ON `payment_proofs` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`,`id`);--> statement-breakpoint
CREATE INDEX `users_name_idx` ON `users` (`name`);