CREATE TABLE `cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`caseId` varchar(255) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('open','closed','archived') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `cases_caseId_unique` UNIQUE(`caseId`)
);
--> statement-breakpoint
CREATE TABLE `notificationLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('processing_complete','processing_error','quality_alert','system_alert') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`relatedProcessingId` int,
	`sent` int NOT NULL DEFAULT 0,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notificationLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processingHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`caseId` varchar(255),
	`sampleId` varchar(255),
	`originalImageUrl` varchar(512) NOT NULL,
	`processedImageUrl` varchar(512),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`promptVersion` varchar(64),
	`promptText` text,
	`originalWidth` int,
	`originalHeight` int,
	`originalSizeBytes` int,
	`originalFormat` varchar(32),
	`originalFilename` varchar(255),
	`processingTimeMs` int,
	`qualityMetrics` text,
	`llmAnalysis` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `processingHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `samples` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`sampleId` varchar(255) NOT NULL,
	`fingerPosition` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `samples_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cases` ADD CONSTRAINT `cases_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notificationLog` ADD CONSTRAINT `notificationLog_relatedProcessingId_processingHistory_id_fk` FOREIGN KEY (`relatedProcessingId`) REFERENCES `processingHistory`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processingHistory` ADD CONSTRAINT `processingHistory_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `samples` ADD CONSTRAINT `samples_caseId_cases_id_fk` FOREIGN KEY (`caseId`) REFERENCES `cases`(`id`) ON DELETE no action ON UPDATE no action;