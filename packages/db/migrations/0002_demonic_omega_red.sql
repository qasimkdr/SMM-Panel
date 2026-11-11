CREATE TABLE `affiliate_earnings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`referrer_id` bigint unsigned NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`order_id` bigint unsigned NOT NULL,
	`amount` decimal(18,6) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `affiliate_earnings_id` PRIMARY KEY(`id`),
	CONSTRAINT `aff_earn_order_uq` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE INDEX `aff_earn_referrer_idx` ON `affiliate_earnings` (`referrer_id`,`id`);