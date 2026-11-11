ALTER TABLE `users` MODIFY COLUMN `two_factor_secret` varchar(255);--> statement-breakpoint
ALTER TABLE `child_panels` ADD `auto_renew` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `child_panels` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `affiliate_credited` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `two_factor_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `recovery_codes` json;--> statement-breakpoint
ALTER TABLE `users` ADD `email_prefs` json;